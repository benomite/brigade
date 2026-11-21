// #3970 : une livraison dont une mutation survit revient à son cook avant sa PR, revérifiée à chaque
// relance (#3976) et au plus RELANCES_DES_MUTATIONS fois, et part ensuite à sa relecture — que le cook
// relancé ait fini ou non.
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test, type TestContext } from "node:test";
import { stationDuDepot, type Lancer } from "../src/brigade-github.ts";
import { RELANCES_DES_MUTATIONS } from "../src/passe-mutations/mutations.ts";
import { FauxGitHub, fauxClient, STATION_DU_DEPOT } from "./faux-github.ts";

const BOGUE = "export const somme = (a: number, b: number) => a - b;\n";
const CORRIGE = "export const somme = (a: number, b: number) => a + b;\nexport const positif = (n: number) => n > 0;\n";
// Le seul test ajouté laisse passer `n > 0` changé en `n <= 0`.
const TEST = 'import assert from "node:assert/strict";\nimport { test } from "node:test";\nimport { somme } from "./calcul.ts";\ntest("adds two numbers", () => assert.equal(somme(2, 3), 5));\n';
const DIFF = [
  "diff --git a/lib/calcul.ts b/lib/calcul.ts",
  "--- a/lib/calcul.ts",
  "+++ b/lib/calcul.ts",
  "@@ -1 +1,2 @@",
  "-export const somme = (a: number, b: number) => a - b;",
  "+export const somme = (a: number, b: number) => a + b;",
  "+export const positif = (n: number) => n > 0;",
  "diff --git a/lib/calcul.test.ts b/lib/calcul.test.ts",
  "--- /dev/null",
  "+++ b/lib/calcul.test.ts",
  "@@ -0,0 +1,4 @@",
  ...TEST.trimEnd().split("\n").map((ligne) => `+${ligne}`),
  "",
].join("\n");

function projet(dossier: string, fichiers: Record<string, string>) {
  for (const [chemin, contenu] of Object.entries({ "package.json": '{"type":"module"}\n', ...fichiers })) {
    mkdirSync(join(dossier, chemin, ".."), { recursive: true });
    writeFileSync(join(dossier, chemin), contenu);
  }
}

// Une station dont le cook livre toujours la même ligne non testée ; `relance` dit comment finit le cook relancé.
function cuisine(t: TestContext, relance: { erreur: boolean }) {
  const repertoire = mkdtempSync(join(tmpdir(), "mutations-avant-la-pr-"));
  t.after(() => rmSync(repertoire, { recursive: true, force: true }));
  const faux = new FauxGitHub();
  faux.feu(11, ["fire", "model:opus", "effort:high"], "## Acceptance criteria\n\n- It adds two numbers");
  const lancements: { relecteur: boolean; consigne: string }[] = [];
  const avertissements: string[] = [];
  const lancer: Lancer = ({ args, cwd, flux, entree }) => {
    const relecteur = args.includes("--tools");
    lancements.push({ relecteur, consigne: entree ?? "" });
    if (!relecteur) projet(cwd, { "lib/calcul.ts": CORRIGE, "lib/calcul.test.ts": TEST });
    const cooks = lancements.filter((l) => !l.relecteur).length;
    const enErreur = !relecteur && cooks === 2 && relance.erreur;
    const relecture = { verdict: "vert", resume: "Looks right.", constats: [], criteres: [{ critere: 1, tests: ["adds two numbers"], relecture: false }] };
    const rendu = relecteur ? JSON.stringify(relecture) : "Done.\n<livrable>\nIt adds.\n</livrable>";
    writeFileSync(flux, `${JSON.stringify({ type: "result", is_error: enErreur, result: enErreur ? "API Error: overloaded" : rendu })}\n`);
    return { fin: Promise.resolve({ code: enErreur ? 1 : 0, signal: null, turns: 30, tokens: 1, durationMs: 1, arret: null, erreur: null }) };
  };
  const station = stationDuDepot({
    ...STATION_DU_DEPOT,
    github: fauxClient(faux),
    depot: {
      connait: () => false,
      preparer: async (run) => ({ worktree: join(repertoire, run), branche: `cook/${run}` }),
      reprendre: async (run) => {
        projet(join(repertoire, run), { "lib/calcul.ts": CORRIGE, "lib/calcul.test.ts": TEST });
        return join(repertoire, run);
      },
      retirer: () => {},
      ranger: async () => null,
      pousser: () => {},
      commits: () => 1,
      changes: () => ["lib/calcul.ts", "lib/calcul.test.ts"],
      diff: () => DIFF,
      essayer: async (nom) => {
        projet(join(repertoire, nom), { "lib/calcul.ts": BOGUE });
        return join(repertoire, nom);
      },
      jeter: (nom) => void (nom === undefined || rmSync(join(repertoire, nom), { recursive: true, force: true })),
    },
    env: { PATH: process.env.PATH },
    flux: repertoire,
    lancer,
    avertir: (texte) => void avertissements.push(texte),
  });
  if ("refus" in station) throw new Error(station.refus);
  const jusquALaRelecture = async () => {
    for (let tour = 0; tour < 8 && !lancements.some((l) => l.relecteur); tour += 1) {
      await station.tour();
      await station.calme();
    }
  };
  return { lancements, avertissements, jusquALaRelecture };
}

test("a cook given back its surviving mutations is given them a bounded number of times: its last delivery goes to its review even if one still survives", async (t) => {
  const { lancements, jusquALaRelecture } = cuisine(t, { erreur: false });
  await jusquALaRelecture();
  const cooks = lancements.filter((l) => !l.relecteur);
  assert.equal(cooks.length, 1 + RELANCES_DES_MUTATIONS, "one cook, then its relaunches on its surviving mutations, and no more");
  for (const cook of cooks.slice(1)) assert.match(cook.consigne, /## Mutations your tests let through[\s\S]*`lib\/calcul\.ts:2` \(`>` → `<=`\)/);
  assert.doesNotMatch(cooks[0]!.consigne, /Mutations your tests let through/);
  assert.ok(lancements.some((l) => l.relecteur), "the delivery goes on to its review, where the pass judges it");
});

test("a cook relaunched on its surviving mutations that does not finish leaves its delivery as it was: it goes to its review", async (t) => {
  const { lancements, avertissements, jusquALaRelecture } = cuisine(t, { erreur: true });
  await jusquALaRelecture();
  assert.equal(lancements.filter((l) => !l.relecteur).length, 2);
  assert.ok(lancements.some((l) => l.relecteur), "the first delivery is not lost with the failed relaunch");
  assert.ok(avertissements.some((a) => /relaunched on its surviving mutations did not finish/.test(a)), avertissements.join("\n"));
});
