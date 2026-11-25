// Une zone tenue par une PR périmée (#4243, `superviseur/zone-liberee.ts`) : ce que les tests d'acceptation ne disent
// pas — une écriture ou une lecture de GitHub qui échoue, une date qui ne se lit pas, une PR déjà libérée —, puis le
// chemin de production : la porte de prise nomme la PR qui tient la zone, le tour la garde, le superviseur branché lit
// les PR ouvertes et libère la zone à son réveil.
import assert from "node:assert/strict";
import { test, type TestContext } from "node:test";
import type { GitHubDuTour, TicketLu } from "../../src/brigade-github.ts";
import { gestesDe } from "../../src/autonomie/agents/gestes.ts";
import type { GitHub } from "../../src/github.ts";
import { ouvrirGitHub } from "../../src/github.ts";
import { ouvrirJournal } from "../../src/journal.ts";
import type { Runtime } from "../../src/runtime.ts";
import { brancherSuperviseur } from "../../src/superviseur/brancher.ts";
import { suivreLeTour } from "../../src/superviseur/tour.ts";
import { DELAI_PERIME_MS, lireLesBloques, ouvrirLesZones, peremption, type PRQuiTient } from "../../src/superviseur/zone-liberee.ts";
import { FauxGitHub } from "../faux-github.ts";
import { DEPOT, fauxGh, jusqua, repertoireTemporaire } from "../outils.ts";

const MAINTENANT = new Date("2026-11-25T12:00:00.000Z");
const ancien = new Date(MAINTENANT.getTime() - DELAI_PERIME_MS - 60_000).toISOString();
const recent = new Date(MAINTENANT.getTime() - 60_000).toISOString();
const pr = (number: number, autres: Partial<PRQuiTient> = {}): PRQuiTient => ({ number, auteur: "human", miseAJour: ancien, enCook: false, auPass: false, surLaBase: false, ...autres });

// Un client des zones dont chaque écriture ou lecture peut échouer, à la demande du test.
function client() {
  const f = { labels: [] as Array<[number, string[]]>, commentaires: [] as Array<[number, string]>, creees: [] as Array<{ title: string; body: string; labels: string[] }>, pannes: new Set<string>() };
  const panne = (nom: string) => {
    if (f.pannes.has(nom)) throw new Error(`${nom} is down`);
  };
  const github = {
    labelliser: async (n: number, labels: string[]) => (panne("labelliser"), void f.labels.push([n, labels])),
    commenter: async (n: number, corps: string) => (panne("commenter"), void f.commentaires.push([n, corps])),
    creerIssue: async (c: { title: string; body: string; labels: string[] }) => (panne("creerIssue"), f.creees.push(c), f.creees.length + 900),
    ouvertes: async () => (panne("ouvertes"), f.creees.map((c, i) => ({ number: i + 901, body: c.body }))),
  };
  return { f, github };
}

test("a PR is stale past the delay, or with its changes on the base; never while cooked or in pass, nor on an unreadable date", () => {
  assert.equal(peremption(pr(1, { miseAJour: recent }), MAINTENANT), null);
  assert.match(peremption(pr(1), MAINTENANT) ?? "", /no activity since/);
  assert.equal(peremption(pr(1, { miseAJour: new Date(MAINTENANT.getTime() - DELAI_PERIME_MS).toISOString() }), MAINTENANT), null, "exactly the delay is not past it");
  assert.match(peremption(pr(1, { miseAJour: recent, surLaBase: true }), MAINTENANT) ?? "", /already on the base/);
  assert.equal(peremption(pr(1, { surLaBase: true, enCook: true }), MAINTENANT), null);
  assert.equal(peremption(pr(1, { surLaBase: true, auPass: true }), MAINTENANT), null);
  assert.equal(peremption(pr(1, { miseAJour: "" }), MAINTENANT), null);
});

test("a label that cannot be posted writes no line on the ticket and opens no card; the next cycle tries again", async () => {
  const { f, github } = client();
  const zones = ouvrirLesZones({ github, maintenant: () => MAINTENANT });
  f.pannes.add("labelliser");
  const lignes = await zones.cycle([{ ticket: 10, pr: pr(90) }]);
  assert.deepEqual([f.labels, f.commentaires, f.creees], [[], [], []]);
  assert.match(lignes.join("\n"), /#90.*could not be labelled zone-released: labelliser is down/);
  f.pannes.clear();
  await zones.cycle([{ ticket: 10, pr: pr(90) }]);
  assert.deepEqual(f.labels, [[90, ["zone-released"]]]);
  assert.equal(f.creees.length, 1);
});

test("a release says itself once per PR, and a line that cannot be written on the ticket is said in the report", async () => {
  const { f, github } = client();
  const consignes: Array<[string, boolean]> = [];
  const zones = ouvrirLesZones({ github, maintenant: () => MAINTENANT, consigner: (ligne, auChef) => void consignes.push([ligne, auChef]) });
  f.pannes.add("commenter");
  const lignes = await zones.cycle([{ ticket: 10, pr: pr(77, { auteur: "brigade" }) }]);
  assert.equal(lignes.length, 2);
  assert.match(lignes[0] ?? "", /^Released the zone held by the stale PR #77 \(no activity since/);
  assert.match(lignes[1] ?? "", /could not be written on #10: commenter is down/);
  assert.deepEqual(consignes, [[lignes[0], false]]);
  f.pannes.clear();
  assert.deepEqual(await zones.cycle([{ ticket: 10, pr: pr(77, { auteur: "brigade" }) }]), [], "released already: nothing again");
  assert.equal(f.labels.length, 1);
});

test("a card that cannot be looked for, or opened, is said, and opened at a next cycle", async () => {
  const { f, github } = client();
  const consignes: Array<[string, boolean]> = [];
  const zones = ouvrirLesZones({ github, maintenant: () => MAINTENANT, consigner: (ligne, auChef) => void consignes.push([ligne, auChef]) });
  f.pannes.add("ouvertes");
  assert.match((await zones.cycle([{ ticket: 10, pr: pr(90) }])).join("\n"), /no card asks the chef about the stale PR #90 yet: .*ouvertes is down/);
  assert.deepEqual(f.creees, []);
  f.pannes = new Set(["creerIssue"]);
  assert.match((await zones.cycle([{ ticket: 10, pr: pr(90) }])).join("\n"), /could not be opened: creerIssue is down/);
  f.pannes.clear();
  assert.deepEqual(await zones.cycle([{ ticket: 10, pr: pr(90) }]), ["Asked the chef on #901 whether to close the human's stale PR #90."]);
  assert.equal(f.labels.length, 1, "labelled once");
  assert.equal(f.commentaires.length, 1, "said once");
  assert.deepEqual(consignes.map(([, auChef]) => auChef), [false, true]);
  assert.match(f.creees[0]?.body ?? "", /^<!-- brigade:zone-released pr=90 -->/);
});

test("a PR that already carries zone-released is not labelled nor said again; a human's still gets its one card", async () => {
  const { f, github } = client();
  const zones = ouvrirLesZones({ github, maintenant: () => MAINTENANT });
  await zones.cycle([{ ticket: 10, pr: pr(90, { liberee: true }) }, { ticket: 11, pr: pr(91, { liberee: true, auteur: "brigade" }) }]);
  assert.deepEqual([f.labels, f.commentaires], [[], []]);
  assert.equal(f.creees.length, 1);
  assert.match(f.creees[0]?.title ?? "", /#90/);
});

// Les PR ouvertes d'un dépôt, telles que le client les rend.
function lecture(prs: Array<{ number: number; branche: string; sha?: string; externe?: boolean; miseAJour?: string; labels?: string[] }>, options: { tete?: () => Promise<string>; comparer?: (de: string, a: string) => Promise<{ fichiers: string[]; complet: boolean } | null> } = {}) {
  const appels: string[] = [];
  return {
    appels,
    github: {
      prsOuvertes: async () => (appels.push("prsOuvertes"), prs),
      teteDeLaBase: async (branche: string) => (appels.push(`tete ${branche}`), options.tete === undefined ? "b".repeat(40) : options.tete()),
      ...(options.comparer === undefined ? {} : { fichiersEntre: async (de: string, a: string) => (appels.push(`compare ${a}`), options.comparer!(de, a)) }),
    },
  };
}

test("the blocked tickets are read from the open PRs: who wrote it, its activity, its label, and whether its changes are on the base", async () => {
  const l = lecture(
    [
      { number: 77, branche: "cook/12-github", sha: "1".repeat(40), miseAJour: ancien },
      { number: 78, branche: "feat/13-thing", sha: "2".repeat(40), miseAJour: recent, labels: ["zone-released"] },
      { number: 79, branche: "patch-1", sha: "3".repeat(40), miseAJour: recent },
      { number: 80, branche: "cook/14-github", sha: "4".repeat(40), miseAJour: recent, externe: true },
    ],
    { comparer: async (_de, a) => ({ fichiers: a.startsWith("3") ? [] : ["x.ts"], complet: true }) },
  );
  const bloques = await lireLesBloques(
    [
      { ticket: 1, pr: 77, enCook: false, auPass: false },
      { ticket: 2, pr: 78, enCook: false, auPass: false },
      { ticket: 3, pr: 79, enCook: false, auPass: false },
      { ticket: 4, pr: 80, enCook: false, auPass: false },
      { ticket: 5, pr: 81, enCook: false, auPass: false },
    ],
    l.github,
    "main",
    MAINTENANT,
  );
  assert.deepEqual(
    bloques.map(({ ticket, pr }) => [ticket, pr.number, pr.auteur, pr.liberee, pr.surLaBase]),
    [
      [1, 77, "brigade", false, false],
      [2, 78, "brigade", true, false],
      [3, 79, "human", false, true],
      [4, 80, "human", false, false],
    ],
    "a closed PR (#81) blocks nothing",
  );
  assert.deepEqual(l.appels, ["prsOuvertes", "tete main", `compare ${"2".repeat(40)}`, `compare ${"3".repeat(40)}`, `compare ${"4".repeat(40)}`], "an old PR is stale without a comparison, the head is read once");
});

test("no blocked ticket reads nothing; a PR cooked or in pass is not compared; a comparison that fails or is partial does not say on the base", async () => {
  const vide = lecture([]);
  assert.deepEqual(await lireLesBloques([], vide.github, "main", MAINTENANT), []);
  assert.deepEqual(vide.appels, []);
  const vivantes = lecture([{ number: 77, branche: "cook/12-github", sha: "1".repeat(40), miseAJour: recent }, { number: 78, branche: "cook/13-github", sha: "2".repeat(40), miseAJour: recent }], { comparer: async () => ({ fichiers: [], complet: true }) });
  const lues = await lireLesBloques([{ ticket: 1, pr: 77, enCook: true, auPass: false }, { ticket: 2, pr: 78, enCook: false, auPass: true }], vivantes.github, "main", MAINTENANT);
  assert.deepEqual(lues.map(({ pr }) => [pr.enCook, pr.auPass, pr.surLaBase]), [[true, false, false], [false, true, false]]);
  assert.deepEqual(vivantes.appels, ["prsOuvertes"]);
  for (const options of [{ comparer: async () => null }, { comparer: async () => ({ fichiers: [], complet: false }) }, { comparer: async () => Promise.reject(new Error("boom")) }, { tete: async () => Promise.reject(new Error("boom")), comparer: async () => ({ fichiers: [], complet: true }) }]) {
    const l = lecture([{ number: 77, branche: "patch-1", sha: "1".repeat(40), miseAJour: recent }], options);
    assert.equal((await lireLesBloques([{ ticket: 1, pr: 77, enCook: false, auPass: false }], l.github, "main", MAINTENANT))[0]?.pr.surLaBase, false);
  }
  const sansComparaison = lecture([{ number: 77, branche: "patch-1", sha: "1".repeat(40), miseAJour: recent }]);
  assert.equal((await lireLesBloques([{ ticket: 1, pr: 77, enCook: false, auPass: false }], sansComparaison.github, "main", MAINTENANT))[0]?.pr.surLaBase, false);
  await assert.rejects(lireLesBloques([{ ticket: 1, pr: 77, enCook: false, auPass: false }], { ...vide.github, prsOuvertes: async () => Promise.reject(new Error("down")) }, "main", MAINTENANT), /down/);
});

test("the claim gate names the open PR that holds a zone, and the tour keeps it with the state of that PR's ticket", async () => {
  const faux = new FauxGitHub();
  faux.feu(831, ["model:sonnet", "effort:medium"], "## Context\n\nx\n");
  const tenante = faux.prOuverte(["runtime/src/rail.ts"], "cook/831-abcdef01");
  tenante.issue = 831;
  faux.feu(875, ["fire", "model:sonnet", "effort:medium"], "## Context\n\nx\n\n## Zone\n\n- `runtime/src/rail.ts`\n\n## Acceptance\n\n- done\n");
  const dits: unknown[][] = [];
  const a = faux.station("A", { sauter: (...args) => void dits.push(args), cuisiner: async () => ({ echec: "no" }), avertir: () => {} });
  await a.tour();
  await a.calme();
  assert.ok(dits.some(([n, , , t]) => n === 875 && JSON.stringify(t) === JSON.stringify({ pr: tenante.number, branche: "cook/831-abcdef01" })));

  const tour = suivreLeTour(() => MAINTENANT);
  const calibre = ["fire", "model:opus", "effort:medium"];
  let tickets: TicketLu[] = [10, 11, 12].map((number) => ({ number, title: `T${number}`, labels: calibre, state: "open" }));
  tickets.push({ number: 20, title: "T20", labels: [...calibre, "taken"], state: "open" }, { number: 21, title: "T21", labels: [...calibre, "in-pass"], state: "open" });
  const github = tour.envelopper({ fires: async () => tickets } as unknown as GitHubDuTour);
  await github.fires();
  tour.sauter(10, "#10: zone held by #20", undefined, { pr: 120, branche: "cook/20-github" });
  tour.sauter(11, "#11: zone held by #21", undefined, { pr: 121, branche: "cook/21-github" });
  tour.sauter(12, "#12: zone held by the open PR on patch-1", undefined, { pr: 99, branche: "patch-1" });
  assert.deepEqual(tour.zonesTenues(), [
    { ticket: 10, pr: 120, enCook: true, auPass: false },
    { ticket: 11, pr: 121, enCook: false, auPass: true },
    { ticket: 12, pr: 99, enCook: false, auPass: false },
  ]);
  tour.sauter(12, "#12: capability missing");
  await github.fires();
  tickets = tickets.filter(({ number }) => number !== 11);
  await github.fires();
  assert.deepEqual(tour.zonesTenues(), [], "a ticket no longer skipped for a PR, or no longer read, drops");
});

test("the real client reads the activity and the labels of an open PR", async (t) => {
  const gh = fauxGh(t);
  const github = ouvrirGitHub({ depot: DEPOT, bin: gh.bin });
  gh.repondre(`repos/${DEPOT}/pulls?state=open&per_page=100`, { corps: [{ number: 7, head: { ref: "cook/7-github", sha: "1".repeat(40) }, updated_at: ancien, labels: [{ name: "zone-released" }, {}] }, { number: 8, head: { ref: "patch-1", sha: "2".repeat(40) } }] });
  for (const numero of [7, 8]) gh.repondre(`repos/${DEPOT}/pulls/${numero}/files?per_page=100`, { corps: [] });
  assert.deepEqual((await github.prsOuvertes?.())?.map(({ number, miseAJour, labels }) => [number, miseAJour, labels]), [[7, ancien, ["zone-released"]], [8, undefined, undefined]]);
});

// Le superviseur branché, sur un GitHub en mémoire : une PR humaine périmée tient la zone de #10.
function branche(t: TestContext, options: { arret?: boolean } = {}) {
  const repertoire = repertoireTemporaire(t);
  const journal = ouvrirJournal(repertoire);
  t.after(() => journal.fermer());
  const ecrit = { labels: [] as Array<[number, string[]]>, commentaires: [] as Array<[number, string]>, creees: [] as Array<{ titre: string; corps: string; labels: string[] }> };
  const github = {
    labelliser: async (n: number, labels: string[]) => void ecrit.labels.push([n, labels]),
    delabelliser: async () => undefined,
    commenter: async (n: number, corps: string) => void ecrit.commentaires.push([n, corps]),
    creerIssue: async (c: { titre: string; corps: string; labels: string[] }) => (ecrit.creees.push(c), 500 + ecrit.creees.length),
    issuesDepuis: async () => [
      ...ecrit.creees.map((c, i) => ({ number: 501 + i, body: c.corps, association: "OWNER" })),
      { number: 400, body: "<!-- brigade:zone-released pr=91 -->", association: "NONE" },
    ],
    prsOuvertes: async () => [{ number: 90, branche: "patch-1", fichiers: ["a.ts"], sha: "1".repeat(40), miseAJour: ancien, labels: [] }],
  } as unknown as GitHub;
  const tour = suivreLeTour(() => MAINTENANT);
  const lu = tour.envelopper({ fires: async () => [{ number: 10, title: "T10", labels: ["fire", "model:opus", "effort:medium"], state: "open" }] } as unknown as GitHubDuTour);
  const dits: string[] = [];
  let ecouter: (() => void) | null = null;
  const runtime = { projet: "shop", journal, repertoireEtat: repertoire, surReveil: (ecoute: () => void) => ((ecouter = ecoute), () => {}) } as unknown as Runtime;
  if (options.arret === true) journal.ajouter({ project: "shop", ticket: null, author: "chef", type: "project.switched-off", payload: {} } as never);
  brancherSuperviseur(runtime, { tour, github, depot: "acme/shop", branche: "main", consulter: () => null, maintenant: () => MAINTENANT, dire: (ligne) => void dits.push(ligne), repertoireEtat: repertoire });
  return { ecrit, dits, repertoire, lire: () => lu.fires(), tour, reveiller: () => ecouter?.() };
}

test("at a wake of the plugged supervisor, the zone of a skipped ticket held by a human's stale PR is released, said, logged, and the chef asked once", async (t) => {
  const p = branche(t);
  await p.lire();
  p.tour.sauter(10, "#10: zone held by the open PR on patch-1", undefined, { pr: 90, branche: "patch-1" });
  p.reveiller();
  await jusqua(() => p.ecrit.creees.length > 0);
  assert.deepEqual(p.ecrit.labels, [[90, ["zone-released"]]]);
  assert.equal(p.ecrit.commentaires.length, 1);
  assert.match(p.ecrit.commentaires[0]?.[1] ?? "", /^Released the zone held by the stale PR #90/);
  assert.ok(p.ecrit.creees[0]?.labels.includes("chef-todo"));
  assert.ok(p.dits.some((ligne) => /^supervisor on shop: Released the zone held by the stale PR #90/.test(ligne)));
  assert.deepEqual(gestesDe(p.repertoire, "supervisor").map(({ outcome }) => outcome), ["fixed by itself", "handed to the chef"]);
  p.reveiller();
  await new Promise((resoudre) => setTimeout(resoudre, 50));
  assert.equal(p.ecrit.creees.length, 1, "one card per PR");
});

test("a stopped kitchen releases nothing", async (t) => {
  const p = branche(t, { arret: true });
  await p.lire();
  p.tour.sauter(10, "#10: zone held by the open PR on patch-1", undefined, { pr: 90, branche: "patch-1" });
  p.reveiller();
  await new Promise((resoudre) => setTimeout(resoudre, 50));
  assert.deepEqual([p.ecrit.labels, p.ecrit.creees], [[], []]);
});
