// La retenue sur l'état GitHub seul (#2281) : le journal n'y tient plus le
// rail, c'est le tour qui lit les tickets, et la retenue lit ce qu'il a vu par
// son client enveloppé. La limite de GitHub et le budget des écritures se
// lisent au compteur des appels de la station.
import assert from "node:assert/strict";
import { test, type TestContext } from "node:test";
import type { GitHubDuTour, TicketLu } from "../../src/brigade-github.ts";
import { decrireEtat, lireEtat } from "../../src/etat.ts";
import type { Fait } from "../../src/evenements.ts";
import { limitesDeLaStation } from "../../src/github-limite.ts";
import { ouvrirJournal } from "../../src/journal.ts";
import { ECRITURES_PAR_MINUTE, limiteDeLaStation } from "../../src/limite-github.ts";
import { brancherRetenue, signauxDeLaStation } from "../../src/retenue/brancher.ts";
import { cartesEnTodo } from "../../src/carte-todo.ts";
import { ticketDuCheck } from "../../src/carte-ci-windows.ts";
import { suivreLeTour } from "../../src/retenue/tour.ts";
import type { CauseReveil, Runtime } from "../../src/runtime.ts";
import { repertoireTemporaire } from "../outils.ts";

const A = (hhmmss: string) => `2026-11-04T${hhmmss}.000Z`;
const CALIBRE = ["fire", "model:opus", "effort:high"];
const ticket = (number: number, ...labels: string[]): TicketLu => ({ number, title: `Ticket ${number}`, labels: [...CALIBRE, ...labels], state: "open" });

// Un client du tour dont le test dit les tickets, les checks de la base et les merges.
function clientDicte() {
  const dicte = {
    tickets: [] as TicketLu[],
    checks: [] as Array<{ outcome: "green" | "red"; name?: string }>,
    merge: { fait: true } as { fait: true } | { fait: false; motif: string },
    // La tête de la PR de chaque ticket, et les checks de chaque tête.
    tetes: new Map<number, string>(),
    ci: new Map<string, Array<{ outcome: "green" | "red" | "pending"; name?: string }>>(),
  };
  const client = {
    fires: async () => dicte.tickets,
    dependancesOuvertes: async () => [],
    commentaires: async () => [],
    checksDeLaBase: async () => dicte.checks,
    merger: async () => dicte.merge,
    prDuTicket: async (issue: number) => {
      const sha = dicte.tetes.get(issue);
      return sha === undefined ? null : { number: 1000 + issue, sha, state: "open", merged: false, enRetard: false };
    },
    ci: async (sha: string) => dicte.ci.get(sha) ?? [],
  } as unknown as GitHubDuTour;
  return { dicte, client };
}

test("le tour vu par la retenue : attendent les tickets en pass et ceux qu'une station prendrait — pas ceux qui attendent le chef, un tiers, ou leur calibrage", async () => {
  let instant = A("00:00:00");
  const suivi = suivreLeTour(() => new Date(instant));
  const { dicte, client } = clientDicte();
  const github = suivi.envelopper(client);
  assert.deepEqual(suivi.vue(), { enAttente: [], attenteDepuis: null, dernierService: null, ouverture: A("00:00:00"), checksRouges: null, checks: null, attenteCI: null, explications: [] });

  instant = A("00:05:00");
  dicte.tickets = [
    ticket(1),
    ticket(2, "in-pass"),
    ticket(3, "taken"),
    ticket(4, "in-pass", "blocked-on-human"),
    { ...ticket(5), labels: ["fire", "model:opus"] },
    ticket(6, "hors-cuisine"),
    ticket(7, "waiting"),
    ticket(8, "chef-todo"),
  ];
  await github.fires();
  assert.deepEqual(suivi.vue().enAttente, [1, 2]);
  assert.equal(suivi.vue().attenteDepuis, A("00:05:00"));

  // Un tour plus tard, #9 arrive : l'attente se compte toujours du plus ancien.
  instant = A("00:10:00");
  dicte.tickets = [...dicte.tickets, ticket(9)];
  await github.fires();
  assert.deepEqual(suivi.vue().enAttente, [1, 2, 9]);
  assert.equal(suivi.vue().attenteDepuis, A("00:05:00"));
  assert.equal(suivi.vue().dernierService, null);

  // #2, en pass, n'est plus parmi les tickets ouverts : une autre station l'a servi.
  instant = A("00:20:00");
  dicte.tickets = dicte.tickets.filter(({ number }) => number !== 2);
  await github.fires();
  assert.equal(suivi.vue().dernierService, A("00:20:00"));

  // Un merge de ce tour est un service ; un merge refusé n'en est pas un.
  instant = A("00:30:00");
  dicte.merge = { fait: false, motif: "Base branch was modified" };
  await github.merger(10, "sha");
  assert.equal(suivi.vue().dernierService, A("00:20:00"));
  dicte.merge = { fait: true };
  await github.merger(10, "sha");
  assert.equal(suivi.vue().dernierService, A("00:30:00"));

  // Les checks rouges de la base, nommés.
  dicte.checks = [{ outcome: "green", name: "test (ubuntu-latest)" }, { outcome: "red", name: "test (windows-latest)" }, { outcome: "red" }];
  await github.checksDeLaBase();
  assert.deepEqual(suivi.vue().checksRouges, ["test (windows-latest)", "unnamed check"]);
});

// Un runtime sur un journal où le rail ne bouge pas — l'état GitHub seul —, et
// la retenue branchée sur le tour suivi.
function cuisineGitHubSeule(t: TestContext, station?: string) {
  let instant = A("00:00:00");
  const journal = ouvrirJournal(repertoireTemporaire(t), { maintenant: () => new Date(instant) });
  t.after(() => journal.fermer());
  journal.ajouter({ project: "brigade", ticket: null, author: "runtime", type: "runtime.started", payload: { pid: 1, host: "box" } } as Fait & { project: string; ticket: null; author: string });
  const suivi = suivreLeTour(() => new Date(instant));
  const { dicte, client } = clientDicte();
  const github = suivi.envelopper(client);
  const ecouteurs: Array<(cause: CauseReveil) => void> = [];
  const runtime: Runtime = { projet: "brigade", journal, surReveil: (ecouter) => (ecouteurs.push(ecouter), () => {}), arreter: () => {} };
  brancherRetenue(runtime, { tour: suivi, relance: null, station, maintenant: () => new Date(instant), dire: () => {} });
  const a = (hhmmss: string) => {
    instant = A(hhmmss);
  };
  const passer = (hhmmss: string) => {
    a(hhmmss);
    for (const ecouter of ecouteurs) ecouter("tick");
  };
  const tenues = () => journal.base.lire<{ payload: string }>("SELECT payload FROM events WHERE type = 'kitchen.held' ORDER BY seq").map(({ payload }) => JSON.parse(payload));
  const levees = () => journal.base.lire<{ payload: string }>("SELECT payload FROM events WHERE type = 'kitchen.hold-lifted' ORDER BY seq").map(({ payload }) => JSON.parse(payload));
  const lignes = () => decrireEtat(lireEtat(journal, new Date(instant)), new Date(instant)).filter((ligne) => /^ {2}kitchen {2}for /.test(ligne));
  const cartes = () => cartesEnTodo(journal.base).map(({ ticket }) => ticket);
  return { dicte, github, a, passer, tenues, levees, lignes, cartes };
}

test("GitHub seul : la base rouge sur ses checks Windows, rien de mergé depuis 30 min — une ligne dans la file du chef nomme les checks, et tombe au merge suivant", async (t) => {
  const c = cuisineGitHubSeule(t);
  c.dicte.tickets = [ticket(21, "in-pass"), ticket(22)];
  c.dicte.checks = [{ outcome: "red", name: "test (windows-latest)" }];
  await c.github.checksDeLaBase();
  await c.github.fires();
  c.passer("00:29:00");
  assert.equal(c.tenues().length, 0);
  c.passer("00:30:00");
  c.passer("00:45:00");
  assert.deepEqual(c.tenues(), [{ since: A("00:00:00"), tickets: [21, 22], cause: { kind: "base-red", sha: null, checks: ["test (windows-latest)"] }, gesture: c.tenues()[0].gesture, change: false }]);
  assert.match(c.lignes()[0] ?? "", /HELD: nothing served while 2 tickets wait \(#21, #22\) — cause: the base is red, failing: test \(windows-latest\) — to lift: fix the base by hand/);
  assert.equal(c.lignes().length, 1);

  c.a("00:50:00");
  await c.github.merger(21, "sha-21");
  c.passer("00:50:00");
  assert.deepEqual(c.levees(), [{ since: A("00:00:00"), reason: "served" }]);
  assert.deepEqual(c.lignes(), []);
});

// espace, le 2026-11-05 (#2456) : les livraisons approuvées attendaient une CI
// que le projet ne lance pas sur ses PR, et `status` disait « cause unknown ».
test("GitHub seul : des livraisons en pass dont la tête n'a aucun check — la ligne nomme l'attente de leur CI, puis les gates qui tournent", async (t) => {
  const c = cuisineGitHubSeule(t);
  c.dicte.tickets = [ticket(757, "in-pass"), ticket(759, "in-pass"), ticket(760, "in-pass"), ticket(30)];
  for (const [issue, sha] of [[757, "a757"], [759, "a759"], [760, "a760"]] as const) c.dicte.tetes.set(issue, sha);
  // #760 est rouge : il repart à un cook, il n'attend pas sa CI.
  c.dicte.ci.set("a760", [{ outcome: "red", name: "brigade/gates" }]);
  const lire = async () => {
    await c.github.checksDeLaBase();
    await c.github.fires();
    for (const issue of [757, 759, 760]) {
      const pr = await c.github.prDuTicket(issue);
      if (pr !== null) await c.github.ci(pr.sha);
    }
  };
  await lire();
  c.passer("00:45:00");
  assert.deepEqual(c.tenues()[0].cause, { kind: "ci-wait", tickets: [757, 759], running: [] });
  assert.match(c.lignes()[0] ?? "", /HELD: nothing served while 4 tickets wait \(#30, #757, #759, #760\) — cause: 2 deliveries in pass wait for a CI on their PR head \(#757, #759\), and no check has started there — to lift: check that the project's CI runs on its PRs/);
  assert.doesNotMatch(c.lignes()[0] ?? "", /cause unknown/);

  // Une station joue les gates de #757 : la ligne le dit, et se lèvera seule.
  c.dicte.ci.set("a757", [{ outcome: "pending", name: "brigade/gates" }]);
  c.dicte.ci.set("a759", [{ outcome: "green", name: "brigade/gates" }]);
  await lire();
  c.passer("00:50:00");
  assert.deepEqual(c.tenues().at(-1).cause, { kind: "ci-wait", tickets: [757], running: ["brigade/gates"] });
  assert.match(c.lignes()[0] ?? "", /cause: 1 delivery in pass waits for a CI on its PR head \(#757\), still running: brigade\/gates — nothing to do/);
});

test("GitHub seul : la limite de GitHub lue au compteur de la station — la cause et sa reprise, sans geste", async (t) => {
  const station = repertoireTemporaire(t);
  const limites = limitesDeLaStation(station);
  t.after(() => limites.fermer());
  limites.constater("gh", { sorte: "secondary-writes", depuis: Date.parse(A("00:20:00")), reprise: Date.parse(A("00:52:00")) });
  assert.deepEqual(signauxDeLaStation(station, new Date(A("00:30:00"))).limiteGitHub, { limit: "secondary-writes", backAt: A("00:52:00") });
  // Passée sa reprise, elle ne retient plus rien.
  assert.equal(signauxDeLaStation(station, new Date(A("00:53:00"))).limiteGitHub, null);

  const c = cuisineGitHubSeule(t, station);
  c.dicte.tickets = [ticket(31)];
  await c.github.fires();
  // 31 min après l'ouverture de la cuisine, la limite encore posée.
  c.passer("00:31:00");
  const [tenue] = c.tenues();
  assert.equal(tenue.cause.kind, "github-limit");
  assert.equal(tenue.gesture, null);
  assert.match(c.lignes()[0] ?? "", /GitHub is rate-limiting calls \(secondary limit, writes per minute\), back around \d\d:\d\d — nothing to do: it lifts on its own/);
});

test("le budget des écritures lu au compteur de la station : les écritures de l'heure et la prochaine", (t) => {
  const station = repertoireTemporaire(t);
  const horloge = Date.now();
  const limite = limiteDeLaStation(station, { maintenant: () => horloge });
  t.after(() => limite.fermer());
  assert.equal(signauxDeLaStation(station, new Date(horloge)).ecritures, null);
  for (let i = 0; i < ECRITURES_PAR_MINUTE; i += 1) limite.prendre("cuisine", "gh", { projet: "brigade", lecture: "issues", ecriture: true });
  assert.deepEqual(signauxDeLaStation(station, new Date(horloge)).ecritures, { writes: ECRITURES_PAR_MINUTE, nextAt: new Date(horloge + 60_000).toISOString() });
  // Sans station — le poste de dev —, rien ne se lit, rien ne se crée.
  assert.deepEqual(signauxDeLaStation(undefined, new Date(horloge)), { limiteGitHub: null, ecritures: null });
});

test("GitHub seul : un check Windows rouge sur la base lu par le tour met une seule carte dans TODO, que le tick rejoue sans doublon, et elle sort au vert (#2413)", async (t) => {
  const c = cuisineGitHubSeule(t);
  const lire = async (...checks: Array<{ outcome: "green" | "red"; name: string }>) => {
    c.dicte.checks = checks;
    await c.github.checksDeLaBase();
    c.passer("00:01:00");
  };
  await lire({ outcome: "red", name: "runtime-windows" }, { outcome: "red", name: "app-windows" }, { outcome: "red", name: "lint" });
  await lire({ outcome: "red", name: "runtime-windows" }, { outcome: "red", name: "app-windows" });
  assert.deepEqual(c.cartes().sort(), [ticketDuCheck("runtime-windows", "main"), ticketDuCheck("app-windows", "main")].sort());
  await lire({ outcome: "green", name: "runtime-windows" }, { outcome: "red", name: "app-windows" });
  assert.deepEqual(c.cartes(), [ticketDuCheck("app-windows", "main")]);
  await lire({ outcome: "green", name: "runtime-windows" }, { outcome: "green", name: "app-windows" });
  assert.deepEqual(c.cartes(), []);
});
