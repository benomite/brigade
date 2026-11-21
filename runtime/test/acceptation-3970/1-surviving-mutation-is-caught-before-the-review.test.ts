// #3970, critère 1 : la cause qui fait des renvois la première perte de temps — une mutation qui survit, que la pass
// ne découvre qu'après la livraison, un tour de pass et de claim plus tard — est corrigée à sa source : la station joue
// elle-même la vérification des mutations sur la livraison du cook, avant la PR et sa relecture, et rend au cook
// les lignes qui survivent, nommées, au lieu de lui renvoyer sa livraison après la pass.
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test, type TestContext } from "node:test";
import { stationDuDepot, type Lancer } from "../../src/brigade-github.ts";
import { FauxGitHub, fauxClient, STATION_DU_DEPOT } from "../faux-github.ts";

const BOGUE = "export const somme = (a: number, b: number) => a - b;\n";
const CORRIGE = "export const somme = (a: number, b: number) => a + b;\nexport const positif = (n: number) => n > 0;\n";
const ENTETE = 'import assert from "node:assert/strict";\nimport { test } from "node:test";\nimport { positif, somme } from "./calcul.ts";\n';
// Le seul test ajouté laisse passer `n > 0` changé en `n <= 0`.
const ADDITION = 'test("adds two numbers", () => assert.equal(somme(2, 3), 5));\n';
const DIFF = [
  "diff --git a/lib/calcul.ts b/lib/calcul.ts",
  "index 1111111..2222222 100644",
  "--- a/lib/calcul.ts",
  "+++ b/lib/calcul.ts",
  "@@ -1 +1,2 @@",
  "-export const somme = (a: number, b: number) => a - b;",
  "+export const somme = (a: number, b: number) => a + b;",
  "+export const positif = (n: number) => n > 0;",
  "diff --git a/lib/calcul.test.ts b/lib/calcul.test.ts",
  "new file mode 100644",
  "--- /dev/null",
  "+++ b/lib/calcul.test.ts",
  "@@ -0,0 +1,3 @@",
  "+test(\"adds two numbers\", () => assert.equal(somme(2, 3), 5));",
  "",
].join("\n");

function projet(dossier: string, fichiers: Record<string, string>) {
  for (const [chemin, contenu] of Object.entries({ "package.json": '{"type":"module"}\n', ...fichiers })) {
    mkdirSync(join(dossier, chemin, ".."), { recursive: true });
    writeFileSync(join(dossier, chemin), contenu);
  }
}

test("a delivery whose added tests let a mutation through goes back to its cook, the line named, before any review of it", async (t: TestContext) => {
  const repertoire = mkdtempSync(join(tmpdir(), "mutation-avant-relecture-"));
  t.after(() => rmSync(repertoire, { recursive: true, force: true }));
  projet(join(repertoire, "review-11-github"), { "lib/calcul.ts": CORRIGE, "lib/calcul.test.ts": ENTETE + ADDITION });
  const faux = new FauxGitHub();
  faux.feu(11, ["fire", "model:opus", "effort:high"], "## Acceptance criteria\n\n- It adds two numbers");
  // Dans l'ordre : chaque lancement, cook ou relecteur, avec la consigne qu'il reçoit.
  const lancements: { relecteur: boolean; consigne: string }[] = [];
  const lancer: Lancer = ({ args, cwd, flux, entree }) => {
    const relecteur = args.includes("--tools");
    lancements.push({ relecteur, consigne: entree ?? "" });
    if (!relecteur) projet(cwd, { "lib/calcul.ts": CORRIGE, "lib/calcul.test.ts": ENTETE + ADDITION });
    const relecture = { verdict: "vert", resume: "Looks right.", constats: [], criteres: [{ critere: 1, tests: ["adds two numbers"], relecture: false }] };
    const rendu = relecteur ? JSON.stringify(relecture) : "Done.\n<livrable>\nIt adds.\n</livrable>";
    writeFileSync(flux, `${JSON.stringify({ type: "result", is_error: false, result: rendu })}\n`);
    return { fin: Promise.resolve({ code: 0, signal: null, turns: 30, tokens: 1, durationMs: 1, arret: null, erreur: null }) };
  };
  const station = stationDuDepot({
    ...STATION_DU_DEPOT,
    github: fauxClient(faux),
    depot: {
      connait: () => false,
      preparer: async (run) => ({ worktree: join(repertoire, run), branche: `cook/${run}` }),
      reprendre: async (run) => join(repertoire, run),
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
    avertir: () => {},
  });
  if ("refus" in station) throw new Error(station.refus);
  for (let tour = 0; tour < 6 && lancements.filter((l) => !l.relecteur).length < 2 && !lancements.some((l) => l.relecteur); tour += 1) {
    await station.tour();
    await station.calme();
  }
  const cooks = lancements.filter((l) => !l.relecteur);
  assert.equal(lancements.some((l) => l.relecteur), false, "no reviewer runs on a delivery whose mutation survives: the cook gets it back first");
  assert.ok(cooks.length >= 2, "the cook is launched again on its own delivery");
  assert.match(cooks[1]?.consigne ?? "", /lib\/calcul\.ts:2/, "the cook's second brief names the line whose mutation survived");
});
