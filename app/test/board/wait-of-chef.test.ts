// Ce qui attend le chef, lu de GitHub seul (#2460) : les issues, leurs labels, leurs commentaires — jamais le tableau de la
// cuisine. Le TODO de l'app et la file que le second relaie à son ouverture sont cette lecture : les mêmes entrées, chacune
// avec sa question et son geste, dans le même bloc `awaiting`, et « nothing awaits the chef » quand rien n'attend. Joué sur
// un faux GitHub qui tient ses issues, leurs labels, leurs commentaires et leurs événements.
import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { putAside } from "../../src/awaiting.ts";
import { understand, board as boardOf, type Facts } from "../../src/facts.ts";
import { contextOfTheFile, readTheFile } from "../../src/second/file.ts";
import { withWhatAwaitingTheChef, blockOfChef, readWhatAwaitingTheChef, type WaitRead } from "../../src/board/wait-of-chef.ts";
import type { CallGitHub, AnswerGitHub } from "../../src/board/client.ts";
import { readTheBoardOfRepository } from "../../src/board/read.ts";
import { statusOfBoard } from "../../src/board/rail.ts";

const REPOSITORY = "acme/kitchen";
const READ = "2026-11-05T12:00:00.000Z";
const now = () => new Date(READ);

type Comment = { body: string; created_at: string; author_association?: string };
type Issue = { labels: string[]; commentaires?: Comment[]; evenements?: { event: string; label: { name: string }; created_at: string }[]; created_at?: string };
const said = (body: string, created_at: string): Comment => ({ body, created_at, author_association: "OWNER" });

// Le projet du 2026-11-05 : #8 en pass, sa livraison touche à ce qui la juge — sa carte `chef-todo` demande au chef de la
// merger ; #12, `served-elsewhere`, pose une question
// de produit avec ses choix ; #7, `served-elsewhere` après ses renvois, ne demande rien au chef ; #20, une carte `chef-todo` ;
// #30, parqué pour le chef par `question`, un label d'attente d'avant parked (#4260 ; d'abord un écart du manager) ; #31,
// `decision`, mais parqué pour un autre que le chef (`parked`, WAITING) ; #1683, l'issue du tableau de la cuisine.
// #1, sur le rail, calibré par le manager : rien ne le bloque (le rail bloqué, #3358 : test/rail-blocked/).
const WORLD: Record<number, Issue> = {
  1: { labels: ["fire", "model:sonnet", "effort:medium"] },
  7: { labels: ["fire", "served-elsewhere"], commentaires: [said("<!-- brigade:renvoi n=3 sha=abc1234 -->\nStation `box/claude`: still not mergeable after 2 sends back — the PR conflicts with the base\n\nTaken off the kitchen (`served-elsewhere`): a human decides.", "2026-11-05T01:00:00Z")] },
  8: { labels: ["fire", "in-pass", "chef-todo"], commentaires: [said("<!-- brigade:todo kind=merge-by-hand -->\nMerge the PR of #8 by hand? It changes what judges it.\n- [merge] Merge the PR of #8", "2026-11-05T09:00:00Z")] },
  12: {
    labels: ["fire", "served-elsewhere"],
    commentaires: [said("<!-- brigade:todo kind=product-question -->\nDoes the export keep the old column order?\n- [merge] Yes, merge PR #1560 as delivered\n- [close] No, we drop the export", "2026-11-05T08:00:00Z")],
  },
  20: { labels: ["chef-todo"], commentaires: [said("chatter", "2026-11-05T02:00:00Z"), said("<!-- brigade:todo kind=blocked -->\nWhich token does the box use for the registry?", "2026-11-05T10:00:00Z")] },
  30: { labels: ["question"], evenements: [{ event: "labeled", label: { name: "prio:2" }, created_at: "2026-11-04T08:00:00Z" }, { event: "labeled", label: { name: "question" }, created_at: "2026-11-05T06:00:00Z" }] },
  31: { labels: ["decision", "parked"] },
  1683: { labels: ["fire", "served-elsewhere", "kitchen-board"] },
};

// La ligne de #30, parqué par `question` sans commentaire qui pose une question : sa carte demande ce que son label attend (#3370).
const GAP_30 = "It carries `question`, a waiting label of before parked: what do you decide? — answer on its Todo card: “Back to the kitchen” or “Close it” — or in your own words";

// Un faux GitHub : les issues ouvertes au label demandé, leurs commentaires, leurs événements — et, pour le rail de l'app,
// ses PR. `appels` : chaque chemin demandé.
function github(world: Record<number, Issue> = WORLD, calls: string[] = []): CallGitHub {
  const ok = (data: unknown): AnswerGitHub => ({ status: 200, data });
  const issueJson = (number: number, issue: Issue) => ({ number: number, title: `Ticket ${number}`, html_url: `https://github.com/${REPOSITORY}/issues/${number}`, created_at: issue.created_at ?? "2026-11-01T00:00:00Z", labels: issue.labels.map((name) => ({ name })) });
  return async (path) => {
    calls.push(path);
    const label = /\/issues\?.*\blabels=([^&]+)/.exec(path)?.[1];
    if (label !== undefined) return ok(Object.entries(world).filter(([, issue]) => issue.labels.includes(label)).map(([number, issue]) => issueJson(Number(number), issue)));
    if (path.includes("/pulls?")) return ok([]);
    const [, number, what] = /\/issues\/(\d+)\/(comments|events)/.exec(path) ?? [];
    if (number !== undefined) return ok(what === "comments" ? (world[Number(number)]?.commentaires ?? []) : (world[Number(number)]?.evenements ?? []));
    return { status: 404, data: { message: "Not Found" } };
  };
}

const readEntry = async (call: CallGitHub = github()): Promise<Extract<WaitRead, { lue: true }>> => {
  const reading = await readWhatAwaitingTheChef({ depot: REPOSITORY, appeler: call, maintenant: now });
  assert.ok(reading.lue, JSON.stringify(reading));
  return reading;
};

describe("ce qui attend le chef, lu de GitHub", () => {
  test("une entrée par fait de GitHub qui demande quelque chose au chef, la plus ancienne d'abord, chacune avec sa question et son geste", async () => {
    const { attentes: waits } = await readEntry();
    assert.deepEqual(
      waits.map(({ ticket, quoi: what, depuis: since, ligne: line }) => ({ ticket, quoi: what, depuis: since, ligne: line })),
      [
        { ticket: 30, quoi: "ecart", depuis: "2026-11-05T06:00:00Z", ligne: GAP_30 },
        { ticket: 12, quoi: "mise-de-cote", depuis: "2026-11-05T08:00:00Z", ligne: "Does the export keep the old column order? — answer on its Todo card: “Yes, merge PR #1560 as delivered” or “No, we drop the export” — or in your own words" },
        { ticket: 8, quoi: "carte", depuis: "2026-11-05T09:00:00Z", ligne: "Merge the PR of #8 by hand? It changes what judges it. — answer on its Todo card: “Merge the PR of #8” — or in your own words" },
        { ticket: 20, quoi: "carte", depuis: "2026-11-05T10:00:00Z", ligne: "Which token does the box use for the registry? — answer on its Todo card, in your own words" },
      ],
    );
    // Ce que la carte de TODO en fait : la question du chef, de sa sorte.
    assert.equal(waits.find(({ ticket }) => ticket === 8)?.chef?.sorte, "merge-by-hand");
    assert.equal(waits.find(({ ticket }) => ticket === 20)?.chef?.sorte, "blocked");
  });

  test("le bloc `awaiting`, bords compris : sa tête, une ligne par entrée — son numéro, depuis quand, sa ligne, son titre", async () => {
    assert.deepEqual(blockOfChef(await readEntry()), [
      "awaiting   4 decisions await the chef — the oldest for 6 h 00",
      `  #30  for 6 h 00  ${GAP_30}  Ticket 30`,
      "  #12  for 4 h 00  Does the export keep the old column order? — answer on its Todo card: “Yes, merge PR #1560 as delivered” or “No, we drop the export” — or in your own words  Ticket 12",
      "  #8  for 3 h 00  Merge the PR of #8 by hand? It changes what judges it. — answer on its Todo card: “Merge the PR of #8” — or in your own words  Ticket 8",
      "  #20  for 2 h 00  Which token does the box use for the registry? — answer on its Todo card, in your own words  Ticket 20",
      "end awaiting",
      "",
    ]);
  });

  test("rien n'attend : le bloc le dit", async () => {
    const empty = await readEntry(github({ 1: { labels: ["fire"] }, 7: WORLD[7] as Issue }));
    assert.deepEqual(empty.attentes, []);
    assert.deepEqual(blockOfChef(empty), ["awaiting   nothing awaits the chef", "end awaiting", ""]);
  });

  test("répondue, la question de produit n'attend plus ; le label `chef-todo` retiré, la carte part", async () => {
    const answer = said("<!-- brigade:reponse gesture=merge -->\nYes, merge PR #1560 as delivered", "2026-11-05T11:00:00Z");
    const world = { ...WORLD, 12: { ...(WORLD[12] as Issue), commentaires: [...((WORLD[12] as Issue).commentaires ?? []), answer] }, 20: { ...(WORLD[20] as Issue), labels: [] } };
    assert.deepEqual((await readEntry(github(world))).attentes.map(({ ticket }) => ticket), [30, 8]);
  });

  test("une issue `chef-todo` dont la question ne se lit pas n'est pas une entrée, et le second en est prévenu (#2455) ; un `blocked-on-human` sans PR se lève", async () => {
    const world = {
      5: { labels: ["chef-todo"], created_at: "2026-11-05T05:00:00Z" },
      6: { labels: ["chef-todo"], created_at: "2026-11-05T05:30:00Z", commentaires: [said("<!-- brigade:todo kind=blocked -->\n  ", "2026-11-05T05:40:00Z")] },
      9: { labels: ["fire", "blocked-on-human"], created_at: "2026-11-05T07:00:00Z" },
    };
    const reading = await readEntry(github(world));
    assert.deepEqual(reading.attentes.map(({ ticket, ligne: line }) => [ticket, line]), [[9, "It carries `blocked-on-human`, a waiting label of before parked: what do you decide? — answer on its Todo card: “Back to the kitchen” or “Close it” — or in your own words"]]);
    assert.equal(reading.illisibles.length, 2);
    assert.match(reading.illisibles[0] ?? "", /^#5 carries `chef-todo` but is not shown in Todo: no comment marked/);
    assert.match(reading.illisibles[1] ?? "", /^#6 carries `chef-todo` but is not shown in Todo: its marked card has no text/);
    // Le second le lit dans le bloc `awaiting`.
    const block = blockOfChef(reading);
    assert.ok(block.includes(`  ${reading.illisibles[0]}`) && block.includes(`  ${reading.illisibles[1]}`), block.join("\n"));
    assert.ok(!block.some((line) => line.startsWith("  #5  for")));
  });

  // Ticket 4260 : un label d'attente d'avant parked pour le chef parque le ticket pour lui — une entrée, sa carte ; une mise
  // de côté n'en est une que par la question de produit qu'elle pose.
  test("un ticket du rail parqué pour le chef par un label d'avant parked est une entrée ; un `served-elsewhere` ne l'est que par sa question", async () => {
    const world = { 7: WORLD[7] as Issue, 9: { labels: ["fire", "in-pass", "blocked-on-human"], created_at: "2026-11-05T07:00:00Z" }, 12: WORLD[12] as Issue };
    assert.deepEqual((await readEntry(github(world))).attentes.map(({ ticket, quoi: what, chef }) => [ticket, what, chef?.sorte]), [
      [9, "ecart", "manager-parked"],
      [12, "mise-de-cote", "product-question"],
    ]);
  });

  test("le tableau de la cuisine n'est jamais lu, ni une entrée", async () => {
    const calls: string[] = [];
    const { attentes: waits } = await readEntry(github(WORLD, calls));
    assert.ok(!waits.some(({ ticket }) => ticket === 1683));
    assert.ok(!calls.some((path) => path.includes("kitchen-board") || path.includes("/issues/1683")), calls.join("\n"));
  });

  test("GitHub qui refuse, ou pas joint : dit pourquoi, jamais « rien n'attend »", async () => {
    const refusal = await readWhatAwaitingTheChef({ depot: REPOSITORY, appeler: async () => ({ status: 403, data: {} }), maintenant: now });
    assert.deepEqual(refusal, { lue: false, raison: `What awaits the chef in ${REPOSITORY} was not read from GitHub: GitHub answered HTTP 403 on /repos/${REPOSITORY}/issues.` });
    const injoint = await readWhatAwaitingTheChef({ depot: REPOSITORY, appeler: async () => assert.fail("getaddrinfo ENOTFOUND api.github.com"), maintenant: now });
    assert.equal(injoint.lue, false);
    assert.equal(!injoint.lue && injoint.horsLigne, true);
  });
});

describe("l'écart du manager : sa question, avec ses boutons (#3370)", () => {
  const ecarte = (comments: Comment[], label = "decision"): Record<number, Issue> => ({ 60: { labels: [label], commentaires: comments, evenements: [{ event: "labeled", label: { name: label }, created_at: "2026-11-05T06:00:00Z" }] } });
  const cardOf = async (world: Record<number, Issue>) => (await readEntry(github(world))).attentes.find(({ ticket }) => ticket === 60);

  test("la question du dernier commentaire du dépôt qui en pose une, ses choix et ce qui la précise ; ni la prise d'une station, ni un inconnu", async () => {
    const question = said("<!-- brigade:manager -->\n**Manager — set aside: a decision.**\n\nThe export can keep the old column order or follow the new one.\nWhich column order does the export keep?\n- [resume] Keep the old order\n- [drop] Not now", "2026-11-05T06:00:00Z");
    const taking = said("<!-- brigade:manager-prise station=box/claude etat=04bee3fe jeton=0dd01e18 fait -->\nManager work on this issue done by station `box/claude`. Done?", "2026-11-05T07:00:00Z");
    const unknown = { body: "Is this a good idea?", created_at: "2026-11-05T08:00:00Z", author_association: "NONE" };
    const entry = await cardOf(ecarte([question, taking, unknown]));
    assert.deepEqual(entry?.chef, {
      sorte: "manager-parked",
      texte: "Which column order does the export keep?\n- [resume] Keep the old order\n- [drop] Not now\n\nManager — set aside: a decision.\n\nThe export can keep the old column order or follow the new one.",
      recommandee: null,
    });
    assert.equal(entry?.quoi, "ecart");
    assert.equal(entry?.ligne, "Which column order does the export keep? — answer on its Todo card: “Keep the old order” or “Not now” — or in your own words");
  });

  test("une question sans choix : `Back to the kitchen` et `Close it` ; aucune question sur l'issue, ou une réponse du chef après elle : la carte demande ce que son label attend", async () => {
    const question = said("Should the invoices be exported as CSV or XLSX?", "2026-11-05T06:00:00Z");
    assert.equal((await cardOf(ecarte([question], "question")))?.chef?.texte, "Should the invoices be exported as CSV or XLSX?\n- [resume] Back to the kitchen\n- [close] Close it");
    assert.deepEqual((await cardOf(ecarte([said("No question here.", "2026-11-05T06:00:00Z")], "blocked-on-human")))?.chef, { sorte: "manager-parked", texte: "It carries `blocked-on-human`, a waiting label of before parked: what do you decide?\n- [resume] Back to the kitchen\n- [close] Close it", recommandee: null });
    const answeredOne = said("<!-- brigade:reponse gesture=resume -->\nCSV", "2026-11-05T07:00:00Z");
    assert.equal((await cardOf(ecarte([question, answeredOne], "question")))?.chef?.texte, "It carries `question`, a waiting label of before parked: what do you decide?\n- [resume] Back to the kitchen\n- [close] Close it");
  });

  test("une issue que le jugement refuse au chef (#3429) : le refus du manager porte sa décision en une phrase, que la carte pose avec ses deux gestes", async () => {
    // Le commentaire du manager tel que runtime/src/manager.ts l'écrit pour un refus `decision`.
    const refusal = said(
      [
        "<!-- brigade:manager -->",
        "**Manager — not a workable ticket: a decision issue.** Nothing is set, no cook will start.",
        "",
        "It asks to grant an IAM right that breaks the read-only rule, and says the call is the chef's.",
        "",
        "**What would make it workable.** The chef's call on the IAM right.",
        "",
        "**Yours to settle.** The manager sets `decision` on this issue: it is a card in your TODO. Answer it there — a choice or your own words — and the manager judges the issue again with your answer; or close the issue.",
        "",
        "Do you grant the deploy role write access to the backup bucket?",
        "",
        "_Judged by the manager in `sonnet` / `medium` · 1 turn · 3,390 tokens · 7.6 s._",
      ].join("\n"),
      "2026-11-05T06:00:00Z",
    );
    const entry = await cardOf(ecarte([refusal]));
    assert.equal(entry?.quoi, "ecart");
    assert.equal(entry?.ligne, "Do you grant the deploy role write access to the backup bucket? — answer on its Todo card: “Back to the kitchen” or “Close it” — or in your own words");
  });

  test("ses commentaires que GitHub ne rend pas : la lecture dit pourquoi, jamais une carte sans sa question", async () => {
    const world = ecarte([said("Which one?", "2026-11-05T06:00:00Z")]);
    const refuses: CallGitHub = async (path, headers) => (path.includes("/issues/60/comments") ? { status: 502, data: {} } : github(world)(path, headers));
    const reading = await readWhatAwaitingTheChef({ depot: REPOSITORY, appeler: refuses, maintenant: now });
    assert.deepEqual(reading, { lue: false, raison: `What awaits the chef in ${REPOSITORY} was not read from GitHub: GitHub answered HTTP 502 on /repos/${REPOSITORY}/issues/60/comments.` });
  });

  test("dans l'app, la carte de Todo montre la question du manager, un bouton par choix et le champ libre", async () => {
    const world = ecarte([said("Which column order does the export keep?\n- [resume] Keep the old order\n- [close] Drop the export", "2026-11-05T06:00:00Z")]);
    const readOne = await readByTheApp(github(world));
    assert.ok(readOne.lu);
    const facts = understand(JSON.stringify(readOne.faits));
    assert.ok(!("informe" in facts));
    const card = boardOf(facts as Facts, undefined, { texte: statusOfBoard(readOne), a: READ }).rail.colonnes.find(({ nom: name }) => name === "Awaiting you")?.cartes.find(({ ticket }) => ticket === 60);
    assert.equal(card?.todo?.question, "Which column order does the export keep?");
    assert.deepEqual(card?.todo?.choix.map(({ texte: wording }) => wording), ["Keep the old order", "Drop the export"]);
    assert.ok((card?.todo?.prixDuTexte ?? "") !== "", "the card offers its free answer");
  });
});

// La lecture de l'app (main.ts, `lireLeTableau`) : le rail, puis ce qui attend le chef.
const readByTheApp = async (call: CallGitHub) => withWhatAwaitingTheChef(await readTheBoardOfRepository({ depot: REPOSITORY, appeler: call, maintenant: now }), call);

describe("l'app et le second ne se contredisent pas : la même lecture, les mêmes entrées", () => {
  test("le Todo de l'app, son bloc `awaiting` et la file du second disent les mêmes entrées, dans le même ordre, mot pour mot", async () => {
    const readOne = await readByTheApp(github());
    assert.ok(readOne.lu, !readOne.lu ? readOne.raison : "");
    // L'app : le bloc de son `status`, et les cartes de Todo qu'elle en dessine.
    const status = statusOfBoard(readOne);
    const shownOne = putAside({ projet: "kitchen", demande: 0, a: READ, sorties: [{ commande: "status", texte: status }] });
    assert.ok(!("erreur" in shownOne) && shownOne.attend !== undefined, "status carries its awaiting block");
    const facts = understand(JSON.stringify(readOne.faits));
    assert.ok(!("informe" in facts), `facts are in shape: ${"informe" in facts ? facts.informe : ""}`);
    const todo = boardOf(facts as Facts, { bloc: shownOne.attend, a: READ }, { texte: status, a: READ }).rail.colonnes.find(({ nom: name }) => name === "Awaiting you")?.cartes ?? [];
    assert.deepEqual(todo.map(({ ticket }) => ticket), [30, 12, 8, 20]);
    // Le second : la même lecture, le même bloc.
    const file = await readTheFile(github(), REPOSITORY, now);
    assert.ok(file.lue, JSON.stringify(file));
    assert.equal(file.texte, shownOne.attend);
    const context = contextOfTheFile({ nom: "kitchen", depot: REPOSITORY }, file);
    assert.ok(context.includes(shownOne.attend.trimEnd()), context);
    assert.match(context, /from GitHub only .* not the Kitchen board/);
    assert.equal(facts.compteurs.attend, 4);
  });

  test("un Todo vide : l'app et le second disent tous deux « nothing awaits the chef »", async () => {
    const world = { 1: { labels: ["fire", "model:sonnet", "effort:medium"] } };
    const readOne = await readByTheApp(github(world));
    assert.ok(readOne.lu);
    assert.match(statusOfBoard(readOne), /^awaiting {3}nothing awaits the chef\nend awaiting$/m);
    const file = await readTheFile(github(world), REPOSITORY, now);
    assert.ok(file.lue);
    assert.equal(file.texte, "awaiting   nothing awaits the chef\nend awaiting\n");
  });

  test("GitHub qui ne rend pas ce qui attend le chef : une lecture ratée pour l'app — jamais un Todo vide —, dite au second", async () => {
    const refuses: CallGitHub = async (path, headers) => (path.includes("labels=chef-todo") ? { status: 502, data: {} } : github()(path, headers));
    const readOne = await readByTheApp(refuses);
    assert.equal(readOne.lu, false);
    assert.match(!readOne.lu ? readOne.raison : "", /^What awaits the chef in acme\/kitchen was not read from GitHub: GitHub answered HTTP 502/);
    const file = await readTheFile(refuses, REPOSITORY, now);
    assert.match(contextOfTheFile({ nom: "kitchen" }, file), /file non lue : GitHub n'a pas rendu ce qui attend le chef\nWhat awaits the chef/);
  });
});

// #4129 : le manager parque pour le chef l'issue qu'il lui refuse — `chef-todo` et la carte de sa question, plus le label
// `question` ou `decision`. Sa carte garde la réponse qu'il recommande, comme celle d'un écart (#3434).
describe("la carte `chef-todo` d'une question du manager (#4129)", () => {
  const card = (text: string): Record<number, Issue> => ({ 70: { labels: ["chef-todo"], commentaires: [said(`<!-- brigade:todo kind=product-question -->\n${text}`, "2026-11-05T06:00:00Z")] } });
  const entryOf = async (world: Record<number, Issue>) => (await readEntry(github(world))).attentes.find(({ ticket }) => ticket === 70);

  test("sa ligne `Recommended:` met en avant le choix qu'elle nomme, et quitte le texte de la carte", async () => {
    const entry = await entryOf(card("Which column order does the export keep?\n\n- [resume] Keep the old order\n- [close] Drop the export\n\n**Recommended:** Keep the old order — the users read it that way"));
    assert.deepEqual(entry?.chef, {
      sorte: "product-question",
      texte: "Which column order does the export keep?\n- [resume] Keep the old order\n- [close] Drop the export",
      recommandee: { texte: "Keep the old order", pourquoi: "the users read it that way" },
    });
  });
});
