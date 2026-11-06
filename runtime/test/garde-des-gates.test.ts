// La garde d'horloge des gates : le vrai `.claude/brigade/gates.sh` de ce dépôt,
// joué sur un projet d'essai dont la suite ne rend jamais la main. Le projet n'a
// ni manifest ni dépôt git, les autres étapes y sont donc rouges — seule l'étape
// des tests est regardée ici.
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { describe, test, type TestContext } from "node:test";
import { aArreter, ENV_ENFANT, mort, repertoireTemporaire } from "./outils.ts";
import { posixOnly } from "./support/plateforme.ts";

const GATES = join(import.meta.dirname, "../../.claude/brigade/gates.sh");
const TEST_FIGE = join(import.meta.dirname, "aides/test-fige.ts");
const TEST_EN_ECHEC = join(import.meta.dirname, "aides/test-en-echec.ts");

function projet(t: TestContext, suite: string): string {
  const racine = repertoireTemporaire(t);
  mkdirSync(join(racine, "runtime"));
  writeFileSync(join(racine, "runtime/package.json"), JSON.stringify({ scripts: { test: suite } }));
  writeFileSync(join(racine, "CLAUDE.md"), "## Équipe multi-agents (plugin brigade)\n\n- **Branche d'intégration** : `main`\n");
  return racine;
}

function jouer(racine: string, env: Record<string, string>): Promise<{ code: number | null; lignes: string[] }> {
  return new Promise((resoudre, rejeter) => {
    const gates = spawn("bash", [GATES, racine], { env: { ...ENV_ENFANT, ...env }, stdio: ["ignore", "pipe", "pipe"] });
    let sortie = "";
    gates.stdout.on("data", (morceau: Buffer) => (sortie += morceau.toString()));
    gates.stderr.on("data", (morceau: Buffer) => (sortie += morceau.toString()));
    gates.on("error", rejeter);
    gates.on("close", (code) => resoudre({ code, lignes: sortie.split("\n") }));
  });
}

// Une horloge injectée dans les gates par `BASH_ENV`, que bash lit avant le script : le `sleep 1` de la garde —
// son délai, réglé à 1 s par ces tests — rend la main tout de suite, la seconde est passée. Tout autre `sleep`
// reste le vrai (#2464). Le délai ne court qu'une fois le témoin du fichier figé posé (`BRIGADE_GATES_GARDE_APRES`).
function horlogeDeLaGarde(t: TestContext): Record<string, string> {
  const fichier = join(repertoireTemporaire(t), "horloge.sh");
  writeFileSync(fichier, `sleep() { if [ "$*" = 1 ]; then return 0; else command sleep "$@"; fi; }\n`);
  return { BASH_ENV: fichier };
}

const desTests = (lignes: string[]) => lignes.filter((ligne) => /^(ok {4}|FAIL {2})(tests du runtime|délai des tests)/.test(ligne));

// Chaque test a son projet : ils se jouent de front.
describe("la garde d'horloge des gates", { concurrency: 8 }, () => {
  test("une suite figée dans du code synchrone est tuée passé le délai, avec le process de son fichier, et les gates rougissent en disant qu'aucun test n'a échoué", { skip: posixOnly("plays the real gates.sh on a project whose test file freezes in synchronous code, with a 1 s clock guard on a clock injected through BASH_ENV, and expects the guard's kill to take that file's node process too; Git Bash's kill of the suite's process group cannot reach the native Windows processes npm started below it, so the frozen file's node.exe outlives the guard") }, async (t) => {
    const racine = projet(t, `node --test --test-force-exit --test-timeout=500 ${JSON.stringify(TEST_FIGE)}`);
    const temoin = join(racine, "pid-du-fichier");
    // Si la garde manque son process, il ne doit pas survivre au test.
    aArreter(t, () => {
      try {
        process.kill(Number(readFileSync(temoin, "utf8")), "SIGKILL");
      } catch {
        // Déjà mort, ou jamais lancé : c'est ce qu'on attend.
      }
    });

    // Le délai ne court qu'une fois le fichier d'essai figé, témoin posé : c'est
    // lui qui doit être trouvé mort, aussi tard qu'il démarre.
    const { code, lignes } = await jouer(racine, { ...horlogeDeLaGarde(t), BRIGADE_GATES_DELAI_TESTS: "1", BRIGADE_GATES_GARDE_APRES: temoin, TEMOIN: temoin });

    // Aucun test en échec avant la coupure : c'est la ligne que le runtime
    // reconnaît pour rejouer ces gates plus tard, sur une machine saturée.
    assert.deepEqual(desTests(lignes), ["FAIL  tests du runtime arrêtés par la garde d'horloge, aucun test en échec : plus de 1 s sans rendre la main"], lignes.join("\n"));
    assert.equal(code, 1);
    // Tuer le lanceur ne suffit pas : le process du fichier lui survivrait.
    assert.ok(existsSync(temoin), "la garde est tombée avant que le fichier d'essai ne démarre");
    await mort(Number(readFileSync(temoin, "utf8")));
    // La sortie de la suite est gardée, comme pour tout échec.
    assert.equal(readdirSync(join(racine, ".brigade-state/gates")).length, 1);
  });

  test("un test en échec avant la coupure garde la ligne d'un rouge", { skip: posixOnly("plays the real gates.sh on a suite that runs a failing test file then a frozen one, and expects the guard's cut line saying tests failed before the cut; on Windows npm runs that suite through cmd.exe, where `;` does not chain two commands, so the two files do not run one after the other") }, async (t) => {
    // Le fichier en échec rend son verdict avant que l'autre ne se fige : un seul lanceur les joue l'un après
    // l'autre — deux lanceurs coûtaient un Node de plus, au-delà de 2 s sur un runner de la CI (#2464).
    const racine = projet(t, `node --test --test-force-exit --test-concurrency=1 --test-timeout=500 ${JSON.stringify(TEST_EN_ECHEC)} ${JSON.stringify(TEST_FIGE)}`);
    const temoin = join(racine, "pid-du-fichier");
    aArreter(t, () => {
      try {
        process.kill(Number(readFileSync(temoin, "utf8")), "SIGKILL");
      } catch {
        // Déjà mort, ou jamais lancé.
      }
    });

    const { code, lignes } = await jouer(racine, { ...horlogeDeLaGarde(t), BRIGADE_GATES_DELAI_TESTS: "1", BRIGADE_GATES_GARDE_APRES: temoin, TEMOIN: temoin });

    assert.deepEqual(
      desTests(lignes),
      ["FAIL  tests du runtime arrêtés par la garde d'horloge : plus de 1 s sans rendre la main, et des tests en échec avant la coupure"],
      lignes.join("\n"),
    );
    assert.equal(code, 1);
    await mort(Number(readFileSync(temoin, "utf8")));
  });

  test("un délai illisible rougit sans jouer la suite, au lieu de la laisser sans garde", async (t) => {
    const racine = projet(t, 'touch "$TEMOIN"');
    const temoin = join(racine, "suite-jouee");

    const { lignes } = await jouer(racine, { BRIGADE_GATES_DELAI_TESTS: "bientôt", TEMOIN: temoin });

    assert.deepEqual(desTests(lignes), ["FAIL  délai des tests illisible : BRIGADE_GATES_DELAI_TESTS attend un nombre entier de secondes"], lignes.join("\n"));
    assert.equal(existsSync(temoin), false);
  });
});
