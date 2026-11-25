// #4242 : la porte de prise — une PR ouverte ne tient une zone que tant qu'elle est vivante.
// Ce que les tests d'acceptation ne voient pas : la lecture de la base, ce que
// GitHub dit d'une PR (REST, GraphQL), et le ticket d'une PR `cook/<n>-…`.
import assert from "node:assert/strict";
import { test, type TestContext } from "node:test";
import { clientDuTour } from "../src/brigade-github.ts";
import { direZoneTenue, lecteurDeLaBase, vivante } from "../src/claim-gate.ts";
import { LABEL_IN_PASS, LABEL_TAKEN } from "../src/github-etat/etats.ts";
import { lireInstantane } from "../src/github-etat/instantane.ts";
import { ouvrirGitHub, type GitHub } from "../src/github.ts";
import { FauxGitHub } from "./faux-github.ts";
import { DEPOT, fauxGh } from "./outils.ts";

// Le délai de péremption et le label du superviseur, tels que le ticket les nomme.
const STALE_DELAY_MS = 12 * 3_600_000;
const LABEL_ZONE_RELEASED = "zone-released";
const MAINTENANT = Date.parse("2026-11-25T12:00:00Z");
const il_y_a = (ms: number): string => new Date(MAINTENANT - ms).toISOString();
const sansTicket = async () => null;

test("a PR alive by its ticket holds whatever its age; idle past the delay it holds nothing; a missing or unreadable activity keeps it", async () => {
  const vieille = { branche: "cook/70-x", misAJourLe: il_y_a(3 * STALE_DELAY_MS) };
  assert.equal(await vivante(vieille, { maintenant: MAINTENANT, parSonTicket: async () => "at the pass" }), "at the pass");
  assert.equal(await vivante(vieille, { maintenant: MAINTENANT, parSonTicket: sansTicket }), null);
  assert.equal(await vivante({ branche: "x" }, { maintenant: MAINTENANT, parSonTicket: sansTicket }), "its last activity is not known");
  assert.equal(await vivante({ branche: "x", misAJourLe: "not a date" }, { maintenant: MAINTENANT, parSonTicket: sansTicket }), "its last activity is not known");
  assert.match((await vivante({ branche: "x", misAJourLe: il_y_a(STALE_DELAY_MS - 1) }, { maintenant: MAINTENANT, parSonTicket: sansTicket })) ?? "", /^last activity 2026-11-25T00:00:00\.001Z, within the 12 h stale delay$/);
  assert.equal(await vivante({ branche: "x", misAJourLe: il_y_a(STALE_DELAY_MS) }, { maintenant: MAINTENANT, parSonTicket: sansTicket }), null);
});

test("`zone-released` and changes already on the base release even a PR in cook; a base that cannot be compared keeps it", async () => {
  const enCuisine = { maintenant: MAINTENANT, parSonTicket: async () => "in cook" };
  assert.equal(await vivante({ branche: "cook/7-x", labels: ["other", LABEL_ZONE_RELEASED] }, enCuisine), null);
  assert.equal(await vivante({ branche: "cook/7-x", labels: ["other"] }, enCuisine), "in cook");
  assert.equal(await vivante({ branche: "cook/7-x", surLaBase: async () => true }, enCuisine), null);
  assert.equal(await vivante({ branche: "cook/7-x", surLaBase: async () => false }, enCuisine), "in cook");
  assert.equal(await vivante({ branche: "cook/7-x", surLaBase: async () => Promise.reject(new Error("GraphQL down")) }, enCuisine), "in cook");
  assert.equal(await vivante({ branche: "cook/7-x", surLaBase: false }, enCuisine), "in cook");
});

test("the skip line names the PR, its ticket when it has one, and the reason", () => {
  assert.equal(direZoneTenue({ number: 4077, branche: "second/readme" }, "at the pass"), "zone held by open PR #4077 (at the pass)");
  assert.equal(direZoneTenue({ number: 2000, branche: "cook/70-abc" }, "in cook"), "zone held by #70 through its open PR #2000 (in cook)");
  assert.equal(direZoneTenue({ branche: "second/readme" }, "in cook"), "zone held by the open PR on `second/readme` (in cook)");
});

test("the base has the PR's changes when each of its files has the same blob on the base as on its head, read once", async () => {
  const lectures: Array<{ requete: string; variables: Record<string, string> }> = [];
  const reponses: unknown[] = [];
  const lire = async (requete: string, variables: Record<string, string>) => (lectures.push({ requete, variables }), reponses.shift());
  const lecteur = lecteurDeLaBase(lire, { owner: "acme", repo: "brigade", base: "main" });

  reponses.push({ repository: { t0: { oid: "1" }, b0: { oid: "1" }, t1: null, b1: null } });
  const memes = lecteur("abc", ["README.md", "old.md"]);
  assert.equal(await memes(), true);
  assert.equal(await memes(), true, "read once");
  assert.equal(lectures.length, 1);
  assert.deepEqual(lectures[0]?.variables, { owner: "acme", repo: "brigade", t0: "abc:README.md", b0: "main:README.md", t1: "abc:old.md", b1: "main:old.md" });
  assert.match(lectures[0]?.requete ?? "", /^query\(\$owner: String!, \$repo: String!, \$t0: String!, \$b0: String!, \$t1: String!, \$b1: String!\) \{ repository\(owner: \$owner, name: \$repo\) \{ t0: object\(expression: \$t0\) \{ oid \} b0: object\(expression: \$b0\) \{ oid \} t1:/);

  reponses.push({ repository: { t0: { oid: "1" }, b0: { oid: "2" } } });
  assert.equal(await lecteur("abc", ["README.md"])(), false);
  reponses.push({ repository: { t0: { oid: "1" }, b0: null } });
  assert.equal(await lecteur("abc", ["README.md"])(), false, "a file the base does not have");
  reponses.push({ repository: {} });
  assert.equal(await lecteur("abc", [])(), false, "a PR that changes nothing has nothing on the base");
  reponses.push(null);
  await assert.rejects(lecteur("abc", ["README.md"])(), /no repository/);
});

test("the REST client reads each open PR's last activity and labels", async (t: TestContext) => {
  const gh = fauxGh(t);
  const github = ouvrirGitHub({ depot: DEPOT, bin: gh.bin });
  gh.repondre(`repos/${DEPOT}/pulls?state=open&per_page=100`, { corps: [{ number: 7, head: { ref: "a", sha: "1".repeat(40) }, updated_at: "2026-11-25T10:00:00Z", labels: [{ name: LABEL_ZONE_RELEASED }] }, { number: 8, head: { ref: "b", sha: "2".repeat(40) } }] });
  for (const numero of [7, 8]) gh.repondre(`repos/${DEPOT}/pulls/${numero}/files?per_page=100`, { corps: [] });
  const lues = (await github.prsOuvertes?.()) ?? [];
  assert.deepEqual(lues.map(({ sha, misAJourLe, labels }) => [sha?.slice(0, 1), misAJourLe, labels]), [["1", "2026-11-25T10:00:00Z", [LABEL_ZONE_RELEASED]], ["2", undefined, undefined]]);
});

test("the snapshot reads each open PR's last activity and labels", () => {
  const pr = (extra: Record<string, unknown>) => ({ number: 1, headRefName: "a", headRefOid: "1", files: { nodes: [] }, commits: { nodes: [] }, ...extra });
  const lu = lireInstantane({ repository: { issues: { nodes: [] }, pullRequests: { nodes: [pr({ updatedAt: "2026-11-25T10:00:00Z", labels: { nodes: [{ name: LABEL_ZONE_RELEASED }] } }), pr({})] }, ref: null } });
  assert.deepEqual(lu.prs.map(({ misAJourLe, labels }) => [misAJourLe, labels]), [["2026-11-25T10:00:00Z", [LABEL_ZONE_RELEASED]], [undefined, []]]);
});

test("the turn's client gives the gate each PR's activity, labels and a reader of the base, over GraphQL only", async () => {
  const requetes: string[] = [];
  const github = (lireGraphql: unknown) =>
    ({
      ...(lireGraphql === undefined ? {} : { lireGraphql }),
      prsOuvertes: async () => [{ number: 7, branche: "a", fichiers: ["README.md"], sha: "abc", misAJourLe: "2026-11-25T10:00:00Z", labels: ["x"] }, { number: 8, branche: "b", fichiers: [] }],
      mettreAJour: async () => {},
      retraitsDeLabels: async () => [],
    }) as unknown as GitHub;
  const tour = clientDuTour(github(async (requete: string) => (requetes.push(requete), { repository: { t0: { oid: "1" }, b0: { oid: "1" } } })), "main", "acme/brigade");
  const [sept, huit] = await tour.prsOuvertes();
  assert.deepEqual([sept?.sha, sept?.misAJourLe, sept?.labels, typeof sept?.surLaBase], ["abc", "2026-11-25T10:00:00Z", ["x"], "function"]);
  assert.equal(typeof sept?.surLaBase === "function" && (await sept.surLaBase()), true);
  assert.equal(requetes.length, 1);
  assert.deepEqual(huit, { number: 8, branche: "b", fichiers: [] });
  const sansGraphql = await clientDuTour(github(undefined), "main", "acme/brigade").prsOuvertes();
  assert.equal(sansGraphql[0]?.surLaBase, undefined, "without GraphQL the base is not compared: the PR keeps its zone");
});

// La porte de prise sur le faux GitHub : une PR `cook/<n>-…` vit par son ticket.
async function porte(faux: FauxGitHub): Promise<{ sauts: string[]; raisons: unknown[]; cuit: boolean }> {
  const sauts: string[] = [];
  const raisons: unknown[] = [];
  const a = faux.station("A", {
    places: 2,
    maintenant: () => new Date(MAINTENANT),
    sauter: (_ticket: number, ligne: string, _attendus?: readonly number[], raison?: unknown) => {
      sauts.push(ligne);
      raisons.push(raison);
    },
    cuisiner: async () => ({ echec: "not the point" }),
    avertir: () => {},
  });
  await a.tour();
  await a.calme();
  return { sauts, raisons, cuit: faux.cuissons.some((c) => c.issue === 61) };
}

const CALIBRE = ["fire", "model:sonnet", "effort:medium"];
const corps = "Epic: #4204\n\n## Zone\n\n- `README.md`\n";

function avecUnePRDe(faux: FauxGitHub, ticket: number, age: number) {
  const pr = faux.prOuverte(["README.md"], `cook/${ticket}-abcdef01`);
  pr.issue = ticket;
  const origine = faux.pour.bind(faux);
  faux.pour = (station: string) => {
    const github = origine(station);
    return { ...github, prsOuvertes: async () => (await github.prsOuvertes()).map((ouverte) => ({ ...ouverte, misAJourLe: il_y_a(age) })) } as ReturnType<FauxGitHub["pour"]>;
  };
  return pr;
}

test("the PR of a ticket taken this turn is in cook however old: the skip says so and carries `zone-held`", async () => {
  const faux = new FauxGitHub();
  faux.feu(60, CALIBRE, corps);
  faux.feu(61, CALIBRE, corps);
  const pr = avecUnePRDe(faux, 60, 3 * STALE_DELAY_MS);
  const { sauts, raisons, cuit } = await porte(faux);
  assert.ok(!cuit);
  assert.ok(sauts.some((ligne) => ligne.startsWith("#61 ") && ligne.endsWith(`zone held by #60 through its open PR #${pr.number} (in cook)`)), sauts.join("\n"));
  assert.deepEqual(raisons.filter(Boolean), [{ code: "zone-held", pr: pr.number }]);
});

test("the PR of a ticket the turn did not read lives by that ticket's labels; stale and neither taken nor in pass, it holds nothing", async () => {
  const pris = new FauxGitHub();
  pris.feu(80, [LABEL_TAKEN]);
  pris.feu(61, CALIBRE, corps);
  avecUnePRDe(pris, 80, 3 * STALE_DELAY_MS);
  const tenu = await porte(pris);
  assert.ok(!tenu.cuit && tenu.sauts.some((ligne) => ligne.startsWith("#61 ") && ligne.includes("(in cook)")), tenu.sauts.join("\n"));

  const oublie = new FauxGitHub();
  oublie.feu(80, ["model:sonnet"]);
  oublie.feu(61, CALIBRE, corps);
  avecUnePRDe(oublie, 80, 3 * STALE_DELAY_MS);
  const libre = await porte(oublie);
  assert.ok(libre.cuit, libre.sauts.join("\n"));
  assert.deepEqual(libre.sauts.filter((ligne) => ligne.startsWith("#61 ")), []);
});

test("the PR of a ticket that cannot be read keeps its zone, however old", async () => {
  const faux = new FauxGitHub();
  faux.feu(61, CALIBRE, corps);
  avecUnePRDe(faux, 80, 3 * STALE_DELAY_MS);
  const origine = faux.pour.bind(faux);
  faux.pour = (station: string) => ({ ...origine(station), issue: async () => Promise.reject(new Error("GitHub down")) }) as ReturnType<FauxGitHub["pour"]>;
  const { sauts, cuit } = await porte(faux);
  assert.ok(!cuit);
  assert.ok(sauts.some((ligne) => ligne.startsWith("#61 ") && ligne.includes("(#80 could not be read)")), sauts.join("\n"));
});
