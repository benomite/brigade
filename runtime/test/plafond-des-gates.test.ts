// Le plafond de durée des gates : le vrai `.claude/brigade/gates.sh` de ce
// dépôt, joué sur un projet d'essai. Le projet n'a ni manifest ni dépôt git, les
// autres étapes y sont donc rouges — seul le plafond est regardé ici.
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdirSync, symlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { describe, test, type TestContext } from "node:test";
import { jouerGates } from "../src/gates.ts";
import { ENV_ENFANT, repertoireTemporaire } from "./outils.ts";

const GATES = join(import.meta.dirname, "../../.claude/brigade/gates.sh");

// `suite` est la commande de test du projet d'essai : c'est elle que les gates
// mesurent.
function projet(t: TestContext, { binding, suite = "true" }: { binding?: string; suite?: string }): string {
  const racine = repertoireTemporaire(t);
  mkdirSync(join(racine, "runtime"));
  writeFileSync(join(racine, "runtime/package.json"), JSON.stringify({ scripts: { test: suite } }));
  writeFileSync(
    join(racine, "CLAUDE.md"),
    ["## Équipe multi-agents (plugin brigade)", "", "- **Branche d'intégration** : `main`", ...(binding ? [binding] : [])].join("\n") + "\n",
  );
  return racine;
}

// Les deux canaux des gates sont lus par un seul tube : lus par deux, l'ordre de
// leurs lignes ne serait tenu que canal par canal.
function jouer(racine: string): Promise<{ lignes: string[]; sortie: string }> {
  return new Promise((resoudre, rejeter) => {
    const gates = spawn("bash", ["-c", 'exec bash "$0" "$1" 2>&1', GATES, racine], { env: ENV_ENFANT, stdio: ["ignore", "pipe", "ignore"] });
    let sortie = "";
    gates.stdout.on("data", (morceau: Buffer) => (sortie += morceau.toString()));
    gates.on("error", rejeter);
    gates.on("close", () => resoudre({ lignes: sortie.split("\n"), sortie }));
  });
}

const duPlafond = (lignes: string[]) => lignes.filter((ligne) => /plafond|durée des gates/.test(ligne));

// La ligne `durée des gates :` : ce qui est compté (le processeur, et son partage
// entre utilisateur et système), puis ce qui ne l'est pas et aide à le lire —
// l'horloge, la charge du poste.
const MESURE = String.raw`durée des gates : \d+,\d s de processeur \(\d+,\d utilisateur \+ \d+,\d système\), \d+ s d'horloge, charge du poste (?:\d+,\d+|inconnue)`;
function releve(ligne: string): { processeur: number; utilisateur: number; systeme: number; horloge: number } {
  const lu = /durée des gates : (\d+),(\d) s de processeur \((\d+),(\d) utilisateur \+ (\d+),(\d) système\), (\d+) s d'horloge/.exec(ligne);
  assert.ok(lu, ligne);
  const [processeur, utilisateur, systeme] = [1, 3, 5].map((i) => Number(`${lu[i]}.${lu[i + 1]}`)) as [number, number, number];
  return { processeur, utilisateur, systeme, horloge: Number(lu[7]) };
}

// Une suite qui calcule : deux secondes de processeur.
const CALCULE = `node -e "while (process.cpuUsage().user < 2e6) for (let i = 0; i < 1e7; i++);"`;

// Chaque test a son projet : ils se jouent de front.
describe("le plafond de durée des gates", { concurrency: 8 }, () => {
  test("sans plafond déclaré, les gates disent ce qu'elles ont coûté et ne jugent pas", async (t) => {
    const { lignes } = await jouer(projet(t, {}));

    assert.equal(duPlafond(lignes).length, 1);
    assert.match(duPlafond(lignes)[0] ?? "", new RegExp(`^ok {4}${MESURE} \\(aucun plafond déclaré\\)$`));
  });

  test("sous le plafond déclaré, la durée est verte et rappelle le plafond", async (t) => {
    const { lignes } = await jouer(projet(t, { binding: "- **Plafond des gates** : `600 s` de processeur" }));

    assert.equal(duPlafond(lignes).length, 1);
    assert.match(duPlafond(lignes)[0] ?? "", new RegExp(`^ok {4}${MESURE} \\(plafond : 600 s\\)$`));
  });

  test("le compte est le processeur entier : utilisateur et système, dont la ligne donne le partage", async (t) => {
    const { processeur, utilisateur, systeme } = releve(duPlafond((await jouer(projet(t, { suite: CALCULE }))).lignes)[0] ?? "");

    assert.ok(utilisateur >= 2, `utilisateur : ${utilisateur}`);
    // Chaque nombre est arrondi au dixième pour son compte.
    assert.ok(Math.abs(processeur - (utilisateur + systeme)) < 0.15, `${processeur} ≠ ${utilisateur} + ${systeme}`);
  });

  test("le plafond franchi rougit, et dit de combien", async (t) => {
    // Aucun passage de gates ne tient en un centième de seconde de processeur.
    const { lignes } = await jouer(projet(t, { binding: "- **Plafond des gates** : `0,01 s` de processeur" }));

    // La ligne FAIL ne porte aucune mesure : le hook d'arrêt en tire l'empreinte
    // de l'échec, qui doit rester la même d'un passage au suivant.
    assert.ok(lignes.includes("FAIL  plafond des gates franchi : plus de 0,01 s de processeur"), lignes.join("\n"));
    const detail = lignes.find((ligne) => ligne.startsWith("durée des gates : "));
    assert.match(detail ?? "", new RegExp(String.raw`^${MESURE} pour un plafond de 0,01 s — \d+,\d s de trop \(\+\d+ %\)$`));
    assert.equal(lignes.at(-2), "gates : ROUGE");
  });

  test("ce que la pass lit d'un plafond franchi est ce que ces gates écrivent : le dépassement, mis à part de leurs échecs", async (t) => {
    const racine = projet(t, { binding: "- **Plafond des gates** : `0,01 s` de processeur" });
    mkdirSync(join(racine, ".claude/brigade"), { recursive: true });
    symlinkSync(GATES, join(racine, ".claude/brigade/gates.sh"));

    const gates = await jouerGates({ worktree: racine, ticket: 17, env: ENV_ENFANT, delaiMs: 600_000 });

    assert.equal(gates.overCeiling?.limitSeconds, 0.01, gates.tail);
    assert.ok((gates.overCeiling?.cpuSeconds ?? 0) > 0.01, gates.tail);
    assert.match(gates.overCeiling?.line ?? "", new RegExp(`^${MESURE} pour un plafond de 0,01 s — `));
    // Le projet d'essai est rouge par ailleurs : le plafond n'y est pas le seul rouge.
    assert.equal(gates.outcome, "red");
    assert.ok(gates.failures.length > 0 && !gates.failures.some((echec) => /plafond des gates franchi/.test(echec)), gates.failures.join("\n"));
  });

  test("une suite qui grossit franchit le plafond : ce qu'elle calcule est compté", async (t) => {
    // Les gates d'un projet d'essai coûtent quelques dixièmes de seconde : sous
    // ce plafond sans la suite, au-dessus avec elle.
    const { lignes } = await jouer(projet(t, { binding: "- **Plafond des gates** : `1,5 s` de processeur", suite: CALCULE }));

    assert.ok(lignes.includes("FAIL  plafond des gates franchi : plus de 1,5 s de processeur"), lignes.join("\n"));
    assert.ok(releve(lignes.find((ligne) => ligne.startsWith("durée des gates : ")) ?? "").processeur >= 2);
  });

  test("le plafond compte le processeur, pas l'horloge : une suite qui attend ne le franchit pas", async (t) => {
    // Quatre secondes d'horloge pour un plafond de trois.
    const { lignes } = await jouer(projet(t, { binding: "- **Plafond des gates** : `3 s` de processeur", suite: "sleep 4" }));

    const ligne = duPlafond(lignes)[0] ?? "";
    assert.match(ligne, /^ok {4}durée des gates : .*\(plafond : 3 s\)$/);
    assert.ok(releve(ligne).horloge >= 4, ligne);
  });

  test("un plafond déclaré mais illisible rougit, au lieu de passer pour absent", async (t) => {
    const { lignes } = await jouer(projet(t, { binding: "- **Plafond des gates** : une dizaine de secondes" }));

    assert.ok(lignes.some((ligne) => ligne.startsWith("FAIL  plafond des gates illisible dans CLAUDE.md")), lignes.join("\n"));
  });
});
