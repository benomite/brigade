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
// Le fichier de tests figé, en shell : un process sous le lanceur qui ne rend
// jamais la main, comme celui d'un fichier figé dans du code synchrone sous
// `node --test`. Son témoin apparaît d'un coup, pid compris : qui le voit peut
// le lire.
const FICHIER_FIGE = `sh -c 'echo $$ >"$TEMOIN.ecrit" && mv "$TEMOIN.ecrit" "$TEMOIN" && exec sleep 600'`;
// Ce que le lanceur écrit d'un test en échec.
const TEST_EN_ECHEC = "echo '✖ un test en échec (0.6ms)'";

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

const desTests = (lignes: string[]) => lignes.filter((ligne) => /^(ok {4}|FAIL {2})(tests du runtime|délai des tests)/.test(ligne));

// Chaque test a son projet : ils se jouent de front.
describe("la garde d'horloge des gates", { concurrency: 3 }, () => {
  test("une suite figée dans du code synchrone est tuée passé le délai, avec le process de son fichier, et les gates rougissent en disant qu'aucun test n'a échoué", { skip: posixOnly("plays the real gates.sh on a project whose test file never returns, with a clock guard of 0 s once that file is frozen, and expects the guard's kill to take that file's process too; on Windows npm runs the project's `test` script through cmd.exe, which cannot run the shell command standing for the frozen file") }, async (t) => {
    const racine = projet(t, FICHIER_FIGE);
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
    // lui qui doit être trouvé mort, aussi tard qu'il démarre. Passé ce fait,
    // la garde n'a rien à attendre de plus.
    const { code, lignes } = await jouer(racine, { BRIGADE_GATES_DELAI_TESTS: "0", BRIGADE_GATES_GARDE_APRES: temoin, TEMOIN: temoin });

    // Aucun test en échec avant la coupure : c'est la ligne que le runtime
    // reconnaît pour rejouer ces gates plus tard, sur une machine saturée.
    assert.deepEqual(desTests(lignes), ["FAIL  tests du runtime arrêtés par la garde d'horloge, aucun test en échec : plus de 0 s sans rendre la main"], lignes.join("\n"));
    assert.equal(code, 1);
    // Tuer le lanceur ne suffit pas : le process du fichier lui survivrait.
    assert.ok(existsSync(temoin), "la garde est tombée avant que le fichier d'essai ne démarre");
    await mort(Number(readFileSync(temoin, "utf8")));
    // La sortie de la suite est gardée, comme pour tout échec.
    assert.equal(readdirSync(join(racine, ".brigade-state/gates")).length, 1);
  });

  test("un test en échec avant la coupure garde la ligne d'un rouge", { skip: posixOnly("plays the real gates.sh on a suite that reports a failing test then freezes in its next file, and expects the guard's cut line saying tests failed before the cut; on Windows npm runs that suite through cmd.exe, which cannot run its shell commands") }, async (t) => {
    // Le test en échec est écrit avant que le fichier suivant ne se fige.
    const racine = projet(t, `${TEST_EN_ECHEC}; ${FICHIER_FIGE}`);
    const temoin = join(racine, "pid-du-fichier");
    aArreter(t, () => {
      try {
        process.kill(Number(readFileSync(temoin, "utf8")), "SIGKILL");
      } catch {
        // Déjà mort, ou jamais lancé.
      }
    });

    const { code, lignes } = await jouer(racine, { BRIGADE_GATES_DELAI_TESTS: "0", BRIGADE_GATES_GARDE_APRES: temoin, TEMOIN: temoin });

    assert.deepEqual(
      desTests(lignes),
      ["FAIL  tests du runtime arrêtés par la garde d'horloge : plus de 0 s sans rendre la main, et des tests en échec avant la coupure"],
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
