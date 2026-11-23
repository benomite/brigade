// Le réveil sans progrès branché sur le superviseur (#4027, `superviseur/brancher.ts`) :
// un ticket que le tour lit parqué, sans progrès depuis 30 minutes, réveille le
// superviseur — le manager reçoit la cause `no-progress` —, et sa raison s'écrit sur
// le ticket. Le label que retire son geste, un agent, est un progrès : 30 minutes
// plus tard, il se réveille encore. Un run qui tient déjà le projet retarde le réveil.
import assert from "node:assert/strict";
import { test, type TestContext } from "node:test";
import type { GitHubDuTour } from "../../src/brigade-github.ts";
import { MARQUE_D_INACTIVITE } from "../../src/inactivite/inactivite.ts";
import { ouvrirJournal } from "../../src/journal.ts";
import type { Runtime } from "../../src/runtime.ts";
import { brancherSuperviseur, type ManagerDuSuperviseur } from "../../src/superviseur/brancher.ts";
import { suivreLeTour } from "../../src/superviseur/tour.ts";
import { jusqua, repertoireTemporaire } from "../outils.ts";
import { FauxDepot } from "../superviseur/faux-depot.ts";

const A = (hhmm: string) => `2026-11-23T${hhmm}:00.000Z`;
const BACK = (ticket: number) => JSON.stringify({ saw: `#${ticket} is parked with no progress`, gesture: { gesture: "back-on-rail", ticket, note: "nothing holds it" } });

function projet(t: TestContext, manager: ManagerDuSuperviseur) {
  const journal = ouvrirJournal(repertoireTemporaire(t));
  t.after(() => journal.fermer());
  let instant = A("10:00");
  const maintenant = () => new Date(instant);
  const depot = new FauxDepot();
  const tour = suivreLeTour(maintenant);
  const client = tour.envelopper({
    checksDeLaBase: async () => [],
    fires: async () => [
      { number: 41, title: "Ticket 41", labels: ["fire", "blocked-on-human"], state: "open" },
      { number: 42, title: "Ticket 42", labels: ["fire", "blocked-on-human"], state: "open" },
    ],
    commenter: async () => {},
  } as unknown as GitHubDuTour);
  depot.issue(41, ["fire", "blocked-on-human"]);
  depot.issue(42, ["fire", "blocked-on-human"]);
  const dits: string[] = [];
  let ecouter: (() => void) | null = null;
  const runtime = { projet: `shop-4027-${Math.random()}`, journal, surReveil: (ecoute: () => void) => ((ecouter = ecoute), () => {}) } as unknown as Runtime;
  brancherSuperviseur(runtime, { tour, github: depot.client(), depot: "acme/shop", branche: "main", consulter: () => manager, maintenant, dire: (ligne) => void dits.push(ligne) });
  const raisons = (ticket: number) => (depot.commentaires.get(ticket) ?? []).filter((corps) => corps.startsWith(MARQUE_D_INACTIVITE));
  return { depot, dits, raisons, a: (hhmm: string) => void (instant = A(hhmm)), lire: () => client.fires(), reveiller: () => ecouter?.() };
}

test("a parked ticket with no progress for 30 minutes wakes the supervisor; its gesture's label change, by an agent, starts a new silent period", async (t) => {
  const consignes: string[] = [];
  let liberer: (() => void) | null = null;
  const p = projet(t, async (consigne) => {
    consignes.push(consigne);
    const ticket = Number(/"ticket": (\d+)/.exec(consigne)?.[1]);
    // Le premier run tient le projet jusqu'à ce que le test le libère.
    if (consignes.length === 1) await new Promise<void>((fin) => (liberer = fin));
    return { message: BACK(ticket) };
  });
  await p.lire();
  p.reveiller();
  p.a("10:29");
  p.reveiller();
  await new Promise((fin) => setImmediate(fin));
  assert.deepEqual(consignes, []);
  p.a("10:30");
  p.reveiller();
  await jusqua(() => consignes.length === 1 && p.raisons(41).length === 1);
  assert.match(consignes[0] ?? "", /"cause": "no-progress"/);
  assert.match(consignes[0] ?? "", /"state": "parked"/);
  assert.match(consignes[0] ?? "", new RegExp(`"since": "${A("10:00")}"`));
  assert.match(p.raisons(41)[0] ?? "", new RegExp(`#41 \\(parked\\) has made no progress for 30 minutes.*${A("10:00")}`, "s"));
  // #42 is just as silent, but the run on #41 holds the project: its wake waits, nothing is written on it.
  assert.deepEqual(p.raisons(42), []);
  (liberer as (() => void) | null)?.();
  await jusqua(() => (p.depot.commentaires.get(41) ?? []).some((corps) => corps.includes("has made no progress since")));
  assert.match((p.depot.commentaires.get(41) ?? []).at(-1) ?? "", /woke because #41 \(parked\) has made no progress since 2026-11-23T10:00:00.000Z\./);
  assert.deepEqual(p.depot.labelsDe(41), ["fire"]);
  p.a("10:31");
  p.reveiller();
  await jusqua(() => p.raisons(42).length === 1 && consignes.length === 2);
  // #41 is woken once for its silence; its gesture's label change at 10:30 starts a new one.
  p.a("10:59");
  p.reveiller();
  await new Promise((fin) => setImmediate(fin));
  assert.equal(p.raisons(41).length, 1);
  p.a("11:00");
  p.reveiller();
  await jusqua(() => p.raisons(41).length === 2);
  assert.match(p.raisons(41)[1] ?? "", new RegExp(`Last progress: a label change by an agent, ${A("10:30")}`));
  assert.deepEqual(p.dits, []);
});
