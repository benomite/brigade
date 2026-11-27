// WAITING sur un projet GitHub (#3075), devenu le parking (#4129) : toute carte de TODO porte « waiting for… », sur la
// carte et sur sa fiche, à l'écran large comme à celui d'un téléphone ; le formulaire demande quoi, de qui, et la relance,
// proposée à sept jours ; validé, le geste s'écrit sur l'issue, sur tout projet — jamais par une commande de la box (#4262) —,
// comme la station et le second l'y écrivent (runtime/src/attente-github/marque.ts, `corpsDuParking`). La carte quitte TODO et se
// montre dans WAITING avec ce qu'elle attend, de qui, et sa relance — lus du commentaire de parking ; le commentaire
// `**WAITING: awaiting …**` d'avant #4129 se lit encore. Une carte de WAITING porte « resume » et « it arrived, back to
// the kitchen », qui retirent `parked`. Joué sur un faux GitHub qui tient ses issues, leurs labels et leurs commentaires,
// lus et écrits ; la vue est jouée telle qu'elle est (helpers/false-vue.ts).
import { LABELS_D_AVANT_PARKED } from "../../../../runtime/src/github-etat/etats.ts";
import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { corpsDuParking } from "../../../../runtime/src/attente-github/marque.ts";
import { POWER_UP } from "../../../src/power-up.ts";
import { ACTIONS_OF_WAIT } from "../../../src/wait.ts";
import { forTheBar } from "../../../src/bar.ts";
import { EXAMPLE } from "../../../src/config.ts";
import { PALETTE } from "../../../src/colors.ts";
import { KITCHEN_ACTIONS } from "../../../src/kitchen.ts";
import { BANNER, understand, board, holdFacts, type Facts } from "../../../src/facts.ts";
import { CONFIRMED, DIRECT } from "../../../src/actions.ts";
import { TABS, HEADINGS } from "../../../src/tabs.ts";
import type { ClientOfThePriority } from "../../../src/priority.ts";
import { EFFORTS, MODELS } from "../../../src/projects/projects.ts";
import { withWhatAwaitingTheChef } from "../../../src/board/wait-of-chef.ts";
import type { CallGitHub, AnswerGitHub } from "../../../src/board/client.ts";
import { readTheBoardOfRepository, type BoardRead } from "../../../src/board/read.ts";
import { AT_THE_ARRIVAL, waitOnGithub, playTheWait, brandOfWait, thirdOfTheBrand, thirdOfComments } from "../../../src/vue/wait/wait-github.ts";
import { dayOf, relaunchProposed } from "../../../src/vue/wait/input.ts";
import { FakeScreen, playTheVue, repos, type Fake, type Played } from "../../helpers/false-vue.ts";

const REPOSITORY = "chef/parade";
const PROJECT = "parade";
const READ = "2026-11-09T10:00:00.000Z";
const issue = (ticket: number) => `https://github.com/${REPOSITORY}/issues/${ticket}`;
// Ce que `parked set` (ou le second) a posé sur #40.
const BRAND_40 = corpsDuParking({ what: "the signed quote", who: "the client", followUp: "2026-11-16T00:00:00.000Z" });

// Le commentaire d'entrée en WAITING d'avant #4129, tel que la commande `waiting set` du runtime l'écrivait
// (`direMarque`, retiré) : un ticket mis en attente avant garde ce qu'il attend.
const MONTH = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const two = (n: number) => String(n).padStart(2, "0");
const instantOfBefore = (iso: string) => {
  const date = new Date(iso);
  return `${date.getUTCDate()} ${MONTH[date.getUTCMonth()]} ${two(date.getUTCHours())}:${two(date.getUTCMinutes())} UTC`;
};
const AT_THE_ARRIVAL_OF_BEFORE = "it goes back to the kitchen, without going through TODO: it is put back on the rail, and a cook takes it in its turn";
function brandOfBefore(ticket: number, { what, who, since, followUp }: { what: string; who: string; since: string; followUp: string }, update: boolean): string {
  return [
    `**WAITING${update ? " — updated" : ""}: awaiting ${who}.** ${what}`,
    "",
    `- **from whom**: ${who}`,
    `- **since**: ${instantOfBefore(since)}`,
    `- **follow-up**: ${instantOfBefore(followUp)}`,
    `- **on arrival**: ${AT_THE_ARRIVAL_OF_BEFORE}`,
    "",
    `As long as it has the \`waiting\` label, the kitchen does not take it, and its follow-up does not take it out. Removing this label sends it back to the kitchen; \`brigade waiting resume ${ticket}\` gives it back the state it had before waiting.`,
  ].join("\n");
}
const OLD_40 = brandOfBefore(40, { what: "the signed quote", who: "the client", since: "2026-11-02T09:30:00.000Z", followUp: "2026-11-16T00:00:00.000Z" }, false);

type Comment = { body: string; created_at: string; author_association?: string };
type Issue = { labels: Set<string>; commentaires: Comment[] };
// #20, une carte `chef-todo` hors du rail ; #21, sur le rail ; #40, sur le rail et parqué, son commentaire de parking
// posé par un auteur du dépôt. `panne` : ce que GitHub rend à la place, pour un chemin.
function github(outage: (path: string) => AnswerGitHub | undefined = () => undefined) {
  const issues = new Map<number, Issue>([
    [20, { labels: new Set(["chef-todo"]), commentaires: [{ body: "<!-- brigade:todo kind=product-question -->\nShould the export keep the old columns?", created_at: "2026-11-08T09:00:00Z" }] }],
    [21, { labels: new Set(["fire"]), commentaires: [] }],
    [40, { labels: new Set(["fire", "parked"]), commentaires: [{ body: BRAND_40, created_at: "2026-11-02T09:31:00Z", author_association: "OWNER" }] }],
  ]);
  const writtenEntries: string[] = [];
  const ok = (data: unknown): AnswerGitHub => ({ status: 200, data });
  const call: CallGitHub = async (path) => {
    const outageRead = outage(path);
    if (outageRead !== undefined) return outageRead;
    const label = /\/issues\?.*\blabels=([^&]+)/.exec(path)?.[1];
    if (label !== undefined) {
      const page = Number(/[?&]page=(\d+)/.exec(path)?.[1] ?? "1");
      const carry = [...issues].filter(([, readEntry]) => readEntry.labels.has(label));
      return ok(page > 1 ? [] : carry.map(([number, readEntry]) => ({ number: number, title: `Ticket ${number}`, html_url: issue(number), created_at: "2026-11-01T00:00:00Z", labels: [...readEntry.labels].map((name) => ({ name })) })));
    }
    if (path.includes("/pulls?")) return ok([]);
    const [, number, what] = /\/issues\/(\d+)\/(comments|events)/.exec(path) ?? [];
    if (number !== undefined) return ok(what === "comments" && !/[?&]page=[2-9]/.test(path) ? (issues.get(Number(number))?.commentaires ?? []) : []);
    return { status: 404, data: { message: "Not Found" } };
  };
  const client: ClientOfThePriority = {
    lire: call,
    ecrire: async (methode, path, body) => {
      writtenEntries.push(`${methode} ${path}`);
      const outageRead = outage(`${methode} ${path}`);
      if (outageRead !== undefined) return outageRead;
      const [, number, remains] = /\/issues\/(\d+)(.*)$/.exec(path) ?? [];
      const readEntry = issues.get(Number(number));
      if (readEntry === undefined) return { status: 404, data: { message: "Not Found" } };
      if (methode === "POST" && remains === "/comments") {
        readEntry.commentaires.push({ body: (body as { body: string }).body, created_at: new Date().toISOString(), author_association: "OWNER" });
        return { status: 201, data: { html_url: `${issue(Number(number))}#issuecomment-9` } };
      }
      if (methode === "POST" && remains === "/labels") {
        for (const pose of (body as { labels: string[] }).labels) readEntry.labels.add(pose);
        return ok([]);
      }
      const removed = /^\/labels\/(.+)$/.exec(remains ?? "")?.[1];
      if (methode === "DELETE" && removed !== undefined) return readEntry.labels.delete(decodeURIComponent(removed)) ? ok([]) : { status: 404, data: { message: "Label does not exist" } };
      return { status: 404, data: { message: "Not Found" } };
    },
  };
  return { issues, ecrites: writtenEntries, appeler: call, client };
}
type World = ReturnType<typeof github>;

// La lecture de l'app (main.ts, `lireLeTableau`) : le rail lu de GitHub, puis ce qui attend le chef.
async function readParTheApp(world: World): Promise<BoardRead> {
  const readOne = await withWhatAwaitingTheChef(await readTheBoardOfRepository({ depot: REPOSITORY, appeler: world.appeler, maintenant: () => new Date(READ) }), world.appeler);
  assert.ok(readOne.lu, readOne.lu ? "" : readOne.raison);
  return readOne;
}
const factsOf = (readOne: BoardRead): Facts => {
  const readOnes = understand(JSON.stringify(readOne.faits));
  assert.ok(!("informe" in readOnes), "informe" in readOnes ? readOnes.informe : "");
  return readOnes as Facts;
};
const columnOf = (readOne: BoardRead, name: string) => board(factsOf(readOne)).rail.colonnes.find((column) => column.nom === name)?.cartes ?? [];

describe("la marque d'attente : ce que le runtime écrit sur l'issue, l'app le lit", () => {
  test("le commentaire de `waiting set` d'avant #4129 (direMarque) se lit encore : quoi, de qui, depuis, la relance, ce que fera l'arrivée", () => {
    assert.deepEqual(thirdOfTheBrand(OLD_40, "2026-11-02T09:31:00Z"), { quoi: "the signed quote", qui: "the client", depuis: "2026-11-02T09:30:00.000Z", relance: "2026-11-16T00:00:00.000Z", aLArrivee: AT_THE_ARRIVAL_OF_BEFORE });
    assert.deepEqual(thirdOfComments([{ body: OLD_40, created_at: "2026-11-02T09:31:00Z" }])?.relance, "2026-11-16T00:00:00.000Z");
    // Mise à jour, et à cheval sur deux années : la relance sans année est celle qui suit la mise en attente.
    const maj = brandOfBefore(40, { what: "the PO", who: "Acme", since: "2026-12-30T08:00:00.000Z", followUp: "2027-01-06T00:00:00.000Z" }, true);
    assert.deepEqual(thirdOfTheBrand(maj, "2026-12-30T08:01:00Z"), { quoi: "the PO", qui: "Acme", depuis: "2026-12-30T08:00:00.000Z", relance: "2027-01-06T00:00:00.000Z", aLArrivee: AT_THE_ARRIVAL_OF_BEFORE });
  });

  test("la marque que l'app écrit est celle de `parked set`, mot pour mot — une relance lointaine se relit telle quelle", () => {
    const relaunch = new Date("2028-03-01T00:00:00.000Z");
    const body = brandOfWait({ quoi: "the signed quote", qui: "the client" }, relaunch);
    assert.equal(body, corpsDuParking({ what: "the signed quote", who: "the client", followUp: relaunch.toISOString() }));
    // Ce que l'arrivée fera, l'app le dit dans les mots du commentaire.
    assert.ok(body.includes(AT_THE_ARRIVAL), body);
    assert.deepEqual(thirdOfComments([{ body: body, created_at: "2026-11-09T10:00:05Z", author_association: "OWNER" }]), { quoi: "the signed quote", qui: "the client", depuis: "2026-11-09T10:00:05.000Z", relance: relaunch.toISOString(), aLArrivee: `until 2028-03-01 00:00 UTC, then ${AT_THE_ARRIVAL}` });
  });

  test("un autre commentaire, ou une marque dont un morceau manque, ne se lit pas : rien n'est inventé ; la dernière marque l'emporte", () => {
    assert.equal(thirdOfTheBrand("**WAITING lifted** — no longer awaiting the client", "2026-11-02T09:31:00Z"), null);
    assert.equal(thirdOfTheBrand(OLD_40.replace(/- \*\*follow-up\*\*.*\n/, ""), "2026-11-02T09:31:00Z"), null);
    assert.equal(thirdOfTheBrand(OLD_40.replace("16 Nov", "16 Foo"), "2026-11-02T09:31:00Z"), null);
    const other = corpsDuParking({ what: "the PO", who: "Acme", followUp: "2026-11-20T00:00:00.000Z" });
    assert.equal(thirdOfComments([{ body: OLD_40, created_at: "2026-11-02T09:31:00Z" }, { body: other, created_at: "2026-11-05T08:01:00Z", author_association: "OWNER" }, { body: "thanks", created_at: "2026-11-06T08:00:00Z" }])?.qui, "Acme");
    // Une marque de parking d'un auteur hors du dépôt ne se lit pas.
    assert.equal(thirdOfComments([{ body: other, created_at: "2026-11-05T08:01:00Z", author_association: "NONE" }]), null);
    assert.equal(thirdOfComments([{ body: "thanks", created_at: "2026-11-06T08:00:00Z" }]), null);
  });
});

describe("la lecture de GitHub : TODO et WAITING", () => {
  test("toute carte de TODO porte « waiting for… » ; #40, au label `parked`, est dans WAITING avec ce qu'il attend", async () => {
    const readOne = await readParTheApp(github());
    assert.deepEqual(columnOf(readOne, "Awaiting you").map(({ ticket, gestes: actions }) => [ticket, actions]), [[20, ["attente-poser"]]]);
    const [waiting] = columnOf(readOne, "Waiting");
    assert.equal(waiting?.ticket, 40);
    assert.deepEqual(waiting?.gestes, ["attente-reprendre", "attente-arrivee"]);
    assert.deepEqual(waiting?.dit.slice(0, 2), [
      { libelle: "waiting for", valeur: "the signed quote" },
      { libelle: "from", valeur: "the client" },
    ]);
    assert.match(waiting?.dit.find(({ libelle: wording }) => wording === "follow-up")?.valeur ?? "", /^2026-11-16 00:00 UTC/);
  });

  test("une carte `chef-todo` mise en WAITING quitte TODO, et se montre dans WAITING, hors du rail", async () => {
    const world = github();
    const twenty = world.issues.get(20) ?? assert.fail();
    // Ce que « waiting for… » laisse sur l'issue (ticket 4129) : `chef-todo` reste, `parked` s'ajoute — elle attend un autre.
    twenty.labels.add("parked");
    twenty.commentaires.push({ body: corpsDuParking({ what: "the legal review", who: "legal", followUp: "2026-11-23T00:00:00.000Z" }), created_at: "2026-11-09T08:00:30Z", author_association: "OWNER" });
    const readOne = await readParTheApp(world);
    assert.deepEqual(columnOf(readOne, "Awaiting you"), []);
    assert.deepEqual(columnOf(readOne, "Waiting").map(({ ticket, dit: said }) => [ticket, said[0]?.valeur]), [
      [40, "the signed quote"],
      [20, "the legal review"],
    ]);
    // Le second ne la relaie pas non plus : elle n'attend pas le chef.
    assert.ok(!readOne.file.some(({ ticket }) => ticket === 20));
  });

  test("ce qu'attendent les issues en WAITING ne se lit pas : TODO reste lu, la carte de WAITING ne dit pas ce qu'elle attend, et le bloc dit pourquoi", async () => {
    const readOne = await readParTheApp(github((path) => (path.includes("/issues/40/comments") ? { status: 502, data: { message: "Bad Gateway" } } : undefined)));
    assert.deepEqual(columnOf(readOne, "Awaiting you").map(({ ticket }) => ticket), [20]);
    const [waiting] = columnOf(readOne, "Waiting");
    assert.equal(waiting?.ticket, 40);
    assert.match(waiting?.sans ?? "", /^not given/);
    assert.deepEqual(readOne.bilans, ["what the `parked` issues wait for was not read from GitHub: GitHub answered HTTP 502 on /repos/chef/parade/issues/40/comments — their WAITING cards do not say it until the next reading"]);
  });

  test("une issue au label `parked` sans marque lisible — posé à la main : sa carte est dans WAITING, sans rien inventer", async () => {
    const world = github();
    (world.issues.get(40) ?? assert.fail()).commentaires = [{ body: "waiting on the client", created_at: "2026-11-02T09:31:00Z" }];
    const [waiting] = columnOf(await readParTheApp(world), "Waiting");
    assert.equal(waiting?.ticket, 40);
    assert.deepEqual(waiting?.dit, []);
    assert.match(waiting?.sans ?? "", /^not given/);
  });
});

const inTenDays = () => dayOf(new Date(Date.now() + 10 * 86_400_000));

describe("les gestes : toujours écrits sur l'issue", () => {
  test("« waiting for… » pose la marque puis `parked` ; « resume » et « it arrived » retirent `parked` — rien ne part dans le second (#4262)", async () => {
    const world = github();
    const readOne = await readParTheApp(world);
    const play = (id: string, ticket: number, input?: unknown) => playTheWait({ id, ticket, saisie: input, aujourdhui: new Date(), lu: () => readOne, client: world.client });
    assert.ok("fait" in (await play("attente-poser", 20, { quoi: "x", qui: "y", relance: inTenDays() })));
    assert.deepEqual(world.ecrites, [`POST /repos/${REPOSITORY}/issues/20/comments`, `POST /repos/${REPOSITORY}/issues/20/labels`]);
    // Le commentaire porte en tête la marque que la station relit : le même que la commande de parking du second écrit.
    assert.match(world.issues.get(20)?.commentaires.at(-1)?.body ?? "", /^<!-- brigade:parked \{"what":"x","who":"y","followUp":"[^"]+"\} -->\n\*\*PARKED: waits for y\.\*\* x\n/);
    // `parked` retiré d'abord, puis chaque label d'attente d'avant parked.
    const removals = [`DELETE /repos/${REPOSITORY}/issues/40/labels/parked`, ...LABELS_D_AVANT_PARKED.map((label) => `DELETE /repos/${REPOSITORY}/issues/40/labels/${encodeURIComponent(label)}`)];
    assert.ok("fait" in (await play("attente-reprendre", 40)));
    assert.deepEqual(world.ecrites.slice(-removals.length), removals);
    assert.ok("fait" in (await play("attente-arrivee", 40)));
    assert.deepEqual(world.ecrites.slice(-removals.length), removals);
  });
  test("« waiting for… » pose la marque puis `parked` ; relue, la carte est dans WAITING avec quoi, de qui et sa relance", async () => {
    const world = github();
    const readOne = await readParTheApp(world);
    const relaunch = inTenDays();
    const said = await playTheWait({ id: "attente-poser", ticket: 20, saisie: { quoi: " the legal review ", qui: "legal", relance: relaunch }, aujourdhui: new Date(), lu: () => readOne, client: world.client });
    assert.deepEqual(said, { fait: `in WAITING on GitHub: #20 awaits legal, follow-up on ${relaunch}`, detail: `${issue(20)}#issuecomment-9` });
    assert.deepEqual(world.ecrites, [`POST /repos/${REPOSITORY}/issues/20/comments`, `POST /repos/${REPOSITORY}/issues/20/labels`]);
    assert.ok(world.issues.get(20)?.commentaires.at(-1)?.body.startsWith("<!-- brigade:parked {\"what\":\"the legal review\",\"who\":\"legal\""), "la marque de la station n'est pas en tête du commentaire");
    const reread = await readParTheApp(world);
    assert.deepEqual(columnOf(reread, "Awaiting you"), []);
    const twenty = columnOf(reread, "Waiting").find(({ ticket }) => ticket === 20) ?? assert.fail("#20 n'est pas dans WAITING");
    assert.deepEqual(twenty.dit.slice(0, 2), [
      { libelle: "waiting for", valeur: "the legal review" },
      { libelle: "from", valeur: "legal" },
    ]);
    const [an, month, day] = relaunch.split("-").map(Number);
    assert.equal(factsOf(reread).rail.find(({ ticket }) => ticket === 20)?.tiers?.relance, new Date(an ?? 0, (month ?? 1) - 1, day).toISOString());
    // « resume » : `parked` retiré, la carte revient dans TODO.
    const resumed = await waitOnGithub({ id: "attente-reprendre", ticket: 20, saisie: undefined, aujourdhui: new Date(), lu: reread, client: world.client });
    assert.ok("fait" in resumed);
    assert.deepEqual(columnOf(await readParTheApp(world), "Awaiting you").map(({ ticket }) => ticket), [20]);
  });

  test("ce qui ne part pas se dit, et rien n'est montré fait : ce qu'il attend manquant, le commentaire refusé, le label refusé, un ticket pas lu", async () => {
    const healthy = github();
    const readOne = await readParTheApp(healthy);
    assert.deepEqual(await playTheWait({ id: "attente-poser", ticket: 20, saisie: { quoi: "", qui: "the client", relance: inTenDays() }, aujourdhui: new Date(), lu: () => readOne, client: healthy.client }), { refus: "nothing is written: say what it waits for, in your words", detail: "" });
    assert.deepEqual(await playTheWait({ id: "attente-poser", ticket: 99, saisie: { quoi: "x", qui: "y", relance: inTenDays() }, aujourdhui: new Date(), lu: () => readOne, client: healthy.client }), { refus: "nothing was written: #99 is not on the latest rail read — read it again", detail: "" });
    assert.deepEqual(await playTheWait({ id: "attente-poser", ticket: 20, saisie: { quoi: "x", qui: "y", relance: inTenDays() }, aujourdhui: new Date(), lu: () => undefined, client: healthy.client }), { refus: "nothing was written: the rail of this project has not been read yet — read it again", detail: "" });
    assert.deepEqual(healthy.ecrites, []);

    const commentRefuses = github((path) => (path.startsWith("POST") && path.endsWith("/comments") ? { status: 403, data: { message: "Resource not accessible by integration" } } : undefined));
    const refusal = await playTheWait({ id: "attente-poser", ticket: 20, saisie: { quoi: "x", qui: "y", relance: inTenDays() }, aujourdhui: new Date(), lu: () => readOne, client: commentRefuses.client });
    assert.deepEqual(refusal, { refus: "nothing was changed: GitHub did not take the WAITING comment on #20", detail: "GitHub refused the comment (HTTP 403): Resource not accessible by integration" });
    assert.deepEqual(commentRefuses.ecrites, [`POST /repos/${REPOSITORY}/issues/20/comments`]);

    const labelRefuses = github((path) => (path.startsWith("POST") && path.endsWith("/labels") ? { status: 403, data: { message: "Resource not accessible by integration" } } : undefined));
    const aHalf = await playTheWait({ id: "attente-poser", ticket: 20, saisie: { quoi: "x", qui: "y", relance: inTenDays() }, aujourdhui: new Date(), lu: () => readOne, client: labelRefuses.client });
    assert.deepEqual(aHalf, { refus: "#20 is not parked: its comment is posted, but GitHub did not set `parked` — try again", detail: "GitHub refused `parked` (HTTP 403): Resource not accessible by integration" });
    assert.deepEqual(columnOf(await readParTheApp(labelRefuses), "Awaiting you").map(({ ticket }) => ticket), [20], "sans le label, la carte reste dans TODO");
  });
});

// L'écran : la vue jouée devant le faux document, sur ce que la lecture de l'app range, et son geste `attente` porté par
// la chaîne du process principal (`jouerLAttente`), sur le faux GitHub.
const startup = () => ({
  configuration: forTheBar({ chemin: "/tmp/app.json", projets: [{ nom: PROJECT, dossier: "/tmp/parade" }] }, () => true),
  palette: PALETTE,
  exemple: EXAMPLE,
  onglets: TABS,
  rubriques: HEADINGS,
  gestes: { allumage: POWER_UP, cuisine: KITCHEN_ACTIONS, directs: DIRECT, confirmes: CONFIRMED, attente: ACTIONS_OF_WAIT },
  banniere: BANNER,
  calibrage: { modeles: MODELS, efforts: EFFORTS },
  code: undefined,
});

async function open(world: World, narrow = false): Promise<{ vue: Played; relire: () => Promise<void> }> {
  let last = await readParTheApp(world);
  const vue = await playTheVue(
    {
      demarrage: startup,
      espace: () => [],
      machines: () => [],
      attente: (_project, id, ticket, input) => playTheWait({ id, ticket, saisie: input, aujourdhui: new Date(), lu: () => last, client: world.client }),
    },
    { ecran: new FakeScreen(narrow) },
  );
  (vue.element("projets").children.at(1) ?? assert.fail("pas de case pour parade")).click();
  await repos();
  const reread = async () => {
    last = await readParTheApp(world);
    const receivedOne = holdFacts(() => new Map()).recevoir({ projet: PROJECT, demande: 0, a: READ, sorties: [{ commande: "facts", texte: JSON.stringify(last.faits) }] });
    vue.dire("surFaits", { ...receivedOne, demande: vue.dernier("faits")[0] as number });
  };
  await reread();
  return { vue, relire: reread };
}
const slipOf = (vue: Played, number: number): Fake => vue.element("rail").dessous("li").find((slip) => slip.className.split(" ").includes("bon") && slip.children[0]?.children[0]?.textContent === `#${number}`) ?? assert.fail(`pas de bon #${number}`);
const column = (vue: Played, name: string): Fake => vue.element("rail").dessous("section").find((pose) => pose.children[0]?.children[0]?.textContent === name) ?? assert.fail(`pas de colonne ${name}`);
const buttonOf = (or: Fake, text: string): Fake => or.dessous("button").find((pose) => pose.textContent === text) ?? assert.fail(`pas de bouton « ${text} »`);
const field = (or: Fake, name: string): Fake => or.dessous("input").find((pose) => pose.dataset.champ === name) ?? assert.fail(`pas de champ ${name}`);
const type = (entry: Fake, text: string) => {
  entry.value = text;
  entry.declencher("input");
};
const card = (vue: Played) => vue.element("fiche");

describe("sur l'écran d'un projet GitHub", () => {
  for (const narrow of [false, true]) {
    test(`${narrow ? "écran d'un téléphone" : "écran large"} : la carte de TODO porte « waiting for… », celle de WAITING « resume » et « it arrived, back to the kitchen »`, async () => {
      const { vue } = await open(github(), narrow);
      // TODO n'est pas une colonne (#3458) : la carte qui attend le chef est rouge, dans le backlog (#4238).
      assert.ok(column(vue, "Backlog").contains(slipOf(vue, 20)));
      assert.equal(slipOf(vue, 20).dataset.carte, "attente");
      assert.equal(buttonOf(slipOf(vue, 20), "waiting for…").dataset.attente, "attente-poser");
      // Parked, elle reste dans la colonne où elle attend : aucune colonne Waiting (#4238).
      assert.ok(column(vue, "Backlog").contains(slipOf(vue, 40)));
      assert.deepEqual(slipOf(vue, 40).dessous("button").filter(({ dataset }) => "attente" in dataset).map(({ textContent }) => textContent), ["resume", "it arrived, back to the kitchen"]);
      assert.equal(slipOf(vue, 40).dessous("p").find((pose) => pose.className === "ligne-carte")?.textContent, `waiting for the signed quote · from the client · follow-up ${dayOf(new Date("2026-11-16T00:00:00.000Z"))}`);
      // Plus rien ne dit que WAITING est une commande de la station.
      assert.ok(!vue.element("rail").textContent.includes("command of the station"));
    });
  }

  test("la fiche d'une carte de TODO porte « waiting for… » ; touché, le formulaire s'y ouvre — vide, la relance à sept jours", async () => {
    const { vue } = await open(github());
    slipOf(vue, 20).click();
    await repos();
    assert.equal(card(vue).hidden, false);
    const before = relaunchProposed(new Date());
    buttonOf(card(vue), "waiting for…").click();
    await repos();
    const form = card(vue).dessous("form")[0] ?? assert.fail("pas de formulaire sur la fiche");
    assert.deepEqual(form.dessous("label").map((label) => label.children[0]?.textContent), ["what it waits for, in your words", "from whom", "follow-up on"]);
    assert.deepEqual([field(form, "quoi").value, field(form, "qui").value], ["", ""]);
    assert.equal(field(form, "relance").type, "date");
    assert.ok([before, relaunchProposed(new Date())].includes(field(form, "relance").value), field(form, "relance").value);
  });

  test("validé sans ce qu'il attend : refusé, la phrase sous les champs, rien sur GitHub ; rempli, il part, et la carte passe dans WAITING avec quoi, de qui et sa relance", async () => {
    const world = github();
    const { vue, relire: reread } = await open(world);
    buttonOf(slipOf(vue, 20), "waiting for…").click();
    await repos();
    const form = () => slipOf(vue, 20).dessous("form")[0] ?? assert.fail("pas de formulaire");
    type(field(form(), "qui"), "legal");
    form().declencher("submit");
    await repos();
    assert.equal(form().dessous("p").find((pose) => pose.className === "refus")?.textContent, "nothing is written: say what it waits for, in your words");
    assert.deepEqual(world.ecrites, []);

    type(field(form(), "quoi"), "the legal review");
    form().declencher("submit");
    await repos();
    const [project, id, ticket, input] = vue.dernier("attente");
    assert.deepEqual([project, id, ticket], [PROJECT, "attente-poser", 20]);
    assert.deepEqual({ ...(input as object), relance: undefined }, { quoi: "the legal review", qui: "legal", relance: undefined });
    assert.deepEqual(world.ecrites, [`POST /repos/${REPOSITORY}/issues/20/comments`, `POST /repos/${REPOSITORY}/issues/20/labels`]);
    await reread();
    assert.ok(column(vue, "Backlog").contains(slipOf(vue, 20)));
    // Elle n'attend plus le chef : plus rouge, une seule carte, parked dans le backlog (#4238).
    assert.notEqual(slipOf(vue, 20).dataset.carte, "attente");
    assert.equal(vue.element("rail").dessous("li").filter((slip) => slip.className.split(" ").includes("bon") && slip.children[0]?.children[0]?.textContent === "#20").length, 1);
    // La carte dit les trois : quoi, de qui, et le jour de la relance choisi.
    assert.equal(slipOf(vue, 20).dessous("p").find((pose) => pose.className === "ligne-carte")?.textContent, `waiting for the legal review · from legal · follow-up ${(input as { relance: string }).relance}`);
    slipOf(vue, 20).click();
    await repos();
    const saidOnes = card(vue).dessous("li").map((done) => done.children[0]?.textContent);
    assert.deepEqual(saidOnes.slice(0, 4), ["waiting for", "from", "since", "follow-up"]);
  });

  // Déparquer : `parked` retiré, puis chaque label d'attente d'avant parked (runtime/src/github-etat/etats.ts) — un ticket que
  // l'un d'eux parque reprend aussi.
  const UNPARKED = (ticket: number) => ["parked", ...LABELS_D_AVANT_PARKED].map((label) => `DELETE /repos/${REPOSITORY}/issues/${ticket}/labels/${encodeURIComponent(label)}`);

  test("sur une carte de WAITING, « resume » et « it arrived, back to the kitchen » jouent chacun leur geste — `parked` retiré de l'issue", async () => {
    const world = github();
    const { vue } = await open(world);
    buttonOf(slipOf(vue, 40), "resume").click();
    await repos();
    assert.deepEqual(vue.dernier("attente"), [PROJECT, "attente-reprendre", 40, undefined]);
    assert.deepEqual(world.ecrites, UNPARKED(40));
    assert.equal(slipOf(vue, 40).dessous("p").find((pose) => pose.className === "arrivee")?.textContent, "resumed on GitHub: #40 no longer carries `parked` — it resumes exactly where it was");

    const other = github();
    const { vue: two } = await open(other);
    buttonOf(slipOf(two, 40), "it arrived, back to the kitchen").click();
    await repos();
    assert.deepEqual(two.dernier("attente"), [PROJECT, "attente-arrivee", 40]);
    assert.deepEqual(other.ecrites, UNPARKED(40));
  });
});
