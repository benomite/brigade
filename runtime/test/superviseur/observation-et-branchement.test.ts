// Ce que le superviseur observe du tour, et son branchement sur la boucle du runtime (#3914) : il part sur le fait que le
// tour a vu, un seul à la fois, pas deux fois de suite pour le même fait, jamais sur une cuisine que le chef a arrêtée ;
// une réponse illisible du manager ne fait aucun geste à sa place, et chaque tour se dit au journal de service.
import assert from "node:assert/strict";
import { test, type TestContext } from "node:test";
import type { GitHubDuTour, TicketLu } from "../../src/brigade-github.ts";
import type { CauseReveil, Runtime } from "../../src/runtime.ts";
import { ouvrirJournal } from "../../src/journal.ts";
import { brancherSuperviseur, type ConsulterLeSuperviseur } from "../../src/superviseur/brancher.ts";
import { observerLeTour } from "../../src/superviseur/observation.ts";
import { repertoireTemporaire } from "../outils.ts";

const CALIBRE = ["fire", "model:opus", "effort:medium"];
const ticket = (number: number, ...labels: string[]): TicketLu => ({ number, title: `Ticket ${number}`, labels: [...CALIBRE, ...labels], state: "open" });
const prise = (station: string) => ({ body: `<!-- brigade:prise station=${station} -->\nTaken by station \`${station}\`.`, association: "OWNER", createdAt: "2026-11-20T10:00:00Z" });

// Un client du tour réduit à ce que l'observation enveloppe, et ce que le test lui fait rendre.
function tour(t0 = Date.parse("2026-11-20T12:00:00Z")) {
  let instant = t0;
  const etat = { tickets: [] as TicketLu[], checks: [] as { name?: string; outcome: "red" | "green" | "pending"; url?: string }[], commentaires: new Map<number, ReturnType<typeof prise>[]>(), merge: true };
  const brut = {
    fires: async () => etat.tickets,
    checksDeLaBase: async () => etat.checks,
    commentaires: async (numero: number) => etat.commentaires.get(numero) ?? [],
    merger: async () => (etat.merge ? { fait: true as const } : { fait: false as const, motif: "refused" }),
  } as unknown as GitHubDuTour;
  const observation = observerLeTour(() => new Date(instant));
  const client = observation.envelopper(brut);
  return { etat, observation, client, avancer: (minutes: number) => (instant += minutes * 60_000), maintenant: () => new Date(instant) };
}

test("the tour's reading makes the observation: what is cookable, the takes of each open ticket, a red main and since when", async () => {
  const t = tour();
  t.etat.tickets = [ticket(1), ticket(2, "taken"), ticket(3, "in-pass"), ticket(4, "waiting"), ticket(5, "blocked-on-human"), { ...ticket(6), labels: ["fire"] }];
  t.etat.checks = [{ name: "unit", outcome: "red" }, { name: "windows tests (1/8)", outcome: "red" }, { name: "lint", outcome: "green" }];
  t.etat.commentaires.set(2, [prise("box"), prise("mac"), prise("box")]);
  await t.client.fires();
  await t.client.checksDeLaBase();
  await t.client.commentaires(2);
  await t.client.commentaires(99);
  const vue = t.observation.observation();
  assert.equal(vue.ticketCuisinable, true);
  assert.deepEqual(t.observation.file().map(({ ticket }) => ticket), [1], "only #1 waits to be cooked");
  assert.deepEqual(vue.prises, [{ ticket: 2, prises: 3 }], "a ticket not open is not counted");
  assert.deepEqual(vue.checksRouges, ["unit"]);
  assert.equal(vue.baseRougeDepuis, "2026-11-20T12:00:00.000Z");
  assert.equal(vue.dernierMerge, null);
  assert.equal(vue.ouverture, "2026-11-20T12:00:00.000Z");
  t.avancer(5);
  await t.client.checksDeLaBase();
  assert.equal(t.observation.observation().baseRougeDepuis, "2026-11-20T12:00:00.000Z", "red since its first sight");
  t.etat.checks = [{ name: "unit", outcome: "green" }];
  await t.client.checksDeLaBase();
  assert.equal(t.observation.observation().baseRougeDepuis, null);
});

test("a merge, by this tour or by another station, is the last merge seen; a refused merge is not", async () => {
  const t = tour();
  t.etat.tickets = [ticket(1, "in-pass"), ticket(2)];
  await t.client.fires();
  t.avancer(3);
  await t.client.fires();
  assert.equal(t.observation.observation().dernierMerge, null, "a delivery still in pass is not merged");
  t.etat.tickets = [ticket(2)];
  await t.client.fires();
  assert.equal(t.observation.observation().dernierMerge, "2026-11-20T12:03:00.000Z");
  t.avancer(4);
  t.etat.merge = false;
  await t.client.merger(7, "sha");
  assert.equal(t.observation.observation().dernierMerge, "2026-11-20T12:03:00.000Z");
  t.etat.merge = true;
  await t.client.merger(7, "sha");
  assert.equal(t.observation.observation().dernierMerge, "2026-11-20T12:07:00.000Z");
});

test("a ticket served or closed leaves the count of takes and the queue; with nothing cookable, nothing is", async () => {
  const t = tour();
  t.etat.tickets = [ticket(2)];
  t.etat.commentaires.set(2, [prise("box")]);
  await t.client.fires();
  await t.client.commentaires(2);
  t.observation.sauter(2, "#2 is claimable but not claimed, the claim gate skipped it: zone held by #1");
  assert.deepEqual(t.observation.file(), [{ ticket: 2, titre: "Ticket 2", ligne: "#2 is claimable but not claimed, the claim gate skipped it: zone held by #1" }]);
  t.etat.tickets = [];
  await t.client.fires();
  assert.deepEqual(t.observation.observation().prises, []);
  assert.deepEqual(t.observation.file(), []);
  assert.equal(t.observation.observation().ticketCuisinable, false);
});

// Une cuisine en mémoire : son journal, son runtime dont le test donne les réveils, et un tour observé.
function cuisine(t: TestContext, reponse: Awaited<ReturnType<ConsulterLeSuperviseur>> = { message: '{"vu": "lint keeps failing", "gestes": [{"geste": "remettre-sur-le-rail", "ticket": 2, "note": "lint fixed upstream"}]}' }) {
  const journal = ouvrirJournal(repertoireTemporaire(t));
  t.after(() => journal.fermer());
  const ecouteurs: Array<(cause: CauseReveil) => void> = [];
  const runtime: Runtime = { projet: "shop", journal, surReveil: (ecouter) => (ecouteurs.push(ecouter), () => {}), arreter: () => {} };
  const f = tour();
  const ecrits: string[] = [];
  const brut = f.client as unknown as Record<string, unknown>;
  Object.assign(brut, {
    issue: async (numero: number) => ({ number: numero, title: "t", labels: ["served-elsewhere"], state: "open", createdAt: "", updatedAt: "", url: "" }),
    commenter: async (numero: number, corps: string) => void ecrits.push(`comment #${numero}: ${corps.split("\n")[1]}`),
    labelliser: async (numero: number, labels: string[]) => void ecrits.push(`+${labels.join(",")} #${numero}`),
    delabelliser: async (numero: number, label: string) => void ecrits.push(`-${label} #${numero}`),
  });
  const consignes: string[] = [];
  let liberer = () => {};
  let retenir = false;
  const dites: string[] = [];
  const tours: unknown[] = [];
  brancherSuperviseur(runtime, {
    observation: f.observation,
    consulter: () => async (consigne) => {
      consignes.push(consigne);
      if (retenir) await new Promise<void>((fin) => (liberer = fin));
      return reponse;
    },
    depot: "acme/shop",
    maintenant: f.maintenant,
    attendre: async () => {},
    dire: (ligne) => dites.push(ligne),
    surTour: (bilan) => tours.push(bilan),
  });
  const reveiller = () => {
    for (const ecouter of ecouteurs) ecouter("tick");
  };
  const fini = async (n: number) => {
    for (let i = 0; i < 50 && tours.length < n; i += 1) await new Promise((fin) => setImmediate(fin));
  };
  return { journal, f, ecrits, consignes, dites, tours, reveiller, fini, retenir: () => (retenir = true), liberer: () => ((retenir = false), liberer()) };
}

test("a ticket taken three times starts one run: the manager reads the dossier with its history, and its gesture is played and traced", async (t) => {
  const c = cuisine(t);
  c.f.etat.tickets = [ticket(2)];
  c.f.etat.commentaires.set(2, [prise("box"), prise("mac"), prise("box")]);
  await c.f.client.fires();
  await c.f.client.commentaires(2);
  c.reveiller();
  await c.fini(1);
  assert.equal(c.consignes.length, 1);
  assert.match(c.consignes[0] ?? "", /## The history of #2\n\n- 2026-11-20T10:00:00Z Taken by station `box`\./);
  assert.deepEqual(c.ecrits, ["comment #2: Put back on the rail by the supervisor.", "+fire #2", "-served-elsewhere #2", "comment #2: **Supervisor run** — #2 was taken 3 times without delivering."]);
  assert.deepEqual(c.dites, ["supervisor on shop: #2 was taken 3 times without delivering — #2 put back on the rail: lint fixed upstream, traced on #2"]);
});

test("a second trigger during a run starts nothing; the same trigger starts again only after its interval", async (t) => {
  const c = cuisine(t);
  c.retenir();
  c.f.etat.tickets = [ticket(2)];
  await c.f.client.fires();
  c.f.avancer(31);
  c.reveiller();
  c.reveiller();
  await new Promise((fin) => setImmediate(fin));
  assert.equal(c.consignes.length, 1);
  c.liberer();
  await c.fini(1);
  c.reveiller();
  await new Promise((fin) => setImmediate(fin));
  assert.equal(c.consignes.length, 1, "the same fact, just handled, does not start a new run");
  c.f.avancer(30);
  c.reveiller();
  await c.fini(2);
  assert.equal(c.consignes.length, 2);
  assert.deepEqual(c.dites, ["supervisor on shop: nothing merged for 30 min while a ticket is cookable — #2 put back on the rail: lint fixed upstream, traced on #2", "supervisor on shop: nothing merged for 30 min while a ticket is cookable — #2 put back on the rail: lint fixed upstream, traced on #2"]);
});

test("a kitchen that does not move for less than its thresholds starts nothing", async (t) => {
  const c = cuisine(t);
  c.f.etat.tickets = [ticket(2)];
  await c.f.client.fires();
  c.f.avancer(29);
  c.reveiller();
  await new Promise((fin) => setImmediate(fin));
  assert.deepEqual(c.consignes, []);
});

test("a kitchen the chef stopped, or switched off, is not supervised", async (t) => {
  const c = cuisine(t);
  c.f.etat.tickets = [ticket(2)];
  await c.f.client.fires();
  c.f.avancer(31);
  c.journal.ajouter({ project: "shop", ticket: null, author: "chef", type: "kitchen.stopped", payload: {} });
  c.reveiller();
  await new Promise((fin) => setImmediate(fin));
  assert.deepEqual(c.consignes, []);
});

test("an unreadable answer of the manager plays no gesture of its own, and the run says so", async (t) => {
  const c = cuisine(t, { illisible: "the manager's run did not finish: guard:tokens" });
  c.f.etat.tickets = [ticket(2)];
  c.f.etat.commentaires.set(2, [prise("box"), prise("mac"), prise("box")]);
  await c.f.client.fires();
  await c.f.client.commentaires(2);
  c.reveiller();
  await c.fini(1);
  assert.deepEqual(c.ecrits, ["comment #2: **Supervisor run** — #2 was taken 3 times without delivering."]);
  assert.deepEqual(c.dites, ["supervisor on shop: #2 was taken 3 times without delivering — no gesture, traced on #2"]);
});

test("a run whose observation cannot be read says so and stops nothing", async (t) => {
  const journal = ouvrirJournal(repertoireTemporaire(t));
  t.after(() => journal.fermer());
  const ecouteurs: Array<(cause: CauseReveil) => void> = [];
  const dites: string[] = [];
  brancherSuperviseur({ projet: "shop", journal, surReveil: (ecouter) => (ecouteurs.push(ecouter), () => {}), arreter: () => {} }, {
    observation: { client: () => ({ issue: async () => null }) as never, observation: () => { throw new Error("the tour's view is broken"); }, file: () => [] },
    consulter: () => async () => ({ message: "" }),
    depot: "acme/shop",
    dire: (ligne) => dites.push(ligne),
  });
  for (const ecouter of ecouteurs) ecouter("tick");
  assert.deepEqual(dites, ["supervisor on shop: not evaluated — the tour's view is broken"]);
});

test("without the tour's client, or without a manager, no run starts", async (t) => {
  const journal = ouvrirJournal(repertoireTemporaire(t));
  t.after(() => journal.fermer());
  const f = tour();
  f.etat.tickets = [ticket(2)];
  await f.client.fires();
  f.avancer(31);
  for (const [client, manager] of [[null, true], [f.client, false]] as const) {
    const ecouteurs: Array<(cause: CauseReveil) => void> = [];
    let consultations = 0;
    brancherSuperviseur({ projet: "shop", journal, surReveil: (ecouter) => (ecouteurs.push(ecouter), () => {}), arreter: () => {} }, {
      observation: { ...f.observation, client: () => client },
      consulter: () => (manager ? async () => ((consultations += 1), { message: "" }) : null),
      depot: "acme/shop",
      maintenant: f.maintenant,
      dire: () => {},
    });
    for (const ecouter of ecouteurs) ecouter("tick");
    await new Promise((fin) => setImmediate(fin));
    assert.equal(consultations, 0);
  }
});

test("the manager reads the tail of the journal: its last facts, oldest first, each with its ticket when it has one", async (t) => {
  const c = cuisine(t);
  c.f.etat.tickets = [ticket(2)];
  await c.f.client.fires();
  c.journal.ajouter({ project: "shop", ticket: 7, author: "chef", type: "todo.left", payload: { why: "answered" } } as never);
  c.journal.ajouter({ project: "shop", ticket: null, author: "runtime", type: "runtime.ticked", payload: { intervalMs: 30_000 } });
  c.f.avancer(31);
  c.reveiller();
  await c.fini(1);
  assert.match(c.consignes[0] ?? "", /\S+ todo\.left #7 \{"why":"answered"\}\n\S+ runtime\.ticked \{"intervalMs":30000\}\n/);
});
