// #4229 : la station sans l'étape des tests gelés — ses places, ses garde-fous, la reprise d'une branche livrée et ses mutations se tiennent seules.
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test, type TestContext } from "node:test";
import { stationDuDepot, type Lancer } from "../src/brigade-github.ts";
import { LABEL_IN_PASS } from "../src/github-etat/etats.ts";
import { RELANCES_DES_MUTATIONS } from "../src/passe-mutations/mutations.ts";
import { depotNeuf, depotRepris, FauxGitHub, fauxClient, STATION_DU_DEPOT } from "./faux-github.ts";

const repertoireDe = (t: TestContext) => {
  const repertoire = mkdtempSync(join(tmpdir(), "station-sans-gel-"));
  t.after(() => rmSync(repertoire, { recursive: true, force: true }));
  return repertoire;
};
const FIN = { code: 0, signal: null, turns: 30, tokens: 1, durationMs: 1, arret: null, erreur: null };

// Une station dont le cook dit « done » sans rien commiter ; `lances` compte ses cooks.
function cuisine(t: TestContext, faux: FauxGitHub, surcharge: Record<string, unknown> = {}) {
  const repertoire = repertoireDe(t);
  const lances: string[] = [];
  const lancer: Lancer = ({ flux, entree }) => {
    lances.push(entree ?? "");
    writeFileSync(flux, `${JSON.stringify({ type: "result", is_error: false, result: "Done." })}\n`);
    return { fin: Promise.resolve(FIN) };
  };
  const station = stationDuDepot({ ...STATION_DU_DEPOT, github: fauxClient(faux), depot: depotNeuf(repertoire), flux: repertoire, lancer, maintenant: () => new Date("2026-11-21T09:07:00Z"), avertir: () => {}, ...surcharge });
  if ("refus" in station) throw new Error(station.refus);
  return { station, lances, repertoire };
}

// brigade:guard
test("a station with a free place takes a ticket and launches its cook", async (t) => {
  const faux = new FauxGitHub();
  faux.feu(21);
  const { station, lances } = cuisine(t, faux);
  await station.tour();
  await station.calme();
  assert.equal(lances.length, 1);
});

// brigade:guard
test("a guard that holds the kitchen launches no cook, and is asked with the number of cooks in flight", async (t) => {
  const faux = new FauxGitHub();
  faux.feu(22);
  const demandes: number[] = [];
  const gardes = { retenue: async (enVol: number) => (demandes.push(enVol), "pause" as never), redire: async () => {}, quitter: async () => {} };
  const { station, lances } = cuisine(t, faux, { gardes });
  await station.tour();
  await station.calme();
  assert.equal(lances.length, 0);
  assert.deepEqual(demandes.slice(0, 1), [0]);
});

// brigade:guard
test("a stale PR on the zone of a ticket is handed to the station's `perimee` hook", async (t) => {
  const faux = new FauxGitHub();
  faux.feu(875, ["fire", "model:sonnet", "effort:medium"], "## Context\n\nx\n\n## Zone\n\n- `a.ts`\n\n## Acceptance\n\n- done\n");
  const vieille = faux.prOuverte(["a.ts"], "patch-1");
  const client = fauxClient(faux);
  const ancien = new Date("2026-11-01T00:00:00Z").toISOString();
  const github = { ...client, prsOuvertes: async () => (await client.prsOuvertes!()).map((ouverte) => ({ ...ouverte, misAJourLe: ancien })) };
  const dites: Array<[number, number]> = [];
  const repertoire = repertoireDe(t);
  const station = stationDuDepot({ ...STATION_DU_DEPOT, github, depot: depotNeuf(repertoire), flux: repertoire, prise: () => ({ prendre: async () => ({ prise: false }), lacher: async () => true }), maintenant: () => new Date("2026-11-25T12:00:00Z"), avertir: () => {}, perimee: (ticket, pr) => void dites.push([ticket, pr.number]) });
  if ("refus" in station) throw new Error(station.refus);
  await station.tour();
  assert.deepEqual(dites, [[875, vieille.number]]);
});

// Un cook reprend une branche déjà livrée, ne commite rien : `pr` dit l'état de sa PR, `poussee` si l'origine porte la branche.
async function reprise(t: TestContext, pr: "aucune" | "ouverte" | "fermee" | "mergee", poussee: boolean) {
  const repertoire = repertoireDe(t);
  const faux = new FauxGitHub();
  faux.feu(14);
  const tete = "c".repeat(40);
  if (pr !== "aucune") faux.prs.push({ number: 99, issue: 14, branche: "cook/14-github", sha: tete, state: pr === "ouverte" ? "open" : "closed", merged: pr === "mergee", enRetard: false, mergeePar: null, fichiers: [] });
  const lancer: Lancer = ({ flux }) => {
    writeFileSync(flux, `${JSON.stringify({ type: "result", is_error: false, result: "All done." })}\n`);
    return { fin: Promise.resolve({ ...FIN, turns: 12 }) };
  };
  const depot = { ...depotRepris(repertoire, tete), ...(poussee ? { livree: (branche: string) => `origin/${branche}` } : {}) };
  const station = stationDuDepot({ ...STATION_DU_DEPOT, github: fauxClient(faux), depot, flux: repertoire, lancer, maintenant: () => new Date("2026-11-21T09:07:00Z"), avertir: () => {} });
  if ("refus" in station) throw new Error(station.refus);
  await station.tour();
  await station.calme();
  return { faux, corps: (faux.commentaires.get(14) ?? []).map((c) => c.body).join("\n") };
}

// brigade:guard
test("a branch pushed without a PR goes to the pass as is, with no failed cook", async (t) => {
  const { faux, corps } = await reprise(t, "aucune", true);
  assert.equal(faux.ticket(14).labels.has(LABEL_IN_PASS), true);
  assert.ok(faux.prs.some((pr) => pr.branche === "cook/14-github" && pr.state === "open"));
  assert.doesNotMatch(corps, /brigade:echec/);
});

// brigade:guard
test("a branch that has a PR already is not delivered again: a cook that adds nothing counts as failed", async (t) => {
  const { faux, corps } = await reprise(t, "ouverte", true);
  assert.equal(faux.ticket(14).labels.has(LABEL_IN_PASS), false);
  assert.match(corps, /brigade:echec n=1[\s\S]*the cook added nothing since its last delivery/);
});

// brigade:guard
test("a branch whose PR was closed without merge goes back to the pass, not counted as a failed cook", async (t) => {
  const { faux, corps } = await reprise(t, "fermee", false);
  assert.equal(faux.ticket(14).labels.has(LABEL_IN_PASS), true);
  assert.doesNotMatch(corps, /brigade:echec/);
});

// brigade:guard
test("a branch whose PR was merged is not put back in the pass: a cook that adds nothing counts as failed", async (t) => {
  const { faux, corps } = await reprise(t, "mergee", false);
  assert.equal(faux.ticket(14).labels.has(LABEL_IN_PASS), false);
  assert.match(corps, /brigade:echec n=1/);
});

const BOGUE = "export const somme = (a: number, b: number) => a - b;\n";
const CORRIGE = "export const somme = (a: number, b: number) => a + b;\nexport const positif = (n: number) => n > 0;\n";
const TEST = 'import assert from "node:assert/strict";\nimport { test } from "node:test";\nimport { somme } from "./calcul.ts";\ntest("adds two numbers", () => assert.equal(somme(2, 3), 5));\n';
const DIFF = ["diff --git a/lib/calcul.ts b/lib/calcul.ts", "--- a/lib/calcul.ts", "+++ b/lib/calcul.ts", "@@ -1 +1,2 @@", "-export const somme = (a: number, b: number) => a - b;", "+export const somme = (a: number, b: number) => a + b;", "+export const positif = (n: number) => n > 0;", "diff --git a/lib/calcul.test.ts b/lib/calcul.test.ts", "--- /dev/null", "+++ b/lib/calcul.test.ts", "@@ -0,0 +1,4 @@", ...TEST.trimEnd().split("\n").map((ligne) => `+${ligne}`), ""].join("\n");
function projet(dossier: string, fichiers: Record<string, string>) {
  for (const [chemin, contenu] of Object.entries({ "package.json": '{"type":"module"}\n', ...fichiers })) {
    mkdirSync(join(dossier, chemin, ".."), { recursive: true });
    writeFileSync(join(dossier, chemin), contenu);
  }
}

// brigade:guard
test("a delivery whose added test lets a mutation survive goes back to its cook with that mutation, a bounded number of times", async (t) => {
  const repertoire = repertoireDe(t);
  const faux = new FauxGitHub();
  faux.feu(11, ["fire", "model:opus", "effort:high"], "## Acceptance criteria\n\n- It adds two numbers");
  const lancements: { relecteur: boolean; consigne: string }[] = [];
  const lancer: Lancer = ({ args, cwd, flux, entree }) => {
    const relecteur = args.includes("--tools");
    lancements.push({ relecteur, consigne: entree ?? "" });
    if (!relecteur) projet(cwd, { "lib/calcul.ts": CORRIGE, "lib/calcul.test.ts": TEST });
    const relecture = { verdict: "vert", resume: "Looks right.", constats: [], criteres: [{ critere: 1, tests: ["adds two numbers"], relecture: false }] };
    writeFileSync(flux, `${JSON.stringify({ type: "result", is_error: false, result: relecteur ? JSON.stringify(relecture) : "Done.\n<livrable>\nIt adds.\n</livrable>" })}\n`);
    return { fin: Promise.resolve(FIN) };
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
    avertir: () => {},
  });
  if ("refus" in station) throw new Error(station.refus);
  for (let tour = 0; tour < 8 && !lancements.some((l) => l.relecteur); tour += 1) {
    await station.tour();
    await station.calme();
  }
  const cooks = lancements.filter((l) => !l.relecteur);
  assert.equal(cooks.length, 1 + RELANCES_DES_MUTATIONS);
  for (const cook of cooks.slice(1)) assert.match(cook.consigne, /## Mutations your tests let through[\s\S]*`lib\/calcul\.ts:2` \(`>` → `<=`\)/);
  assert.ok(lancements.some((l) => l.relecteur));
  // Sa relecture rend alors la livraison pour cette mutation, que la relecture elle-même soit verte.
  for (let tour = 0; tour < 8 && !JSON.stringify([...faux.commentaires.values()]).includes("Mutation check"); tour += 1) {
    await station.tour();
    await station.calme();
  }
  assert.match(JSON.stringify([...faux.commentaires.values()]), /Mutation check[\s\S]*`lib\/calcul\.ts:2`/);
});
