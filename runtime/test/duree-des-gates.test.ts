// La durée que les gates impriment : le vrai `.claude/brigade/gates.sh` de ce
// dépôt, joué sur un projet d'essai. Le projet n'a ni manifest ni dépôt git, les
// autres étapes y sont donc rouges — seule la ligne de durée est regardée ici.
// C'est une mesure : elle ne juge rien.
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, before, describe, test } from "node:test";
import { ENV_ENFANT } from "./outils.ts";
import { posixOnly } from "./support/plateforme.ts";

const GATES = join(import.meta.dirname, "../../.claude/brigade/gates.sh");

// `suite` est la commande de test du projet d'essai : c'est elle que les gates
// mesurent.
function projet(racine: string, { binding, suite = "true" }: { binding?: string; suite?: string }): string {
  mkdirSync(join(racine, "runtime"), { recursive: true });
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
const MESURE = String.raw`durée des gates : \d+,\d s de processeur \(\d+,\d utilisateur \+ \d+,\d système\), \d+ s d'horloge, charge du poste (?:\d+,\d+|inconnue)`;
function releve(ligne: string): { processeur: number; utilisateur: number; systeme: number; horloge: number } {
  const lu = /durée des gates : (\d+),(\d) s de processeur \((\d+),(\d) utilisateur \+ (\d+),(\d) système\), (\d+) s d'horloge/.exec(ligne);
  assert.ok(lu, ligne);
  const [processeur, utilisateur, systeme] = [1, 3, 5].map((i) => Number(`${lu[i]}.${lu[i + 1]}`)) as [number, number, number];
  return { processeur, utilisateur, systeme, horloge: Number(lu[7]) };
}

// Une suite qui calcule : une seconde de processeur. Sur un runner de la CI, le
// témoin seul coûte jusqu'à 0,7 s, et deux passages de front diffèrent de 0,4 s
// sans rien calculer de plus : quatre dixièmes s'y perdaient (#2621).
const CALCUL_S = 1;
const CALCULE = `node -e "while (process.cpuUsage().user < ${CALCUL_S * 1e6}) for (let i = 0; i < 1e6; i++);"`;
type Passage = Awaited<ReturnType<typeof jouer>>;

// Les tests lisent deux passages des gates, joués une fois chacun et de front
// (#2464) : un passage coûte une demi-seconde de processeur, plus le calcul. Le témoin a une
// suite qui ne fait rien ; l'autre une suite qui calcule, et un plafond déclaré.
describe("la durée des gates", { concurrency: 8 }, () => {
  let racine = "";
  let temoin: Promise<Passage>;
  let calcul: Promise<Passage>;
  before(() => {
    racine = mkdtempSync(join(tmpdir(), "brigade-test-"));
    temoin = jouer(projet(join(racine, "temoin"), {}));
    calcul = jouer(projet(join(racine, "calcul"), { binding: "- **Plafond des gates** : `0,01 s` de processeur", suite: CALCULE }));
  });
  after(() => rmSync(racine, { recursive: true, force: true }));

  test("les gates disent ce qu'elles ont coûté, et ne jugent pas leur durée — même si le projet déclare un plafond", async () => {
    for (const { lignes } of [await temoin, await calcul]) {
      assert.equal(deLaDuree(lignes).length, 1, lignes.join("\n"));
      assert.match(deLaDuree(lignes)[0] ?? "", new RegExp(`^ok {4}${MESURE}$`));
    }
  });

  test("le compte est le processeur entier : utilisateur et système, dont la ligne donne le partage", { skip: posixOnly("plays the real gates.sh on a project whose test suite burns processor in node, and expects that time in the user share of its duration line; Git Bash's `times` leaves out native Windows programs such as the node.exe npm starts, so the line reports a fraction of a second") }, async () => {
    const { processeur, utilisateur, systeme } = releve(deLaDuree((await calcul).lignes)[0] ?? "");
    const sansCalcul = releve(deLaDuree((await temoin).lignes)[0] ?? "");

    assert.ok(utilisateur >= CALCUL_S, `utilisateur : ${utilisateur}`);
    // Le calcul de la suite, petit-enfant des gates par npm, est dans le compte :
    // ce que les gates coûtent d'autre se retrouve chez le témoin. Au dixième
    // près pour chacun, et une marge pour ce qu'un poste chargé ajoute.
    assert.ok(utilisateur - sansCalcul.utilisateur >= CALCUL_S / 2, `utilisateur : ${utilisateur}, sans calcul : ${sansCalcul.utilisateur}`);
    // Chaque nombre est arrondi au dixième pour son compte.
    assert.ok(Math.abs(processeur - (utilisateur + systeme)) < 0.15, `${processeur} ≠ ${utilisateur} + ${systeme}`);
  });

  test("une étape qui plante au lieu de rapporter écrit sa ligne FAIL : aucun rouge de ces gates n'est muet", async () => {
    // Sans manifest, le contrôle de cohérence ne rapporte rien : il lève, et ne laisse qu'une trace.
    const { lignes } = await temoin;

    assert.ok(lignes.some((ligne) => /^Traceback /.test(ligne)), lignes.join("\n"));
    assert.ok(lignes.some((ligne) => /^FAIL {2}contrôle de cohérence .* planté/.test(ligne)), lignes.join("\n"));
    assert.equal(lignes.at(-2), "gates : ROUGE");
    // Dans le script, le rouge ne se pose que par `fail`, ou après des lignes FAIL déjà écrites.
    const poses = readFileSync(GATES, "utf8").split("\n").filter((ligne) => /\brc=1\b/.test(ligne)).map((ligne) => ligne.trim());
    assert.deepEqual(poses, ['fail() { echo "FAIL  $*" >&2; rc=1; }', "2) rc=1 ;;"]);
  });
});
