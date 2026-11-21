// #3976, critère 1 : la cause des renvois « blocking review » — une mutation qui survit — est corrigée à sa source.
// Depuis #3970 la station rend au cook, une seule fois, les lignes qui survivent ; elle ne revérifie pas ce que le cook
// relancé rend, et une mutation que sa relance laisse vivre part à la PR, où la pass renvoie la livraison (#3974, cooké
// après #3970). La station revérifie donc la livraison relancée et rend au cook les lignes qui survivent encore, avant
// toute relecture.
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
// Le premier test laisse passer `n > 0` changé en `n <= 0` ; le second, qui le distingue, n'arrive qu'à la troisième fois.
const ADDITION = 'test("adds two numbers", () => assert.equal(somme(2, 3), 5));\n';
const AFFINE = 'test("tells a positive number", () => assert.equal(positif(3), true));\n';
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

test("a relaunched cook whose tests still let a mutation through gets the line back again, before any review of its delivery", async (t: TestContext) => {
  const repertoire = mkdtempSync(join(tmpdir(), "mutation-relance-"));
  t.after(() => rmSync(repertoire, { recursive: true, force: true }));
  projet(join(repertoire, "review-11-github"), { "lib/calcul.ts": CORRIGE, "lib/calcul.test.ts": ENTETE + ADDITION });
  const faux = new FauxGitHub();
  faux.feu(11, ["fire", "model:opus", "effort:high"], "## Acceptance criteria\n\n- It adds two numbers");
  const lancements: { relecteur: boolean; consigne: string }[] = [];
  const lancer: Lancer = ({ args, cwd, flux, entree }) => {
    const relecteur = args.includes("--tools");
    lancements.push({ relecteur, consigne: entree ?? "" });
    if (!relecteur) {
      // Les deux premiers cooks livrent le même test ; le troisième ajoute celui qui tue la mutation.
      const cooksVus = lancements.filter((l) => !l.relecteur).length;
      projet(cwd, { "lib/calcul.ts": CORRIGE, "lib/calcul.test.ts": ENTETE + ADDITION + (cooksVus >= 3 ? AFFINE : "") });
    }
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
  for (let tour = 0; tour < 6 && lancements.filter((l) => !l.relecteur).length < 3 && !lancements.some((l) => l.relecteur); tour += 1) {
    await station.tour();
    await station.calme();
  }
  const cooks = lancements.filter((l) => !l.relecteur);
  assert.ok(cooks.length >= 3, "the delivery the relaunched cook leaves is checked again, and the cook is launched on it once more");
  assert.match(cooks[2]?.consigne ?? "", /lib\/calcul\.ts:2/, "the third brief names the line whose mutation still survives");
  const premierRelecteur = lancements.findIndex((l) => l.relecteur);
  assert.ok(premierRelecteur === -1 || premierRelecteur > lancements.findLastIndex((l) => !l.relecteur), "no review runs before the cook's last relaunch");
});
