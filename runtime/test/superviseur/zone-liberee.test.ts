// Une zone tenue par une PR périmée (#4243, `superviseur/zone-liberee.ts`) : ce que les tests d'acceptation ne disent
// pas — une écriture ou une lecture de GitHub qui échoue, une date qui ne se lit pas, une PR déjà libérée —, puis le
// chemin de production : la porte de prise nomme la PR périmée qu'elle ne compte plus, le tour la garde, le superviseur
// branché la marque à son réveil.
import assert from "node:assert/strict";
import { test, type TestContext } from "node:test";
import type { GitHubDuTour } from "../../src/brigade-github.ts";
import { gestesDe } from "../../src/autonomie/agents/gestes.ts";
import type { GitHub } from "../../src/github.ts";
import { ouvrirJournal } from "../../src/journal.ts";
import type { Runtime } from "../../src/runtime.ts";
import { brancherSuperviseur } from "../../src/superviseur/brancher.ts";
import { suivreLeTour } from "../../src/superviseur/tour.ts";
import { type Bloque, bloqueDe, DELAI_PERIME_MS, ouvrirLesZones } from "../../src/superviseur/zone-liberee.ts";
import { stationDuDepot } from "../../src/brigade-github.ts";
import { depotNeuf, FauxGitHub, fauxClient, STATION_DU_DEPOT } from "../faux-github.ts";
import { jusqua, repertoireTemporaire } from "../outils.ts";

const MAINTENANT = new Date("2026-11-25T12:00:00.000Z");
const ancien = new Date(MAINTENANT.getTime() - DELAI_PERIME_MS - 60_000).toISOString();
const recent = new Date(MAINTENANT.getTime() - 60_000).toISOString();
type PRQuiTient = Bloque["pr"];
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

test("a PR is stale from the claim gate's delay on, or with its changes on the base; never while cooked or in pass, nor on an unreadable date or base", async () => {
  const libere = async (lue: PRQuiTient) => {
    const { f, github } = client();
    const lignes = await ouvrirLesZones({ github, maintenant: () => MAINTENANT }).cycle([{ ticket: 10, pr: { ...lue, auteur: "brigade" } }]);
    return f.labels.length === 0 ? null : (lignes[0] ?? "");
  };
  assert.equal(await libere(pr(1, { miseAJour: recent })), null);
  assert.match((await libere(pr(1))) ?? "", /no activity since/);
  assert.equal(DELAI_PERIME_MS, 12 * 3_600_000, "the claim gate's stale delay");
  assert.equal(await libere(pr(1, { miseAJour: new Date(MAINTENANT.getTime() - DELAI_PERIME_MS + 1).toISOString() })), null, "just inside the delay");
  assert.match((await libere(pr(1, { miseAJour: new Date(MAINTENANT.getTime() - DELAI_PERIME_MS).toISOString() }))) ?? "", /no activity since/, "exactly the delay, as the claim gate");
  assert.match((await libere(pr(1, { miseAJour: recent, surLaBase: true }))) ?? "", /already on the base/);
  assert.equal(await libere(pr(1, { surLaBase: true, enCook: true })), null);
  assert.equal(await libere(pr(1, { surLaBase: true, auPass: true })), null);
  assert.equal(await libere(pr(1, { miseAJour: "" })), null);
  assert.match((await libere(pr(1, { miseAJour: "", surLaBase: async () => true }))) ?? "", /already on the base/, "the claim gate's lazy reading of the base");
  assert.equal(await libere(pr(1, { miseAJour: recent, surLaBase: async () => Promise.reject(new Error("GraphQL down")) })), null);
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
  assert.equal(f.creees.length, 0);
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

test("the claim gate names each open PR it no longer counts on a ticket's zone, stale or already released, and no other", async () => {
  const faux = new FauxGitHub();
  const zone = "## Context\n\nx\n\n## Zone\n\n- `runtime/src/rail.ts`\n\n## Acceptance\n\n- done\n";
  faux.feu(875, ["fire", "model:sonnet", "effort:medium"], zone);
  const vieille = faux.prOuverte(["runtime/src/rail.ts"], "patch-1");
  const liberee = faux.prOuverte(["runtime/src/rail.ts"], "feat/12-thing");
  const ailleurs = faux.prOuverte(["docs/autre.md"], "patch-2");
  const origine = faux.pour.bind(faux);
  faux.pour = (station: string) => {
    const github = origine(station);
    return {
      ...github,
      prsOuvertes: async () =>
        (await github.prsOuvertes()).map((ouverte) => ({ ...ouverte, misAJourLe: ouverte.number === liberee.number ? recent : ancien, labels: ouverte.number === liberee.number ? ["zone-released"] : [] })),
    } as ReturnType<FauxGitHub["pour"]>;
  };
  const dites: Array<[number, number, string]> = [];
  const a = faux.station("A", { maintenant: () => MAINTENANT, perimee: (ticket, pr) => void dites.push([ticket, pr.number, pr.branche]), cuisiner: async () => ({ echec: "no" }), avertir: () => {} });
  await a.tour();
  await a.calme();
  assert.deepEqual(dites, [[875, vieille.number, "patch-1"], [875, liberee.number, "feat/12-thing"]], `not #${ailleurs.number}, which changes no file of the zone`);
});

test("a station of the repo hands the claim gate's stale PRs to the supervisor's turn", async (t) => {
  const faux = new FauxGitHub();
  faux.feu(875, ["fire", "model:sonnet", "effort:medium"], "## Context\n\nx\n\n## Zone\n\n- `a.ts`\n\n## Acceptance\n\n- done\n");
  const vieille = faux.prOuverte(["a.ts"], "patch-1");
  const client = fauxClient(faux);
  const github = { ...client, prsOuvertes: async () => (await client.prsOuvertes!()).map((ouverte) => ({ ...ouverte, misAJourLe: ancien })) };
  const dites: Array<[number, number]> = [];
  const repertoire = repertoireTemporaire(t);
  const station = stationDuDepot({
    ...STATION_DU_DEPOT,
    github,
    depot: depotNeuf(repertoire),
    flux: repertoire,
    prise: () => ({ prendre: async () => ({ prise: false }), lacher: async () => true }),
    maintenant: () => MAINTENANT,
    avertir: () => {},
    perimee: (ticket, pr) => void dites.push([ticket, pr.number]),
  });
  if ("refus" in station) throw new Error(station.refus);
  await station.tour();
  assert.deepEqual(dites, [[875, vieille.number]]);
});

test("the tour keeps each stale PR once, as the supervisor reads it, until the claim gate no longer names it", async () => {
  const tour = suivreLeTour(() => MAINTENANT);
  const github = tour.envelopper({ fires: async () => [] } as unknown as GitHubDuTour);
  await github.fires();
  tour.perimee(10, { number: 90, branche: "patch-1", misAJourLe: ancien });
  tour.perimee(11, { number: 90, branche: "patch-1", misAJourLe: ancien });
  tour.perimee(12, { number: 91, branche: "cook/12-github", misAJourLe: ancien, labels: ["zone-released"], surLaBase: true });
  assert.deepEqual(tour.zonesPerimees(), [
    { ticket: 11, pr: { number: 90, auteur: "human", miseAJour: ancien, enCook: false, auPass: false, surLaBase: false, liberee: false } },
    { ticket: 12, pr: { number: 91, auteur: "brigade", miseAJour: ancien, enCook: false, auPass: false, surLaBase: true, liberee: true } },
  ]);
  await github.fires();
  assert.equal(tour.zonesPerimees().length, 2, "kept across one reading of the tickets, while the gate passes again");
  tour.perimee(10, { number: 90, branche: "patch-1" });
  await github.fires();
  assert.deepEqual(tour.zonesPerimees().map(({ pr }) => [pr.number, pr.miseAJour]), [[90, ""]], "a PR the gate no longer names drops");
  await github.fires();
  assert.deepEqual(tour.zonesPerimees(), []);
});

test("a PR's author is the brigade for a cook's or the second's branch, a human's otherwise", () => {
  assert.deepEqual(["cook/12-github", "feat/13-thing", "patch-1", "feat/thing", "Cook/12-x"].map((branche) => bloqueDe(1, { number: 2, branche }).pr.auteur), ["brigade", "brigade", "human", "human", "human"]);
});

// Le superviseur branché, sur un GitHub en mémoire : une PR humaine périmée tient la zone de #10.
function branche(t: TestContext, options: { arret?: boolean } = {}) {
  const repertoire = repertoireTemporaire(t);
  const journal = ouvrirJournal(repertoire);
  t.after(() => journal.fermer());
  const ecrit = { labels: [] as Array<[number, string[]]>, commentaires: [] as Array<[number, string]>, creees: [] as Array<{ titre: string; corps: string; labels: string[] }>, depuis: [] as string[] };
  const github = {
    labelliser: async (n: number, labels: string[]) => void ecrit.labels.push([n, labels]),
    delabelliser: async () => undefined,
    commenter: async (n: number, corps: string) => void ecrit.commentaires.push([n, corps]),
    creerIssue: async (c: { titre: string; corps: string; labels: string[] }) => (ecrit.creees.push(c), 500 + ecrit.creees.length),
    issuesDepuis: async (depuis: string) => (ecrit.depuis.push(depuis), [
      ...ecrit.creees.map((c, i) => ({ number: 501 + i, body: c.corps, association: "OWNER" })),
      { number: 400, body: "<!-- brigade:zone-released pr=91 -->", association: "NONE" },
    ]),
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

test("at a wake of the plugged supervisor, a human's stale PR the claim gate no longer counts is released, said, logged, and the chef asked once", async (t) => {
  const p = branche(t);
  await p.lire();
  p.tour.perimee(10, { number: 90, branche: "patch-1", misAJourLe: ancien });
  p.reveiller();
  await jusqua(() => p.ecrit.creees.length > 0);
  assert.deepEqual(p.ecrit.labels, [[90, ["zone-released"]]]);
  assert.equal(p.ecrit.commentaires.length, 1);
  assert.match(p.ecrit.commentaires[0]?.[1] ?? "", /^Released the zone held by the stale PR #90/);
  assert.ok(p.ecrit.creees[0]?.labels.includes("chef-todo"));
  assert.equal(p.ecrit.depuis[0], new Date(MAINTENANT.getTime() - 365 * 86_400_000).toISOString(), "the cards of the last year are looked for");
  assert.ok(p.dits.some((ligne) => /^supervisor on shop: Released the zone held by the stale PR #90/.test(ligne)));
  assert.deepEqual(gestesDe(p.repertoire, "supervisor").map(({ outcome }) => outcome), ["fixed by itself", "handed to the chef"]);
  p.reveiller();
  await new Promise((resoudre) => setTimeout(resoudre, 50));
  assert.equal(p.ecrit.creees.length, 1, "one card per PR");
});

test("a stopped kitchen releases nothing", async (t) => {
  const p = branche(t, { arret: true });
  await p.lire();
  p.tour.perimee(10, { number: 90, branche: "patch-1", misAJourLe: ancien });
  p.reveiller();
  await new Promise((resoudre) => setTimeout(resoudre, 50));
  assert.deepEqual([p.ecrit.labels, p.ecrit.creees], [[], []]);
});

test("a release that cannot even read the stale PRs is said, and the rest of the wake goes on", async (t) => {
  const p = branche(t);
  await p.lire();
  p.tour.zonesPerimees = () => {
    throw new Error("tour gone");
  };
  p.reveiller();
  await jusqua(() => p.dits.length > 0);
  assert.deepEqual(p.dits, ["supervisor on shop: the zones held by stale PRs were not released — tour gone"]);
});
