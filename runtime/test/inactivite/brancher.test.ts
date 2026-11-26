// Le réveil sans progrès branché sur le superviseur (#4027, `superviseur/brancher.ts`) :
// un ticket que le tour lit mis de côté (`served-elsewhere`), sans progrès depuis 30
// minutes, réveille le superviseur — le manager reçoit la cause `no-progress` —, et sa
// raison s'écrit sur le ticket. Le label que retire son geste, un agent, est un progrès :
// 30 minutes plus tard, il se réveille encore. Un run qui tient déjà le projet retarde le
// réveil. Un ticket parqué — ici par un label d'attente d'avant parked, `blocked-on-human`
// (#4260) — ne le réveille jamais : il attend sa date, son fait ou sa réponse.
import assert from "node:assert/strict";
import { test, type TestContext } from "node:test";
import type { GitHubDuTour } from "../../src/brigade-github.ts";
import { ouvrirJournal } from "../../src/journal.ts";
import type { Runtime } from "../../src/runtime.ts";
import { brancherSuperviseur, type ManagerDuSuperviseur } from "../../src/superviseur/brancher.ts";
import { suivreLeTour } from "../../src/superviseur/tour.ts";
import { jusqua, repertoireTemporaire } from "../outils.ts";
import { FauxDepot } from "../superviseur/faux-depot.ts";

const MARQUE_D_INACTIVITE = "<!-- brigade:no-progress";
const A = (hhmm: string) => `2026-11-23T${hhmm}:00.000Z`;
const BACK = (ticket: number) => JSON.stringify({ saw: `#${ticket} is set aside with no progress`, gesture: { gesture: "close-duplicate", ticket, of: ticket } });

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
      { number: 41, title: "Ticket 41", labels: ["fire", "served-elsewhere"], state: "open" },
      { number: 42, title: "Ticket 42", labels: ["fire", "served-elsewhere"], state: "open" },
      { number: 43, title: "Ticket 43", labels: ["fire", "blocked-on-human"], state: "open" },
    ],
    commenter: async () => {},
  } as unknown as GitHubDuTour);
  depot.issue(41, ["fire", "served-elsewhere"]);
  depot.issue(42, ["fire", "served-elsewhere"]);
  depot.issue(43, ["fire", "blocked-on-human"]);
  const dits: string[] = [];
  let ecouter: (() => void) | null = null;
  const runtime = { projet: `shop-4027-${Math.random()}`, journal, surReveil: (ecoute: () => void) => ((ecouter = ecoute), () => {}) } as unknown as Runtime;
  brancherSuperviseur(runtime, { tour, github: depot.client(), depot: "acme/shop", branche: "main", consulter: () => manager, maintenant, dire: (ligne) => void dits.push(ligne) });
  const raisons = (ticket: number) => (depot.commentaires.get(ticket) ?? []).filter((corps) => corps.startsWith(MARQUE_D_INACTIVITE));
  return { depot, dits, raisons, a: (hhmm: string) => void (instant = A(hhmm)), lire: () => client.fires(), reveiller: () => ecouter?.() };
}

test("a ticket set aside with no progress for 30 minutes wakes the supervisor, a parked one never; the supervisor leaves the ticket as it was", async (t) => {
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
  assert.match(consignes[0] ?? "", /"state": "set aside"/);
  assert.match(consignes[0] ?? "", new RegExp(`"since": "${A("10:00")}"`));
  assert.match(p.raisons(41)[0] ?? "", new RegExp(`#41 \\(set aside\\) has made no progress for 30 minutes.*${A("10:00")}`, "s"));
  // #42 is just as silent, but the run on #41 holds the project: its wake waits, nothing is written on it.
  assert.deepEqual(p.raisons(42), []);
  (liberer as (() => void) | null)?.();
  // The run's trace names the cause it woke on.
  await jusqua(() => (p.depot.commentaires.get(41) ?? []).some((corps) => corps.startsWith("<!-- brigade:supervisor -->")));
  assert.match((p.depot.commentaires.get(41) ?? []).find((corps) => corps.startsWith("<!-- brigade:supervisor -->")) ?? "", /woke because #41 \(set aside\) has made no progress since 2026-11-23T10:00:00.000Z\./);
  // The supervisor does not put it back on the rail: the ticket stays as it was (#4233).
  assert.deepEqual(p.depot.labelsDe(41), ["fire", "served-elsewhere"]);
  p.a("10:31");
  p.reveiller();
  await jusqua(() => p.raisons(42).length === 1 && consignes.length === 2);
  // #43 is parked: silent just as long, it never wakes the supervisor.
  assert.deepEqual(p.raisons(43), []);
  assert.equal(consignes.join("\n").includes('"ticket": 43'), false);
  assert.deepEqual(p.dits, []);
});
