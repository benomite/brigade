// #4023 : `main` rouge, la panne que le superviseur observe déjà (`mainRougeDepuis`), laisse son post-mortem quand elle finit
// au-delà de 30 minutes. Le suivi est joué seul, puis branché sur le réveil du runtime, jusqu'au fichier du projet.
import assert from "node:assert/strict";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { test, type TestContext } from "node:test";
import { ouvrirJournal } from "../../src/journal.ts";
import { lirePostMortemsDates, suivreLaBaseRouge, terminerLaPanne } from "../../src/post-mortems/post-mortems.ts";
import type { Runtime } from "../../src/runtime.ts";
import { brancherSuperviseur } from "../../src/superviseur/brancher.ts";
import type { SuiviDuTour } from "../../src/superviseur/tour.ts";
import { repertoireTemporaire } from "../outils.ts";

type Panne = Parameters<typeof terminerLaPanne>[2];
const A = (hhmm: string) => `2026-11-20T${hhmm}:00.000Z`;

test("a red main that turns green is recorded once, when it ends, system first", () => {
  const pannes: Panne[] = [];
  const suivre = suivreLaBaseRouge((panne) => void pannes.push(panne));
  suivre(null, new Date(A("09:00")));
  suivre(A("10:00"), new Date(A("10:05")));
  suivre(A("10:00"), new Date(A("10:20")));
  assert.deepEqual(pannes, [], "still red: nothing yet");
  suivre(null, new Date(A("10:31")));
  suivre(null, new Date(A("10:40")));
  assert.deepEqual(pannes, [{ id: `main-red@${A("10:00")}`, debut: A("10:00"), fin: A("10:31"), cause: "main was red", detecteeParLeSysteme: A("10:00"), signaleeParLeChef: null, corrigePar: null, ticketDuCorrectif: null }]);
});

// Un projet branché, dont le tour dit `mainRougeDepuis` ; `reveiller` joue un réveil, à l'heure qu'`a` a posée.
function branche(t: TestContext) {
  const repertoire = repertoireTemporaire(t);
  const journal = ouvrirJournal(repertoire);
  t.after(() => journal.fermer());
  let depuis: string | null = null;
  let instant = A("10:00");
  let ecouter: (() => void) | null = null;
  const dits: string[] = [];
  const tour = { faits: () => ({ dernierMerge: null, cuisinables: [], prises: [], mainRougeDepuis: depuis }), checks: () => null, sauts: () => [], reparationMiseDeCote: () => false } as unknown as SuiviDuTour;
  const runtime = { projet: "shop", journal, surReveil: (ecoute: () => void) => ((ecouter = ecoute), () => {}) } as unknown as Runtime;
  brancherSuperviseur(runtime, { tour, github: {} as never, depot: "acme/shop", branche: "main", consulter: () => null, repertoireEtat: repertoire, maintenant: () => new Date(instant), dire: (ligne) => void dits.push(ligne) });
  return { repertoire, dits, a: (hhmm: string, rouge: string | null) => ((instant = A(hhmm)), (depuis = rouge), ecouter?.()) };
}

test("wired on the runtime's wake-up, a main red for 31 minutes leaves its post-mortem in the project's state, one of 30 leaves none", (t) => {
  const p = branche(t);
  p.a("10:05", A("10:00"));
  p.a("10:29", A("10:00"));
  p.a("10:30", null);
  assert.equal(lirePostMortemsDates(p.repertoire, "shop").length, 0, "30 min exactly: none");
  p.a("11:00", A("11:00"));
  p.a("11:31", null);
  p.a("11:40", null);
  assert.deepEqual(lirePostMortemsDates(p.repertoire, "shop"), [{ cause: "main was red", duree: "31 min", vuEnPremier: "system", corrige: null, ticket: null, fin: A("11:31") }]);
});

test("a post-mortem file that cannot be read is said by the supervisor and left as it was, the wake-up goes on", (t) => {
  const p = branche(t);
  mkdirSync(join(p.repertoire, "post-mortems"));
  const fichier = join(p.repertoire, "post-mortems", "shop.json");
  writeFileSync(fichier, "{not json");
  p.a("10:05", A("10:00"));
  p.a("11:00", null);
  assert.equal(readFileSync(fichier, "utf8"), "{not json");
  assert.match(p.dits.join("\n"), /post-mortem of an outage was not written/);
});
