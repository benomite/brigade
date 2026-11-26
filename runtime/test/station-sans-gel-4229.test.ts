// #4229 : la station sans l'étape des tests gelés — ses places, ses garde-fous, et la reprise d'une branche livrée se tiennent seules.
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test, type TestContext } from "node:test";
import { stationDuDepot, type Lancer } from "../src/brigade-github.ts";
import { LABEL_IN_PASS } from "../src/github-etat/etats.ts";
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

test("a station with a free place takes a ticket and launches its cook", async (t) => {
  const faux = new FauxGitHub();
  faux.feu(21);
  const { station, lances } = cuisine(t, faux);
  await station.tour();
  await station.calme();
  assert.equal(lances.length, 1);
});

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

test("a branch pushed without a PR goes to the pass as is, with no failed cook", async (t) => {
  const { faux, corps } = await reprise(t, "aucune", true);
  assert.equal(faux.ticket(14).labels.has(LABEL_IN_PASS), true);
  assert.ok(faux.prs.some((pr) => pr.branche === "cook/14-github" && pr.state === "open"));
  assert.doesNotMatch(corps, /brigade:echec/);
});

test("a branch that has a PR already is not delivered again: a cook that adds nothing counts as failed", async (t) => {
  const { faux, corps } = await reprise(t, "ouverte", true);
  assert.equal(faux.ticket(14).labels.has(LABEL_IN_PASS), false);
  assert.match(corps, /brigade:echec n=1[\s\S]*the cook added nothing since its last delivery/);
});

test("a branch whose PR was closed without merge goes back to the pass, not counted as a failed cook", async (t) => {
  const { faux, corps } = await reprise(t, "fermee", false);
  assert.equal(faux.ticket(14).labels.has(LABEL_IN_PASS), true);
  assert.doesNotMatch(corps, /brigade:echec/);
});

test("a branch whose PR was merged is not put back in the pass: a cook that adds nothing counts as failed", async (t) => {
  const { faux, corps } = await reprise(t, "mergee", false);
  assert.equal(faux.ticket(14).labels.has(LABEL_IN_PASS), false);
  assert.match(corps, /brigade:echec n=1/);
});
