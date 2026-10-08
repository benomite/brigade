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

const GATES = join(import.meta.dirname, "../../.claude/brigade/gates.sh");
const TEST_FIGE = join(import.meta.dirname, "aides/test-fige.ts");

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
describe("la garde d'horloge des gates", { concurrency: 8 }, () => {
  test("une suite figée dans du code synchrone est tuée passé le délai, avec le process de son fichier, et les gates rougissent", async (t) => {
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

    // Trois secondes : le temps, même sur une machine chargée, que le fichier
    // d'essai démarre et se fige — c'est lui qui doit être trouvé mort.
    const { code, lignes } = await jouer(racine, { BRIGADE_GATES_DELAI_TESTS: "3", TEMOIN: temoin });

    // La ligne FAIL ne porte rien de variable : le hook d'arrêt en tire
    // l'empreinte de l'échec.
    assert.deepEqual(desTests(lignes), ["FAIL  tests du runtime arrêtés par la garde d'horloge : plus de 3 s sans rendre la main"], lignes.join("\n"));
    assert.equal(code, 1);
    // Tuer le lanceur ne suffit pas : le process du fichier lui survivrait.
    assert.ok(existsSync(temoin), "le fichier d'essai n'a pas démarré avant le délai");
    await mort(Number(readFileSync(temoin, "utf8")));
    // La sortie de la suite est gardée, comme pour tout échec.
    assert.equal(readdirSync(join(racine, ".brigade-state/gates")).length, 1);
  });

  test("un délai illisible rougit sans jouer la suite, au lieu de la laisser sans garde", async (t) => {
    const racine = projet(t, 'touch "$TEMOIN"');
    const temoin = join(racine, "suite-jouee");

    const { lignes } = await jouer(racine, { BRIGADE_GATES_DELAI_TESTS: "bientôt", TEMOIN: temoin });

    assert.deepEqual(desTests(lignes), ["FAIL  délai des tests illisible : BRIGADE_GATES_DELAI_TESTS attend un nombre entier de secondes"], lignes.join("\n"));
    assert.equal(existsSync(temoin), false);
  });
});
