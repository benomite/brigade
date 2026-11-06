// Le contrôle de types des gates d'une station (#2549), joué par le vrai
// `.claude/brigade/gates.sh` de ce dépôt sur un projet d'essai. Sous
// `--proches`, un changement du code d'une zone sans test proche n'y jouait
// aucun test — et, avec eux, aucun contrôle de types : la livraison partait
// verte, la CI qui juge les types des deux zones sur chaque PR la rendait
// rouge, et le ticket était recuit. Les types partent désormais pour les deux
// zones dès que le changement touche du code de l'une d'elles.
//
// Les tests, de même (#2565) : la station joue la fermeture que joue la CI, pas
// les seuls tests proches. Un test touché sans être proche — qui importe le
// fichier changé sans en porter le nom — rougit ses gates avant la CI.
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { chmodSync, copyFileSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { describe, test, type TestContext } from "node:test";
import { ENV_ENFANT, git, repertoireTemporaire } from "./outils.ts";
import { posixOnly } from "./support/plateforme.ts";

const GATES = join(import.meta.dirname, "../../.claude/brigade/gates.sh");
const SELECTION = join(import.meta.dirname, "../../.claude/brigade/tests-touches.mjs");
const ROLES = ["po", "manager", "dev", "designer"];

// Un projet aux gates vertes, commité sur `main` puis parti sur une branche de
// travail : les manifests, les rôles et leur miroir, la sélection des tests, et
// deux zones dont le contrôle de types est un script d'essai. Celui du runtime
// est rouge si `typesRuntime` l'est. Le runtime porte `src/loin.ts`, que lit
// `test/lecteur.test.ts` : un test qui le touche sans en porter le nom.
function projet(t: TestContext, { typesRuntime = "vert" } = {}): string {
  const racine = join(repertoireTemporaire(t), "projet");
  const poser = (fichier: string, contenu: string) => {
    mkdirSync(join(racine, fichier, ".."), { recursive: true });
    writeFileSync(join(racine, fichier), contenu);
  };
  poser("CLAUDE.md", "## Équipe multi-agents (plugin brigade)\n\n- **Branche d'intégration** : `main`\n");
  poser(".gitignore", ".brigade-state/\nnode_modules/\n");
  poser(".claude-plugin/plugin.json", JSON.stringify({ commands: ROLES.map((role) => `./commands/${role}.md`) }));
  poser(".claude-plugin/marketplace.json", "{}");
  poser(".claude/settings.json", "{}");
  for (const role of ROLES) {
    poser(`commands/${role}.md`, "");
    poser(`codex/skills/${role}/SKILL.md`, "");
    poser(`codex/skills/${role}/agents/openai.yaml`, "");
  }
  mkdirSync(join(racine, ".claude/brigade"), { recursive: true });
  copyFileSync(SELECTION, join(racine, ".claude/brigade/tests-touches.mjs"));
  for (const zone of ["runtime", "app"]) {
    const rouge = zone === "runtime" && typesRuntime === "rouge";
    poser(`${zone}/package.json`, JSON.stringify({ scripts: { test: 'node --test "test/**/*.test.ts"', typecheck: rouge ? "echo 'src/a.ts: erreur de types' && exit 2" : "true" } }));
    poser(`${zone}/src/a.ts`, "export const a = 1;\n");
    poser(`${zone}/test/a.test.ts`, "");
    // Le `tsc` que les gates cherchent avant de lancer le script `typecheck`.
    poser(`${zone}/node_modules/.bin/tsc`, "#!/bin/sh\n");
    chmodSync(join(racine, zone, "node_modules/.bin/tsc"), 0o755);
  }
  poser("runtime/src/loin.ts", "export const loin = 1;\n");
  poser("runtime/test/lecteur.test.ts", 'import { test } from "node:test";\nimport { loin } from "../src/loin.ts";\ntest("lit loin", () => {\n  if (loin !== 1) throw new Error(`loin vaut ${loin}`);\n});\n');
  git(racine, "init", "-q", "-b", "main");
  git(racine, "add", "-A");
  git(racine, "commit", "-q", "-m", "projet d'essai");
  git(racine, "checkout", "-q", "-b", "travail");
  return racine;
}

function jouer(racine: string, env: Record<string, string> = {}): { code: number | null; sortie: string } {
  const passage = spawnSync("bash", [GATES, racine], { env: { ...ENV_ENFANT, HOME: join(racine, ".."), ...env }, encoding: "utf8" });
  return { code: passage.status, sortie: passage.stdout + passage.stderr };
}

const lignesDesTypes = (sortie: string) => sortie.match(/^(ok {4}|FAIL {2}).*(contrôle de types|non joués).*$/gm);

const SKIP = posixOnly("plays this repository's real gates.sh on a test project with both zones; on Windows the gates' Python check compares the declared role paths with `pathlib` results written with backslashes, so every role is reported absent");

// En série : `spawnSync` tient le fil, et des tests « de front » se compteraient
// le temps les uns des autres.
describe("le contrôle de types des gates d'une station, sans test touché par le changement", () => {
  test("un changement du code du runtime sans test touché joue les types des deux zones", { skip: SKIP }, (t) => {
    const racine = projet(t);
    writeFileSync(join(racine, "runtime/src/b.ts"), "export const b = 2;\n");

    const { code, sortie } = jouer(racine);

    assert.deepEqual(lignesDesTypes(sortie), [
      "ok    tests du runtime non joués : aucun ne touche ce changement — la suite entière tourne sur la base",
      "ok    contrôle de types du runtime",
      "ok    tests de l'app non joués : aucun ne touche ce changement — la suite entière tourne sur la base",
      "ok    contrôle de types de l'app",
    ]);
    assert.equal(code, 0, sortie);
  });

  test("des types rouges sans test touché rougissent les gates, avant que la CI ne le fasse", { skip: SKIP }, (t) => {
    const racine = projet(t, { typesRuntime: "rouge" });
    writeFileSync(join(racine, "runtime/src/b.ts"), "export const b: string = 2;\n");

    const { code, sortie } = jouer(racine);

    assert.deepEqual(sortie.match(/^FAIL.*$/gm), ["FAIL  contrôle de types du runtime en échec — rejoue : npm --prefix runtime run typecheck"]);
    assert.match(sortie, /src\/a\.ts: erreur de types/);
    assert.equal(code, 1, sortie);
  });

  test("un changement qui ne touche aucun code de zone — une page de doc — ne joue pas de types", { skip: SKIP }, (t) => {
    const racine = projet(t);
    mkdirSync(join(racine, "docs"));
    writeFileSync(join(racine, "docs/notes.md"), "une page\n");

    const { code, sortie } = jouer(racine);

    assert.deepEqual(lignesDesTypes(sortie), [
      "ok    tests du runtime non joués : aucun ne touche ce changement — la suite entière tourne sur la base",
      "ok    tests de l'app non joués : aucun ne touche ce changement — la suite entière tourne sur la base",
    ]);
    assert.equal(code, 0, sortie);
  });
});

describe("les tests que les gates d'une station jouent : la fermeture du changement, comme la CI", () => {
  test("un test touché sans être proche est joué, et son rouge rougit les gates avant la CI", { skip: SKIP }, (t) => {
    const racine = projet(t);
    writeFileSync(join(racine, "runtime/src/loin.ts"), "export const loin = 2;\n");

    const { code, sortie } = jouer(racine);

    assert.match(sortie, /^ok {4}tests du runtime : 1 fichiers touchés par ce changement — la suite entière tourne sur la base$/m);
    assert.deepEqual(sortie.match(/^FAIL.*$/gm), ["FAIL  tests du runtime en échec — rejoue : npm --prefix runtime test"]);
    assert.match(sortie, /loin vaut 2/);
    assert.equal(code, 1, sortie);
  });

  test("`BRIGADE_GATES_TESTS=proches`, au poste du dev, ne joue que les tests proches : le test touché de loin attend la CI", { skip: SKIP }, (t) => {
    const racine = projet(t);
    writeFileSync(join(racine, "runtime/src/loin.ts"), "export const loin = 2;\n");

    const { code, sortie } = jouer(racine, { BRIGADE_GATES_TESTS: "proches" });

    assert.match(sortie, /^ok {4}tests du runtime non joués ici : aucun n'est proche de ce changement — ceux qu'il touche tournent sur la CI, la suite entière sur la base$/m);
    assert.equal(code, 0, sortie);
  });
});
