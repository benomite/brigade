// Le rail et les cooks d'un projet, lus de GitHub seul (#2220 ; seul chemin depuis #2061) : la vue du rail range ses
// issues `fire` d'après leurs labels et leurs PR — en attente, prises, en pass, en WAITING, mises de côté (#2075) —, et
// l'onglet Cooks montre les stations d'après leurs commentaires de prise et leurs signes de vie (#2358). Joué sur un faux
// GitHub, puis rendu par le rail de l'app. Son TODO est ce qui attend le chef lu de GitHub, la lecture même que le
// second relaie (#2460).
import { LABELS_D_AVANT_PARKED_SANS_CARTE } from "../../../../runtime/src/github-etat/etats.ts";
import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { carry } from "../../../src/slip.ts";
import { actionsOfCard } from "../../../src/card-actions.ts";
import { understand, WITHOUT_REASON, board as boardOf, holdFacts, type Facts, type Board } from "../../../src/facts.ts";
import type { CallGitHub, AnswerGitHub } from "../../../src/board/client.ts";
import { readTheBoardOfRepository, type ReadOfBoardOfRepository, type BoardRead } from "../../../src/board/read.ts";
import { withWhatAwaitingTheChef, blockOfChef, readWhatAwaitingTheChef } from "../../../src/board/wait-of-chef.ts";
import type { MemoryOfReads } from "../../../src/board/rail-github.ts";
import { statusOfBoard } from "../../../src/board/rail.ts";
import { withTheRail, readTheRailOnGithub, type SignsOfLife } from "../../../src/vue/rail/github.ts";

const REPOSITORY = "acme/kitchen";
const ok = (data: unknown, etag?: string): AnswerGitHub => ({ status: 200, data, ...(etag === undefined ? {} : { etag }) });
const issue = (number: number, labels: string[], extra: object = {}) => ({
  number,
  title: `Ticket ${number}`,
  html_url: `https://github.com/${REPOSITORY}/issues/${number}`,
  created_at: "2026-11-03T21:00:00Z",
  labels: labels.map((name) => ({ name })),
  ...extra,
});
const taking = (id: number, station: string, the: string) => ({ id, body: `<!-- brigade:prise station=${station} -->\nTaken by station \`${station}\`.`, author_association: "OWNER", created_at: the });

// Le projet : #1 en attente, #2 pris par box/claude, #3 en pass (PR #40) cuisiné par mac/claude, #4 en WAITING, #5 en pass
// sans PR — GitHub ne dit d'elle aucun des quatre —, et #6, sans `fire`, avant le rail. Sa base est verte, ou rouge.
type World = { fermees?: unknown[]; base?: string; issues?: () => unknown[]; commentaires?: Record<number, unknown[]>; appels?: string[] };
function github({ fermees: closedEntries, base = "success", issues, commentaires: comments = {}, appels: calls = [] }: World = {}): CallGitHub {
  return async (path) => {
    calls.push(path);
    if (path.includes("/issues?") && path.includes("labels=fire")) {
      return ok(issues?.() ?? [issue(1, ["fire", "prio:2"]), issue(2, ["fire", "taken", "prio:1"]), issue(3, ["fire", "in-pass"]), issue(4, ["fire", "parked", "taken"]), issue(5, ["fire", "in-pass"]), issue(40, ["fire"], { pull_request: {} })]);
    }
    // Les issues d'un monde dit, au label demandé : ce qui attend le chef (board/wait-of-chef.ts).
    const label = /[?&]labels=([^&]+)/.exec(path)?.[1];
    if (path.includes("/issues?") && label !== undefined && issues !== undefined) return ok((issues() as { labels: { name: string }[] }[]).filter(({ labels }) => labels.some(({ name }) => name === label)));
    // Toutes les issues ouvertes : ce qui est avant le rail (board/read.ts).
    if (path.includes("/issues?")) return ok([issue(1, ["fire"]), issue(2, ["fire", "taken"]), issue(6, [])]);
    if (path.includes("/pulls?state=closed")) return ok(closedEntries ?? []);
    if (path.includes("/pulls?")) return ok([{ number: 40, state: "open", html_url: `https://github.com/${REPOSITORY}/pull/40`, created_at: "2026-11-04T02:30:00Z", head: { ref: "cook/3-github" }, body: "" }]);
    if (path === `/repos/${REPOSITORY}`) return ok({ default_branch: "main" });
    if (path.includes("/commits/main/check-runs")) return ok({ check_runs: [{ conclusion: base }] });
    const commented = /\/issues\/(\d+)\/comments/.exec(path)?.[1];
    if (commented !== undefined && comments[Number(commented)] !== undefined) return ok(comments[Number(commented)]);
    if (path.includes("/issues/2/comments")) return ok([taking(11, "box/claude", "2026-11-04T02:58:00Z")]);
    if (path.includes("/issues/3/comments")) return ok([taking(12, "mac/claude", "2026-11-04T01:00:00Z"), taking(13, "box/claude", "2026-11-04T01:00:05Z")]);
    if (/\/issues\/\d+\/(comments|events)/.test(path)) return ok([]);
    return { status: 404, data: {} };
  };
}

const READ = new Date("2026-11-04T03:02:03.076Z");
// La lecture de l'app (main.ts, `lireLeTableau`) : le rail, puis ce qui attend le chef.
const read = async (call: CallGitHub, memory?: MemoryOfReads, signs?: () => Promise<SignsOfLife>) =>
  withWhatAwaitingTheChef(await readTheBoardOfRepository({ depot: REPOSITORY, appeler: call, maintenant: () => READ, ...(memory === undefined ? {} : { memoire: memory }), ...(signs === undefined ? {} : { signes: signs }) }), call);

// Ce que la vue dessine de la lecture : le tableau de `facts`, avec la ligne de chaque ticket que `status` écrit.
function draws(readOne: ReadOfBoardOfRepository): Board {
  assert.ok(readOne.lu, "the rail is read");
  const facts = understand(JSON.stringify(readOne.faits));
  assert.ok(!("informe" in facts), `facts are in shape: ${"informe" in facts ? facts.informe : ""}`);
  return boardOf(facts as Facts, undefined, { texte: statusOfBoard(readOne), a: readOne.luLe });
}
const columns = (seenOne: Board) => Object.fromEntries(seenOne.rail.colonnes.map(({ nom: name, cartes: cards }) => [name, cards.map(({ ticket, mot: word, etat: state }) => `#${ticket} ${word ?? state}`)]));

describe("le rail d'un projet : ses issues, leurs labels et leurs PR", () => {
  test("ses issues `fire` rangées par état — en attente, prises, en pass, WAITING", async () => {
    const seenOne = draws(await read(github()));
    const readEntries = columns(seenOne);
    assert.deepEqual(readEntries["On the rail"], ["#1 queued", "#5 queued"]);
    assert.deepEqual(readEntries["Taken"], ["#2 taken"]);
    assert.deepEqual(readEntries["Pass"], ["#3 in pass"]);
    assert.deepEqual(readEntries["Waiting"], ["#4 waiting"]);
    // Les compteurs sont ceux de GitHub ; ni les livrés ni TODO ne sont comptés par la lecture du rail.
    assert.deepEqual(seenOne.compteurs.map(({ nombre: count }) => count), [5, 1, 1, 0, 0]);
  });

  test("une épique dont le corps liste les tickets garde `fire` et sa `prio:`, et n'est pas sur le rail (#2618)", async () => {
    const list = "Split.\n\n<!-- brigade:tickets -->\n**0/2 servi.**\n\n| #11 | A | ouvert |\n<!-- /brigade:tickets -->";
    const readOne = await readTheRailOnGithub({ depot: REPOSITORY, appeler: github({ issues: () => [issue(1, ["fire", "prio:2"]), issue(2583, ["fire", "prio:1", "model:opus", "effort:medium"], { body: list })] }), maintenant: () => READ });
    assert.deepEqual(readOne.tickets.map(({ ticket }) => ticket), [1]);
  });

  test("la cuisine est dite ouverte, et `status` dit le rail et ses cooks d'après GitHub", async () => {
    const readOne = await read(github());
    assert.ok(readOne.lu);
    assert.equal(draws(readOne).mot, "open");
    const status = statusOfBoard(readOne);
    assert.match(status, /^rail {7}1 taken · 1 in pass · 1 WAITING · 2 queued$/m);
    assert.match(status, /^cooks {6}2 running$/m);
  });

  test("ce que la lecture porte d'autre reste : ses autres rubriques, son TODO compté, ses livrés lus des PR mergées ; le rail et les cooks sont refaits", async () => {
    const before: BoardRead = {
      lu: true,
      depot: REPOSITORY,
      luLe: "2026-11-04T01:00:00.000Z",
      cuisine: { rubriques: [{ titre: "kitchen", lignes: ["open"] }, { titre: "rail", lignes: ["9 queued"] }, { titre: "cooks", lignes: ["9 running"] }] },
      faits: { etat: "ouverte", compteurs: { rail: 9, auTravail: 9, aLaPass: 9, attend: 2, livres24h: 4 }, rail: [] },
      file: [],
      bilans: [],
      lignesDuRail: [],
      activites: [],
    };
    const readOne = withTheRail(before, await readTheRailOnGithub({ depot: REPOSITORY, appeler: github(), maintenant: () => READ }));
    assert.equal(readOne.luLe, READ.toISOString());
    assert.deepEqual(readOne.cuisine.rubriques, [
      { titre: "kitchen", lignes: ["open"] },
      { titre: "rail", lignes: ["1 taken · 1 in pass · 1 WAITING · 2 queued"] },
      { titre: "cooks", lignes: ["2 running"] },
    ]);
    assert.deepEqual(readOne.faits.compteurs, { rail: 5, auTravail: 1, aLaPass: 1, attend: 2, livres24h: 0 });
  });

  test("base rouge : le ticket en pass est « base red »", async () => {
    assert.deepEqual(columns(draws(await read(github({ base: "failure" }))))["Pass"], ["#3 base red"]);
  });

  test("les bons disent qui tient chaque ticket et depuis quand, sa priorité, et la PR d'un ticket en pass", async () => {
    const readOne = await read(github());
    assert.ok(readOne.lu);
    const lines = new Map(readOne.lignesDuRail.map(({ ticket, ligne: line }) => [ticket, line.replace(/^ {2}#\d+ {2}/, "")]));
    assert.equal(lines.get(2), "taken  prio:1  by box/claude since 2026-11-04 02:58 UTC  Ticket 2");
    assert.equal(lines.get(3), "in pass  -  since 2026-11-04 02:30 UTC, cooked by mac/claude  Ticket 3");
    assert.equal(lines.get(1), "queued  prio:2  since 2026-11-03 21:00 UTC  Ticket 1");
    assert.deepEqual(carry({ etat: "pris", titre: "Ticket 2" }, { lignes: [lines.get(2) ?? ""], bloque: false }).dit.slice(0, 2), [
      { libelle: "taken by", valeur: "box/claude", exact: true },
      { libelle: "since", valeur: "2026-11-04 02:58 UTC" },
    ]);
    const cardItem = draws(readOne).rail.colonnes.find(({ nom: name }) => name === "Pass")?.cartes[0];
    assert.match(cardItem?.dit.find(({ libelle: wording }) => wording === "right now")?.valeur ?? "", /^awaiting review and merge PR of #3, for /);
    assert.equal(cardItem?.dit.find(({ libelle: wording }) => wording === "cooked by")?.valeur, "mac/claude");
    // L'âge du rail est celui de la lecture de GitHub.
    assert.equal(readOne.luLe, READ.toISOString());
    assert.equal(readOne.faits.lu, READ.toISOString());
    assert.deepEqual(
      (readOne.faits.rail as { ticket: number; depuis?: string }[]).map(({ ticket, depuis: since }) => [ticket, since ?? null]),
      [[2, "2026-11-04T02:58:00Z"], [1, null], [3, "2026-11-04T02:30:00Z"], [4, null], [5, null]],
    );
  });

  test("l'onglet Cooks : ses stations dites de GitHub — une qui cuit, une qui attend, une tue (#2358)", async () => {
    const sign = (name: string, lastSeen: string) => ({ name, lastSeen, stoppedAt: null, refreshMs: 120_000, selection: [REPOSITORY] });
    const signs = { lus: [sign("box", "2026-11-04T03:01:00Z"), sign("mac", "2026-11-04T03:00:30Z"), sign("atelier", "2026-11-04T03:01:30Z"), sign("pc", "2026-11-02T18:40:00Z")] };
    const seenOne = draws(await read(github(), undefined, async () => signs));
    assert.deepEqual(
      seenOne.stations?.lignes.map(({ station, etat: state, presente, vueLe: vueThe, cooks }) => ({ station, etat: state, presente, vueLe: vueThe, cooks: cooks.map(({ ticket }) => ticket) })),
      [
        { station: "atelier/claude", etat: "idle", presente: true, vueLe: "2026-11-04T03:01:30Z", cooks: [] },
        { station: "box/claude", etat: "cooking", presente: true, vueLe: "2026-11-04T03:01:00Z", cooks: [2] },
        { station: "mac/claude", etat: "cooking", presente: true, vueLe: "2026-11-04T03:00:30Z", cooks: [3] },
        { station: "pc/claude", etat: "silent", presente: false, vueLe: "2026-11-02T18:40:00Z", cooks: [] },
      ],
    );
    assert.deepEqual(seenOne.stations?.surGithub, { illisible: null });
    assert.deepEqual(seenOne.cooks.enCours.map(({ ticket, station }) => `#${ticket} ${station}`), ["#2 box/claude", "#3 mac/claude"]);
  });

  test("l'onglet Cooks, signes de vie illisibles : les stations qui tiennent un ticket, sans rien dire de leur présence, et pourquoi", async () => {
    const seenOne = draws(await read(github(), undefined, async () => ({ illisible: "GitHub did not answer" })));
    assert.deepEqual(
      seenOne.stations?.lignes.map(({ station, etat: state, presente }) => ({ station, etat: state, presente })),
      [
        { station: "box/claude", etat: "cooking", presente: undefined },
        { station: "mac/claude", etat: "cooking", presente: undefined },
      ],
    );
    assert.deepEqual(seenOne.stations?.surGithub, { illisible: "GitHub did not answer" });
  });

  test("plus de cent tickets : chaque page est lue", async () => {
    const calls: string[] = [];
    const cent = Array.from({ length: 100 }, (_, rank) => issue(100 + rank, ["fire"]));
    const seenOne = draws(await read(async (path, headers) => (path.includes("labels=fire") ? ok(/[?&]page=1$/.test(path) ? cent : [issue(300, ["fire"])]) : github({ appels: calls })(path, headers))));
    assert.equal(columns(seenOne)["On the rail"]?.length, 101);
  });

  test("GitHub qui refuse : la lecture du rail lève, et la lecture du projet échoue en le disant — jamais un rail vide", async () => {
    const refuses: CallGitHub = async (path, headers) => (path.includes("labels=fire") ? { status: 403, data: {} } : github()(path, headers));
    await assert.rejects(readTheRailOnGithub({ depot: REPOSITORY, appeler: refuses }), /^Error: GitHub answered HTTP 403$/);
    const missed = await read(refuses);
    assert.equal(missed.lu, false);
    assert.equal(!missed.lu ? missed.raison : "", "GitHub refused to read the rail of acme/kitchen (HTTP 403).");
  });

  test("relu avec les ETag : une seconde lecture sans changement redemande chaque chemin sous condition", async () => {
    const memory: MemoryOfReads = new Map();
    const conditions: string[] = [];
    const withEtag: CallGitHub = async (path, headers) => {
      if (headers?.["If-None-Match"] !== undefined) {
        conditions.push(path);
        return { status: 304, data: null };
      }
      return { ...(await github()(path)), etag: `"${path}"` };
    };
    const first = await read(withEtag, memory);
    const second = await read(withEtag, memory);
    assert.deepEqual(second, first);
    assert.ok(conditions.some((path) => path.includes("labels=fire")) && conditions.some((path) => path.includes("/issues/2/comments")));
  });

  // Ticket 3716 : GitHub numérote issues et PR d'une seule suite — la PR #40 de #3 se lirait comme un ticket.
  test("la carte d'un ticket en pass dit sa PR par son ticket : « PR of #3 », jamais « #40 » (ticket 3716)", async () => {
    const readOne = await read(github());
    assert.ok(readOne.lu);
    const cardItem = draws(readOne).rail.colonnes.find(({ nom: name }) => name === "Pass")?.cartes.find(({ ticket }) => ticket === 3) ?? assert.fail("pas de carte #3 dans Pass");
    const saidOnes = cardItem.dit.map(({ valeur: value }) => value).join("\n");
    assert.match(saidOnes, /awaiting review and merge PR of #3, for /);
    assert.doesNotMatch(saidOnes, /#40\b/);
  });
});

// Un ticket mis de côté (#2075) : #7 sorti de la cuisine après ses renvois, #8 retenu par `blocked-on-human` — un label
// d'attente d'avant parked : il est parqué pour le chef (#4260) —, #9 sorti à la main sans un mot, #10 sorti puis parqué par
// le chef.
describe("un ticket mis de côté par `served-elsewhere` ou `blocked-on-human`, sur GitHub seul (#2075)", () => {
  const issuesPutOfSide = () => [issue(1, ["fire"]), issue(7, ["fire", "served-elsewhere"]), issue(8, ["fire", "in-pass", "blocked-on-human"]), issue(9, ["fire", "served-elsewhere"]), issue(10, ["fire", "served-elsewhere", "parked"])];
  const comments = {
    7: [
      taking(21, "box/claude", "2026-11-04T01:00:00Z"),
      { id: 22, body: "<!-- brigade:renvoi n=3 sha=abc1234 -->\nStation `box/claude`: still not mergeable after 2 sends back — the review requested changes: the empty case is not tested\n\nTaken off the kitchen (`served-elsewhere`): a human decides.", author_association: "OWNER", created_at: "2026-11-04T02:00:00Z" },
      { id: 23, body: "<!-- brigade:manager -->\n**Manager — `served-elsewhere` : ce ticket ne se sert pas sur cette box.**", author_association: "OWNER", created_at: "2026-11-04T02:01:00Z" },
    ],
  };
  const readSetAside = () => read(github({ issues: issuesPutOfSide, commentaires: comments }));

  test("seul `blocked-on-human` entre dans TODO ; les autres restent sur le rail, jamais sous « outside the columns » ; dans WAITING si le chef l'y a mis", async () => {
    const seenOne = draws(await readSetAside());
    const readEntries = columns(seenOne);
    // Parqué pour le chef, #8 garde l'étape où il est, comme sous `chef-todo` (#4260).
    assert.deepEqual(readEntries["Awaiting you"], ["#8 queued"]);
    assert.deepEqual(readEntries["Waiting"], ["#10 waiting"]);
    assert.deepEqual(readEntries["On the rail"], ["#1 queued", "#7 set aside", "#9 set aside"]);
    assert.deepEqual(readEntries["Pass"], []);
    assert.deepEqual(seenOne.rail.hors, []);
  });

  test("sa carte dit pourquoi : celle de TODO pose sa question, celles du rail disent leur raison — ou qu'elles ont été posées à la main", async () => {
    const seenOne = draws(await readSetAside());
    const todo = seenOne.rail.colonnes.find(({ nom: name }) => name === "Awaiting you")?.cartes ?? [];
    assert.deepEqual(
      todo.map(({ ticket, ligne: line, miseDeCote: setAside, fiche: card, todo: cardItem }) => ({ ticket, ligne: line, miseDeCote: setAside, attendu: card.attendu, question: cardItem?.question })),
      [{ ticket: 8, ligne: "Parked for you by a waiting label of before parked: it waits for your answer.", miseDeCote: undefined, attendu: "Parked for you by a waiting label of before parked: it waits for your answer.", question: "It carries `blocked-on-human`, a waiting label of before parked: what do you decide?" }],
    );
    const rail = seenOne.rail.colonnes.find(({ nom: name }) => name === "On the rail")?.cartes ?? [];
    const said = Object.fromEntries(rail.map(({ ticket, ligne: line }) => [ticket, line]));
    assert.equal(said[7], "Will not start: its delivery was sent back to a cook 2 times and is still not mergeable.");
    assert.equal(said[9], "Will not start: it was set aside by hand, and no comment on the issue says why.");
    // Le message de la station reste derrière « details », en entier.
    assert.match(rail.find(({ ticket }) => ticket === 7)?.refus?.brut ?? "", /^still not mergeable after 2 sends back — /);
    assert.equal(WITHOUT_REASON, "set aside by hand — no reason on the issue");
  });

  // Ticket 4260 : un label d'attente d'avant parked pour le chef parque le ticket pour lui, comme `chef-todo` : il garde
  // l'étape où il est — en file, en pass —, jamais mis de côté ni parqué pour un autre.
  test("un ticket parqué pour le chef par un label d'avant parked garde l'étape où il est : en file, en pass", async () => {
    const [old] = LABELS_D_AVANT_PARKED_SANS_CARTE;
    const rail = await readTheRailOnGithub({ depot: REPOSITORY, appeler: github({ issues: () => [issue(8, ["fire", old as string]), issue(3, ["fire", "in-pass", old as string])] }), maintenant: () => READ });
    assert.deepEqual(rail.tickets.map(({ ticket, etat: state, miseDeCote: setAside }) => [ticket, state, setAside]), [[8, "en attente", undefined], [3, "en pass", undefined]]);
  });

  test("ni prise ni cook pour un ticket mis de côté, et la ligne `rail` de `status` le compte à part", async () => {
    const readOne = await readSetAside();
    assert.ok(readOne.lu);
    assert.deepEqual(readOne.faits?.cooks, []);
    assert.match(statusOfBoard(readOne), /^rail {7}1 WAITING · 2 queued · 2 set aside$/m);
  });
});

// Le Todo du chef du 2026-11-05 (#2422), tel que ses issues le disaient : treize cartes, aucune ne demandait rien — onze
// `served-elsewhere` de cause technique, deux livraisons à merger à la main (#2408, #2322) dont la ligne était un constat,
// aujourd'hui des cartes `chef-todo` (#4260), et #1683, l'issue du tableau de la cuisine. Les commentaires sont ceux que la
// station écrit (runtime/src/brigade-github.ts, renvois.ts).
describe("le Todo du chef ne tient que ce qui lui demande quelque chose, et chaque carte le demande (#2422)", () => {
  const sendBack = (n: number, reason: string) => ({ id: n, body: `<!-- brigade:renvoi n=3 sha=7579211 -->\nStation \`box/claude\`: still not mergeable after 2 sends back — ${reason}\n\nTaken off the kitchen (\`served-elsewhere\`): a human decides.`, author_association: "OWNER", created_at: "2026-11-05T01:00:00Z" });
  const withoutDelivery = (n: number) => ({ id: n, body: "<!-- brigade:echec n=3 -->\nStation `box/claude`: the cook stopped without a delivery — the cook committed nothing\n\nTaken off the kitchen (`served-elsewhere`) after 3 cooks without a delivery: a human decides.", author_association: "OWNER", created_at: "2026-11-05T01:00:00Z" });
  const judge = (n: number, ticket: number) => ({ id: n, body: `<!-- brigade:todo kind=merge-by-hand -->\nMerge the PR of #${ticket} by hand? It changes what judges it.\n- [merge] Merge the PR of #${ticket}`, author_association: "OWNER", created_at: "2026-11-05T01:00:00Z" });
  const conflict = "the PR conflicts with the base: merge the base into the branch, resolve the conflicts, run the gates, and commit";
  const ciRed = "the CI is red on `7579211` (PR #2400):\n- `app tests`";
  const review = "the review requested changes on `7579211` (PR #2401):\n\nThe empty case is not tested.";
  const technical: Record<number, unknown> = { 2301: sendBack(1, conflict), 2302: sendBack(2, ciRed), 2303: sendBack(3, review), 2304: withoutDelivery(4), 2305: sendBack(5, conflict), 2306: sendBack(6, ciRed), 2307: withoutDelivery(7), 2308: sendBack(8, review), 2309: sendBack(9, conflict), 2310: withoutDelivery(10), 2311: sendBack(11, ciRed) };
  const issues = () => [
    ...Object.keys(technical).map((n) => issue(Number(n), ["fire", "served-elsewhere"])),
    issue(2408, ["fire", "in-pass", "chef-todo"]),
    issue(2322, ["fire", "in-pass", "chef-todo"]),
    issue(1683, ["fire", "served-elsewhere", "kitchen-board"]),
  ];
  const comments = { ...Object.fromEntries(Object.entries(technical).map(([n, c]) => [Number(n), [c]])), 2408: [judge(21, 2408)], 2322: [judge(22, 2322)] };
  const readTheTodo = async () => draws(await read(github({ issues, commentaires: comments })));

  test("Todo montre deux cartes, #2408 et #2322, chacune une question qui nomme sa PR", async () => {
    const seenOne = await readTheTodo();
    const todo = seenOne.rail.colonnes.find(({ nom: name }) => name === "Awaiting you")?.cartes ?? [];
    assert.deepEqual(todo.map(({ ticket, todo: cardItem }) => [ticket, cardItem?.question, cardItem?.choix.map(({ texte: text }) => text)]), [
      [2322, "Merge the PR of #2322 by hand? It changes what judges it.", ["Merge the PR of #2322"]],
      [2408, "Merge the PR of #2408 by hand? It changes what judges it.", ["Merge the PR of #2408"]],
    ]);
    // Le merge est le choix de sa carte (#3368), joué par sa réponse : aucun autre geste de la fiche ne merge.
    for (const cardItem of todo) assert.ok(!actionsOfCard(cardItem).some(({ id }) => (id as string) === "merger"), `#${cardItem.ticket} offers no other merge gesture`);
  });

  test("les onze `served-elsewhere` techniques sont sur le rail, avec leur ligne, et aucun dans Todo", async () => {
    const seenOne = await readTheTodo();
    const rail = (seenOne.rail.colonnes.find(({ nom: name }) => name === "On the rail")?.cartes ?? []).filter(({ ticket }) => ticket in technical);
    assert.equal(rail.length, 11);
    assert.deepEqual([...new Set(rail.map(({ ligne: line }) => line))].sort(), [
      "Will not start: 3 cooks in a row stopped without delivering anything.",
      "Will not start: its delivery was sent back to a cook 2 times and is still not mergeable.",
    ]);
    // Le message brut, en entier, est gardé pour « details ».
    assert.ok(rail.every(({ refus: refusal }) => (refusal?.brut ?? "").includes(" — ")));
    assert.ok(!(seenOne.rail.colonnes.find(({ nom: name }) => name === "Awaiting you")?.cartes ?? []).some(({ ticket }) => ticket in technical));
  });

  test("#1683, l'issue du tableau de la cuisine, ne se montre nulle part", async () => {
    const seenOne = await readTheTodo();
    const everywhere = [...seenOne.rail.colonnes.flatMap(({ cartes: cards }) => cards), ...seenOne.rail.hors];
    assert.ok(!everywhere.some(({ ticket }) => ticket === 1683));
  });

  test("un `served-elsewhere` dont le commentaire marqué pose une question de produit entre dans Todo, avec cette question", async () => {
    const question = { id: 40, body: "<!-- brigade:todo kind=product-question -->\nShould the export keep the old column order?\n\nBoth are defensible.", author_association: "OWNER", created_at: "2026-11-05T02:00:00Z" };
    const seenOne = draws(await read(github({ issues: () => [issue(2312, ["fire", "served-elsewhere"])], commentaires: { 2312: [sendBack(1, conflict), question] } })));
    const todo = seenOne.rail.colonnes.find(({ nom: name }) => name === "Awaiting you")?.cartes ?? [];
    // La question n'est dite qu'une fois, sur la carte (#2434) : la ligne dit ce que sa sorte attend.
    assert.deepEqual(todo.map(({ ticket, ligne: line, chef, todo: cardItem }) => ({ ticket, ligne: line, chef, question: cardItem?.question })), [
      { ticket: 2312, ligne: "A product question waits for your answer.", chef: { sorte: "product-question", texte: "Should the export keep the old column order?\n\nBoth are defensible." }, question: "Should the export keep the old column order?" },
    ]);
  });
});

describe("ce qui attend le chef : la lecture du second", () => {
  test("la même entrée dans TODO que dans le bloc qu'il relaie, et rien d'autre", async () => {
    const question = { id: 40, body: "<!-- brigade:todo kind=product-question -->\nShould the export keep the old column order?", author_association: "OWNER", created_at: "2026-11-05T02:00:00Z" };
    const world = () => github({ issues: () => [issue(2312, ["fire", "served-elsewhere"])], commentaires: { 2312: [question] } });
    const readOne = await read(world());
    assert.ok(readOne.lu);
    const wait = await readWhatAwaitingTheChef({ depot: REPOSITORY, appeler: world(), maintenant: () => READ });
    assert.ok(wait.lue);
    assert.deepEqual(readOne.file.map(({ ticket }) => ticket), [2312]);
    assert.deepEqual(statusOfBoard(readOne).split("\n").filter((line) => line.includes("#2312")), blockOfChef(wait).filter((line) => line.includes("#2312")));
    const todo = draws(readOne).rail.colonnes.find(({ nom: name }) => name === "Awaiting you")?.cartes ?? [];
    assert.deepEqual(todo.map(({ ticket }) => ticket), [2312]);
  });

  test("ce qui attend le chef qui ne se lit pas : une lecture ratée, jamais un TODO vide", async () => {
    const rail = github();
    const refuses: CallGitHub = async (path) => (path.includes("labels=chef-todo") ? { status: 403, data: { message: "API rate limit exceeded" } } : rail(path));
    const readOne = await read(refuses);
    assert.ok(!readOne.lu);
    assert.match(readOne.raison, /^What awaits the chef in acme\/kitchen was not read from GitHub: GitHub answered HTTP 403/);
  });
});

describe("la colonne Served : les issues fermées par une PR mergée en 24 h", () => {
  const closedOne = (n: number, mergeThe: string | null, station = "box/claude") => ({
    number: 1000 + n, title: `#${n} — Ticket ${n}`, html_url: `https://github.com/${REPOSITORY}/pull/${1000 + n}`, created_at: "2026-11-05T10:00:00Z",
    updated_at: mergeThe ?? "2026-11-05T12:00:00Z", merged_at: mergeThe, head: { ref: `cook/${n}-github` }, body: `Closes #${n}\n\nCooked by station \`${station}\`.`,
  });

  test("brigade le 2026-11-06 : une trentaine de tickets servis, tous dans Served, le plus récent d'abord", async () => {
    const thirty = Array.from({ length: 30 }, (_, i) => closedOne(100 + i, new Date(Date.parse("2026-11-04T03:00:00Z") - (i + 1) * 40 * 60_000).toISOString()));
    const old = closedOne(99, "2026-11-02T00:00:00Z");
    const withoutMerge = closedOne(98, null);
    const seenOne = draws(await read(github({ fermees: [...thirty, withoutMerge, old] })));
    const servedOnes = columns(seenOne)["Served"] ?? [];
    assert.equal(servedOnes.length, 30);
    assert.equal(servedOnes[0]?.split(" ")[0], "#100");
    assert.ok(!servedOnes.some((c) => c.startsWith("#98 ") || c.startsWith("#99 ")), "neither unmerged nor older than 24 h");
    assert.equal(seenOne.compteurs.find(({ libelle: wording }) => wording === "served 24 h")?.nombre, 30);
  });

  test("une seule lecture des PR fermées par rafraîchissement", async () => {
    const calls: string[] = [];
    await read(github({ fermees: [closedOne(7, "2026-11-04T01:00:00Z")], appels: calls }));
    assert.equal(calls.filter((c) => c.includes("/pulls?state=closed")).length, 1);
  });
});
