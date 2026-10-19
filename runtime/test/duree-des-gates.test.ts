// La durée que les gates impriment : le vrai `.claude/brigade/gates.sh` de ce
// dépôt, joué sur un projet d'essai. Le projet n'a ni manifest ni dépôt git, les
// autres étapes y sont donc rouges — seule la ligne de durée est regardée ici.
// C'est une mesure : elle ne juge rien.
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { describe, test, type TestContext } from "node:test";
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

const deLaDuree = (lignes: string[]) => lignes.filter((ligne) => /plafond|durée des gates/.test(ligne));

// La ligne `durée des gates :` : le processeur et son partage entre utilisateur
// et système, l'horloge, la charge du poste.
const MEASURE = String.raw`durée des gates : \d+,\d s de processeur \(\d+,\d utilisateur \+ \d+,\d système\), \d+ s d'horloge, charge du poste (?:\d+,\d+|inconnue)`;
function releve(ligne: string): { processeur: number; utilisateur: number; systeme: number; horloge: number } {
  const lu = /durée des gates : (\d+),(\d) s de processeur \((\d+),(\d) utilisateur \+ (\d+),(\d) système\), (\d+) s d'horloge/.exec(ligne);
  assert.ok(lu, ligne);
  const [processeur, utilisateur, systeme] = [1, 3, 5].map((i) => Number(`${lu[i]}.${lu[i + 1]}`)) as [number, number, number];
  return { processeur, utilisateur, systeme, horloge: Number(lu[7]) };
}

// Une suite qui calcule : deux secondes de processeur.
const CALCULE = `node -e "while (process.cpuUsage().user < 2e6) for (let i = 0; i < 1e7; i++);"`;

// Chaque test a son projet : ils se jouent de front.
describe("la durée des gates", { concurrency: 8 }, () => {
  test("les gates disent ce qu'elles ont coûté, et ne jugent pas leur durée — même si le projet déclare un plafond", async (t) => {
    for (const binding of [undefined, "- **Plafond des gates** : `0,01 s` de processeur"]) {
      const { lignes } = await jouer(projet(t, { binding }));

      assert.equal(deLaDuree(lignes).length, 1, lignes.join("\n"));
      assert.match(deLaDuree(lignes)[0] ?? "", new RegExp(`^ok {4}${MEASURE}$`));
    }
  });

  test("le compte est le processeur entier : utilisateur et système, dont la ligne donne le partage", async (t) => {
    const { processeur, utilisateur, systeme } = releve(deLaDuree((await jouer(projet(t, { suite: CALCULE }))).lignes)[0] ?? "");

    assert.ok(utilisateur >= 2, `utilisateur : ${utilisateur}`);
    // Chaque nombre est arrondi au dixième pour son compte.
    assert.ok(Math.abs(processeur - (utilisateur + systeme)) < 0.15, `${processeur} ≠ ${utilisateur} + ${systeme}`);
  });

  test("une étape qui plante au lieu de rapporter écrit sa ligne FAIL : aucun rouge de ces gates n'est muet", async (t) => {
    // Sans manifest, le contrôle de cohérence ne rapporte rien : il lève, et ne laisse qu'une trace.
    const { lignes } = await jouer(projet(t, {}));

    assert.ok(lignes.some((ligne) => /^Traceback /.test(ligne)), lignes.join("\n"));
    assert.ok(lignes.some((ligne) => /^FAIL {2}contrôle de cohérence .* planté/.test(ligne)), lignes.join("\n"));
    assert.equal(lignes.at(-2), "gates : ROUGE");
    // Dans le script, le rouge ne se pose que par `fail`, ou après des lignes FAIL déjà écrites.
    const poses = readFileSync(GATES, "utf8").split("\n").filter((ligne) => /\brc=1\b/.test(ligne)).map((ligne) => ligne.trim());
    assert.deepEqual(poses, ['fail() { echo "FAIL  $*" >&2; rc=1; }', "2) rc=1 ;;"]);
  });
});
