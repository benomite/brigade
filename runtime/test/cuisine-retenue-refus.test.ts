// Une cuisine oisive dont tous les `fire` ouverts sont refusés par le manager (#2694).
import assert from "node:assert/strict";
import { test, type TestContext } from "node:test";
import { REFUS_APRES_MS, refusDeLaCuisine, type RefusDuManager } from "../src/cuisine-retenue-refus.ts";
import { ouvrirJournal } from "../src/journal.ts";
import { brancherRetenue } from "../src/retenue/brancher.ts";
import { retenueEnCours } from "../src/retenue/lire.ts";
import type { CauseReveil, Runtime } from "../src/runtime.ts";
import { suivreLeTour, type SuiviDuTour } from "../src/retenue/tour.ts";
import { repertoireTemporaire } from "./outils.ts";
import { detecterRetenue, direRetenueEn, SANS_SIGNAL, type Observation } from "../src/retenue/retenue.ts";
import type { TicketRail } from "../src/projections/rail.ts";

const A = (hhmmss: string) => `2026-11-07T${hhmmss}.000Z`;
const IDLE = A("08:00:00");

// Le rail du 7 novembre : trois `fire` refusés, chacun avec son manque.
const REFUS: RefusDuManager[] = [
  { ticket: 2680, manque: "no acceptance criteria", at: IDLE },
  { ticket: 2681, manque: "zone not named", at: IDLE },
  { ticket: 2682, manque: "scope too wide", at: IDLE },
];
const rail = (...etats: Array<[number, string]>) => etats.map(([ticket, state]) => ({ ticket, state }) as TicketRail);
const entree = (surcharge: Partial<Parameters<typeof refusDeLaCuisine>[0]> = {}) => ({ rail: [], refus: REFUS, enAttente: [], dernierService: null, ouverture: A("07:00:00"), ...surcharge });
const apres = (minutes: number) => new Date(Date.parse(IDLE) + minutes * 60_000);

test("cuisine oisive, rien de prenable, tous les fire refusés : absente avant 15 min, présente à 15 min, avec chaque ticket et son manque", () => {
  assert.equal(REFUS_APRES_MS, 15 * 60_000);
  assert.equal(refusDeLaCuisine(entree(), apres(14)), null);
  const refusees = refusDeLaCuisine(entree(), apres(15));
  assert.deepEqual(refusees?.tickets, [2680, 2681, 2682]);
  assert.deepEqual(refusees?.lines, ["#2680 refused by the manager, gap: no acceptance criteria", "#2681 refused by the manager, gap: zone not named", "#2682 refused by the manager, gap: scope too wide"]);
});

test("la ligne de la cuisine retenue nomme les tickets et les manques, via le détecteur existant", () => {
  const observation = (maintenant: Date): Observation => ({ eteinte: false, enAttente: [], attenteDepuis: null, dernierService: null, ouverture: A("07:00:00"), refusees: refusDeLaCuisine(entree(), maintenant) });
  assert.equal(detecterRetenue(observation(apres(14)), SANS_SIGNAL, apres(14)), null);
  const retenue = detecterRetenue(observation(apres(15)), SANS_SIGNAL, apres(15));
  const ligne = direRetenueEn(retenue!);
  for (const attendu of ["#2680 refused by the manager, gap: no acceptance criteria", "#2681 refused by the manager, gap: zone not named", "#2682 refused by the manager, gap: scope too wide"]) assert.ok(ligne.includes(attendu), ligne);
});

test("un fire non refusé, un cook en cours ou un ticket prenable : pas de ligne", () => {
  assert.equal(refusDeLaCuisine(entree({ rail: rail([2683, "waiting"]) }), apres(60)), null);
  assert.equal(refusDeLaCuisine(entree({ rail: rail([2683, "taken"]) }), apres(60)), null);
  assert.equal(refusDeLaCuisine(entree({ enAttente: [2683] }), apres(60)), null);
  assert.equal(refusDeLaCuisine(entree({ refus: [] }), apres(60)), null);
  assert.ok(refusDeLaCuisine(entree({ rail: rail([2680, "86"]) }), apres(60)));
});

// Sur un vrai journal, par la boucle : trois refus du 7 novembre, un rail vide, une horloge factice.
function cuisineAuJournal(t: TestContext, { tour = null as SuiviDuTour | null, epique = false } = {}) {
  let instant = IDLE;
  const journal = ouvrirJournal(repertoireTemporaire(t), { maintenant: () => new Date(instant) });
  t.after(() => journal.fermer());
  journal.ajouter({ project: "brigade", ticket: null, author: "runtime", type: "runtime.started", payload: { pid: 1, host: "box", node: "26" } });
  const refuser = (ticket: number, missing: string, kind: "ticket" | "epic" = "ticket") =>
    journal.ajouter({ project: "brigade", ticket, author: "manager", type: "manager.judged", payload: { run: `${ticket}-aa`, fingerprint: "f", verdict: "refused", kind, reason: "r", missing, model: null, effort: null, calibration: null } });
  refuser(2680, "no acceptance criteria");
  refuser(2681, "zone not named");
  refuser(2682, "scope too wide");
  if (epique) refuser(2690, "an epic", "epic");
  const ecouteurs: Array<(cause: CauseReveil) => void> = [];
  const runtime: Runtime = { projet: "brigade", journal, surReveil: (ecouter) => (ecouteurs.push(ecouter), () => {}), arreter: () => {} };
  const dites: string[] = [];
  brancherRetenue(runtime, { maintenant: () => new Date(instant), dire: (ligne) => dites.push(ligne), tour });
  const passer = (minutes: number) => {
    instant = new Date(Date.parse(IDLE) + minutes * 60_000).toISOString();
    for (const ecouter of ecouteurs) ecouter("tick");
  };
  const tenue = () => retenueEnCours(journal.base);
  return { passer, tenue, journal };
}

test("par la boucle, sur le journal : la retenue des refus est absente avant 15 min, présente à 15 min, avec chaque ticket et son manque", (t) => {
  const c = cuisineAuJournal(t);
  c.passer(14);
  assert.equal(c.tenue(), null);
  c.passer(15);
  const tenue = c.tenue();
  assert.deepEqual(tenue?.tickets, [2680, 2681, 2682]);
  assert.equal(tenue?.cause.kind, "tickets");
  const ligne = direRetenueEn(tenue!);
  for (const attendu of ["#2680 refused by the manager, gap: no acceptance criteria", "#2681 refused by the manager, gap: zone not named", "#2682 refused by the manager, gap: scope too wide"]) assert.ok(ligne.includes(attendu), ligne);
});

test("par la boucle, avec le tour GitHub qui observe : la ligne paraît aussi, et une épique refusée n'y compte pas", (t) => {
  const tour = suivreLeTour(() => new Date(IDLE));
  const c = cuisineAuJournal(t, { tour, epique: true });
  c.passer(15);
  assert.deepEqual(c.tenue()?.tickets, [2680, 2681, 2682]);
});
