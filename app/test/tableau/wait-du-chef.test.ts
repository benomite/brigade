// Ce qui attend le chef, lu de GitHub seul (#2460) : les issues, leurs labels, leurs commentaires — jamais le tableau de la
// cuisine. Le TODO de l'app et la file que le second relaie à son ouverture sont cette lecture : les mêmes entrées, chacune
// avec sa question et son geste, dans le même bloc `awaiting`, et « nothing awaits the chef » quand rien n'attend. Joué sur
// un faux GitHub qui tient ses issues, leurs labels, leurs commentaires et leurs événements.
import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { mettreAPart } from "../../src/awaiting.ts";
import { comprendre, tableau as tableauDe, type Facts } from "../../src/facts.ts";
import { contextDeLaFile, lireLaFile } from "../../src/second/file.ts";
import { avecCeQuiAwaitingLeChef, blocDuChef, lireCeQuiAwaitingLeChef, type WaitLue } from "../../src/tableau/wait-du-chef.ts";
import type { CallGitHub, AnswerGitHub } from "../../src/tableau/client.ts";
import { lireLeTableauDuRepository } from "../../src/tableau/read.ts";
import { statusDuTableau } from "../../src/tableau/rail.ts";

const REPOSITORY = "acme/kitchen";
const LU = "2026-11-05T12:00:00.000Z";
const maintenant = () => new Date(LU);

type Comment = { body: string; created_at: string; author_association?: string };
type Issue = { labels: string[]; commentaires?: Comment[]; evenements?: { event: string; label: { name: string }; created_at: string }[]; created_at?: string };
const dit = (body: string, created_at: string): Comment => ({ body, created_at, author_association: "OWNER" });

// Le projet du 2026-11-05 : #8 en pass, sa livraison touche à ce qui la juge — sa carte `chef-todo` demande au chef de la
// merger ; #12, `served-elsewhere`, pose une question
// de produit avec ses choix ; #7, `served-elsewhere` après ses renvois, ne demande rien au chef ; #20, une carte `chef-todo` ;
// #30, parqué pour le chef par `question`, un label d'attente d'avant parked (#4260 ; d'abord un écart du manager) ; #31,
// `decision`, mais parqué pour un autre que le chef (`parked`, WAITING) ; #1683, l'issue du tableau de la cuisine.
// #1, sur le rail, calibré par le manager : rien ne le bloque (le rail bloqué, #3358 : test/rail-blocked/).
const MONDE: Record<number, Issue> = {
  1: { labels: ["fire", "model:sonnet", "effort:medium"] },
  7: { labels: ["fire", "served-elsewhere"], commentaires: [dit("<!-- brigade:renvoi n=3 sha=abc1234 -->\nStation `box/claude`: still not mergeable after 2 sends back — the PR conflicts with the base\n\nTaken off the kitchen (`served-elsewhere`): a human decides.", "2026-11-05T01:00:00Z")] },
  8: { labels: ["fire", "in-pass", "chef-todo"], commentaires: [dit("<!-- brigade:todo kind=merge-by-hand -->\nMerge the PR of #8 by hand? It changes what judges it.\n- [merge] Merge the PR of #8", "2026-11-05T09:00:00Z")] },
  12: {
    labels: ["fire", "served-elsewhere"],
    commentaires: [dit("<!-- brigade:todo kind=product-question -->\nDoes the export keep the old column order?\n- [merge] Yes, merge PR #1560 as delivered\n- [close] No, we drop the export", "2026-11-05T08:00:00Z")],
  },
  20: { labels: ["chef-todo"], commentaires: [dit("chatter", "2026-11-05T02:00:00Z"), dit("<!-- brigade:todo kind=blocked -->\nWhich token does the box use for the registry?", "2026-11-05T10:00:00Z")] },
  30: { labels: ["question"], evenements: [{ event: "labeled", label: { name: "prio:2" }, created_at: "2026-11-04T08:00:00Z" }, { event: "labeled", label: { name: "question" }, created_at: "2026-11-05T06:00:00Z" }] },
  31: { labels: ["decision", "parked"] },
  1683: { labels: ["fire", "served-elsewhere", "kitchen-board"] },
};

// La ligne de #30, parqué par `question` sans commentaire qui pose une question : sa carte demande ce que son label attend (#3370).
const ECART_30 = "It carries `question`, a waiting label of before parked: what do you decide? — answer on its Todo card: “Back to the kitchen” or “Close it” — or in your own words";

// Un faux GitHub : les issues ouvertes au label demandé, leurs commentaires, leurs événements — et, pour le rail de l'app,
// ses PR. `appels` : chaque chemin demandé.
function github(monde: Record<number, Issue> = MONDE, calls: string[] = []): CallGitHub {
  const ok = (data: unknown): AnswerGitHub => ({ status: 200, data });
  const issueJson = (numero: number, issue: Issue) => ({ number: numero, title: `Ticket ${numero}`, html_url: `https://github.com/${REPOSITORY}/issues/${numero}`, created_at: issue.created_at ?? "2026-11-01T00:00:00Z", labels: issue.labels.map((name) => ({ name })) });
  return async (chemin) => {
    calls.push(chemin);
    const label = /\/issues\?.*\blabels=([^&]+)/.exec(chemin)?.[1];
    if (label !== undefined) return ok(Object.entries(monde).filter(([, issue]) => issue.labels.includes(label)).map(([numero, issue]) => issueJson(Number(numero), issue)));
    if (chemin.includes("/pulls?")) return ok([]);
    const [, numero, quoi] = /\/issues\/(\d+)\/(comments|events)/.exec(chemin) ?? [];
    if (numero !== undefined) return ok(quoi === "comments" ? (monde[Number(numero)]?.commentaires ?? []) : (monde[Number(numero)]?.evenements ?? []));
    return { status: 404, data: { message: "Not Found" } };
  };
}

const lue = async (appeler: CallGitHub = github()): Promise<Extract<WaitLue, { lue: true }>> => {
  const read = await lireCeQuiAwaitingLeChef({ depot: REPOSITORY, appeler, maintenant });
  assert.ok(read.lue, JSON.stringify(read));
  return read;
};

describe("ce qui attend le chef, lu de GitHub", () => {
  test("une entrée par fait de GitHub qui demande quelque chose au chef, la plus ancienne d'abord, chacune avec sa question et son geste", async () => {
    const { attentes } = await lue();
    assert.deepEqual(
      attentes.map(({ ticket, quoi, depuis, ligne: line }) => ({ ticket, quoi, depuis, ligne: line })),
      [
        { ticket: 30, quoi: "ecart", depuis: "2026-11-05T06:00:00Z", ligne: ECART_30 },
        { ticket: 12, quoi: "mise-de-cote", depuis: "2026-11-05T08:00:00Z", ligne: "Does the export keep the old column order? — answer on its Todo card: “Yes, merge PR #1560 as delivered” or “No, we drop the export” — or in your own words" },
        { ticket: 8, quoi: "carte", depuis: "2026-11-05T09:00:00Z", ligne: "Merge the PR of #8 by hand? It changes what judges it. — answer on its Todo card: “Merge the PR of #8” — or in your own words" },
        { ticket: 20, quoi: "carte", depuis: "2026-11-05T10:00:00Z", ligne: "Which token does the box use for the registry? — answer on its Todo card, in your own words" },
      ],
    );
    // Ce que la carte de TODO en fait : la question du chef, de sa sorte.
    assert.equal(attentes.find(({ ticket }) => ticket === 8)?.chef?.sorte, "merge-by-hand");
    assert.equal(attentes.find(({ ticket }) => ticket === 20)?.chef?.sorte, "blocked");
  });

  test("le bloc `awaiting`, bords compris : sa tête, une ligne par entrée — son numéro, depuis quand, sa ligne, son titre", async () => {
    assert.deepEqual(blocDuChef(await lue()), [
      "awaiting   4 decisions await the chef — the oldest for 6 h 00",
      `  #30  for 6 h 00  ${ECART_30}  Ticket 30`,
      "  #12  for 4 h 00  Does the export keep the old column order? — answer on its Todo card: “Yes, merge PR #1560 as delivered” or “No, we drop the export” — or in your own words  Ticket 12",
      "  #8  for 3 h 00  Merge the PR of #8 by hand? It changes what judges it. — answer on its Todo card: “Merge the PR of #8” — or in your own words  Ticket 8",
      "  #20  for 2 h 00  Which token does the box use for the registry? — answer on its Todo card, in your own words  Ticket 20",
      "end awaiting",
      "",
    ]);
  });

  test("rien n'attend : le bloc le dit", async () => {
    const empty = await lue(github({ 1: { labels: ["fire"] }, 7: MONDE[7] as Issue }));
    assert.deepEqual(empty.attentes, []);
    assert.deepEqual(blocDuChef(empty), ["awaiting   nothing awaits the chef", "end awaiting", ""]);
  });

  test("répondue, la question de produit n'attend plus ; le label `chef-todo` retiré, la carte part", async () => {
    const answer = dit("<!-- brigade:reponse gesture=merge -->\nYes, merge PR #1560 as delivered", "2026-11-05T11:00:00Z");
    const monde = { ...MONDE, 12: { ...(MONDE[12] as Issue), commentaires: [...((MONDE[12] as Issue).commentaires ?? []), answer] }, 20: { ...(MONDE[20] as Issue), labels: [] } };
    assert.deepEqual((await lue(github(monde))).attentes.map(({ ticket }) => ticket), [30, 8]);
  });

  test("une issue `chef-todo` dont la question ne se lit pas n'est pas une entrée, et le second en est prévenu (#2455) ; un `blocked-on-human` sans PR se lève", async () => {
    const monde = {
      5: { labels: ["chef-todo"], created_at: "2026-11-05T05:00:00Z" },
      6: { labels: ["chef-todo"], created_at: "2026-11-05T05:30:00Z", commentaires: [dit("<!-- brigade:todo kind=blocked -->\n  ", "2026-11-05T05:40:00Z")] },
      9: { labels: ["fire", "blocked-on-human"], created_at: "2026-11-05T07:00:00Z" },
    };
    const read = await lue(github(monde));
    assert.deepEqual(read.attentes.map(({ ticket, ligne: line }) => [ticket, line]), [[9, "It carries `blocked-on-human`, a waiting label of before parked: what do you decide? — answer on its Todo card: “Back to the kitchen” or “Close it” — or in your own words"]]);
    assert.equal(read.illisibles.length, 2);
    assert.match(read.illisibles[0] ?? "", /^#5 carries `chef-todo` but is not shown in Todo: no comment marked/);
    assert.match(read.illisibles[1] ?? "", /^#6 carries `chef-todo` but is not shown in Todo: its marked card has no text/);
    // Le second le lit dans le bloc `awaiting`.
    const bloc = blocDuChef(read);
    assert.ok(bloc.includes(`  ${read.illisibles[0]}`) && bloc.includes(`  ${read.illisibles[1]}`), bloc.join("\n"));
    assert.ok(!bloc.some((line) => line.startsWith("  #5  for")));
  });

  // Ticket 4260 : un label d'attente d'avant parked pour le chef parque le ticket pour lui — une entrée, sa carte ; une mise
  // de côté n'en est une que par la question de produit qu'elle pose.
  test("un ticket du rail parqué pour le chef par un label d'avant parked est une entrée ; un `served-elsewhere` ne l'est que par sa question", async () => {
    const monde = { 7: MONDE[7] as Issue, 9: { labels: ["fire", "in-pass", "blocked-on-human"], created_at: "2026-11-05T07:00:00Z" }, 12: MONDE[12] as Issue };
    assert.deepEqual((await lue(github(monde))).attentes.map(({ ticket, quoi, chef }) => [ticket, quoi, chef?.sorte]), [
      [9, "ecart", "manager-parked"],
      [12, "mise-de-cote", "product-question"],
    ]);
  });

  test("le tableau de la cuisine n'est jamais lu, ni une entrée", async () => {
    const calls: string[] = [];
    const { attentes } = await lue(github(MONDE, calls));
    assert.ok(!attentes.some(({ ticket }) => ticket === 1683));
    assert.ok(!calls.some((chemin) => chemin.includes("kitchen-board") || chemin.includes("/issues/1683")), calls.join("\n"));
  });

  test("GitHub qui refuse, ou pas joint : dit pourquoi, jamais « rien n'attend »", async () => {
    const refusal = await lireCeQuiAwaitingLeChef({ depot: REPOSITORY, appeler: async () => ({ status: 403, data: {} }), maintenant });
    assert.deepEqual(refusal, { lue: false, raison: `What awaits the chef in ${REPOSITORY} was not read from GitHub: GitHub answered HTTP 403 on /repos/${REPOSITORY}/issues.` });
    const injoint = await lireCeQuiAwaitingLeChef({ depot: REPOSITORY, appeler: async () => assert.fail("getaddrinfo ENOTFOUND api.github.com"), maintenant });
    assert.equal(injoint.lue, false);
    assert.equal(!injoint.lue && injoint.horsLigne, true);
  });
});

describe("l'écart du manager : sa question, avec ses boutons (#3370)", () => {
  const ecarte = (commentaires: Comment[], label = "decision"): Record<number, Issue> => ({ 60: { labels: [label], commentaires, evenements: [{ event: "labeled", label: { name: label }, created_at: "2026-11-05T06:00:00Z" }] } });
  const cardDe = async (monde: Record<number, Issue>) => (await lue(github(monde))).attentes.find(({ ticket }) => ticket === 60);

  test("la question du dernier commentaire du dépôt qui en pose une, ses choix et ce qui la précise ; ni la prise d'une station, ni un inconnu", async () => {
    const question = dit("<!-- brigade:manager -->\n**Manager — set aside: a decision.**\n\nThe export can keep the old column order or follow the new one.\nWhich column order does the export keep?\n- [resume] Keep the old order\n- [drop] Not now", "2026-11-05T06:00:00Z");
    const taking = dit("<!-- brigade:manager-prise station=box/claude etat=04bee3fe jeton=0dd01e18 fait -->\nManager work on this issue done by station `box/claude`. Done?", "2026-11-05T07:00:00Z");
    const inconnu = { body: "Is this a good idea?", created_at: "2026-11-05T08:00:00Z", author_association: "NONE" };
    const entree = await cardDe(ecarte([question, taking, inconnu]));
    assert.deepEqual(entree?.chef, {
      sorte: "manager-parked",
      texte: "Which column order does the export keep?\n- [resume] Keep the old order\n- [drop] Not now\n\nManager — set aside: a decision.\n\nThe export can keep the old column order or follow the new one.",
      recommandee: null,
    });
    assert.equal(entree?.quoi, "ecart");
    assert.equal(entree?.ligne, "Which column order does the export keep? — answer on its Todo card: “Keep the old order” or “Not now” — or in your own words");
  });

  test("une question sans choix : `Back to the kitchen` et `Close it` ; aucune question sur l'issue, ou une réponse du chef après elle : la carte demande ce que son label attend", async () => {
    const question = dit("Should the invoices be exported as CSV or XLSX?", "2026-11-05T06:00:00Z");
    assert.equal((await cardDe(ecarte([question], "question")))?.chef?.texte, "Should the invoices be exported as CSV or XLSX?\n- [resume] Back to the kitchen\n- [close] Close it");
    assert.deepEqual((await cardDe(ecarte([dit("No question here.", "2026-11-05T06:00:00Z")], "blocked-on-human")))?.chef, { sorte: "manager-parked", texte: "It carries `blocked-on-human`, a waiting label of before parked: what do you decide?\n- [resume] Back to the kitchen\n- [close] Close it", recommandee: null });
    const repondue = dit("<!-- brigade:reponse gesture=resume -->\nCSV", "2026-11-05T07:00:00Z");
    assert.equal((await cardDe(ecarte([question, repondue], "question")))?.chef?.texte, "It carries `question`, a waiting label of before parked: what do you decide?\n- [resume] Back to the kitchen\n- [close] Close it");
  });

  test("une issue que le jugement refuse au chef (#3429) : le refus du manager porte sa décision en une phrase, que la carte pose avec ses deux gestes", async () => {
    // Le commentaire du manager tel que runtime/src/manager.ts l'écrit pour un refus `decision`.
    const refusal = dit(
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
    const entree = await cardDe(ecarte([refusal]));
    assert.equal(entree?.quoi, "ecart");
    assert.equal(entree?.ligne, "Do you grant the deploy role write access to the backup bucket? — answer on its Todo card: “Back to the kitchen” or “Close it” — or in your own words");
  });

  test("ses commentaires que GitHub ne rend pas : la lecture dit pourquoi, jamais une carte sans sa question", async () => {
    const monde = ecarte([dit("Which one?", "2026-11-05T06:00:00Z")]);
    const refuse: CallGitHub = async (chemin, entetes) => (chemin.includes("/issues/60/comments") ? { status: 502, data: {} } : github(monde)(chemin, entetes));
    const read = await lireCeQuiAwaitingLeChef({ depot: REPOSITORY, appeler: refuse, maintenant });
    assert.deepEqual(read, { lue: false, raison: `What awaits the chef in ${REPOSITORY} was not read from GitHub: GitHub answered HTTP 502 on /repos/${REPOSITORY}/issues/60/comments.` });
  });

  test("dans l'app, la carte de Todo montre la question du manager, un bouton par choix et le champ libre", async () => {
    const monde = ecarte([dit("Which column order does the export keep?\n- [resume] Keep the old order\n- [close] Drop the export", "2026-11-05T06:00:00Z")]);
    const lu = await lueParLApp(github(monde));
    assert.ok(lu.lu);
    const facts = comprendre(JSON.stringify(lu.faits));
    assert.ok(!("informe" in facts));
    const card = tableauDe(facts as Facts, undefined, { texte: statusDuTableau(lu), a: LU }).rail.colonnes.find(({ nom: name }) => name === "Awaiting you")?.cartes.find(({ ticket }) => ticket === 60);
    assert.equal(card?.todo?.question, "Which column order does the export keep?");
    assert.deepEqual(card?.todo?.choix.map(({ texte: libelle }) => libelle), ["Keep the old order", "Drop the export"]);
    assert.ok((card?.todo?.prixDuTexte ?? "") !== "", "the card offers its free answer");
  });
});

// La lecture de l'app (main.ts, `lireLeTableau`) : le rail, puis ce qui attend le chef.
const lueParLApp = async (appeler: CallGitHub) => avecCeQuiAwaitingLeChef(await lireLeTableauDuRepository({ depot: REPOSITORY, appeler, maintenant }), appeler);

describe("l'app et le second ne se contredisent pas : la même lecture, les mêmes entrées", () => {
  test("le Todo de l'app, son bloc `awaiting` et la file du second disent les mêmes entrées, dans le même ordre, mot pour mot", async () => {
    const lu = await lueParLApp(github());
    assert.ok(lu.lu, !lu.lu ? lu.raison : "");
    // L'app : le bloc de son `status`, et les cartes de Todo qu'elle en dessine.
    const status = statusDuTableau(lu);
    const montree = mettreAPart({ projet: "kitchen", demande: 0, a: LU, sorties: [{ commande: "status", texte: status }] });
    assert.ok(!("erreur" in montree) && montree.attend !== undefined, "status carries its awaiting block");
    const facts = comprendre(JSON.stringify(lu.faits));
    assert.ok(!("informe" in facts), `facts are in shape: ${"informe" in facts ? facts.informe : ""}`);
    const todo = tableauDe(facts as Facts, { bloc: montree.attend, a: LU }, { texte: status, a: LU }).rail.colonnes.find(({ nom: name }) => name === "Awaiting you")?.cartes ?? [];
    assert.deepEqual(todo.map(({ ticket }) => ticket), [30, 12, 8, 20]);
    // Le second : la même lecture, le même bloc.
    const file = await lireLaFile(github(), REPOSITORY, maintenant);
    assert.ok(file.lue, JSON.stringify(file));
    assert.equal(file.texte, montree.attend);
    const context = contextDeLaFile({ nom: "kitchen", depot: REPOSITORY }, file);
    assert.ok(context.includes(montree.attend.trimEnd()), context);
    assert.match(context, /from GitHub only .* not the Kitchen board/);
    assert.equal(facts.compteurs.attend, 4);
  });

  test("un Todo vide : l'app et le second disent tous deux « nothing awaits the chef »", async () => {
    const monde = { 1: { labels: ["fire", "model:sonnet", "effort:medium"] } };
    const lu = await lueParLApp(github(monde));
    assert.ok(lu.lu);
    assert.match(statusDuTableau(lu), /^awaiting {3}nothing awaits the chef\nend awaiting$/m);
    const file = await lireLaFile(github(monde), REPOSITORY, maintenant);
    assert.ok(file.lue);
    assert.equal(file.texte, "awaiting   nothing awaits the chef\nend awaiting\n");
  });

  test("GitHub qui ne rend pas ce qui attend le chef : une lecture ratée pour l'app — jamais un Todo vide —, dite au second", async () => {
    const refuse: CallGitHub = async (chemin, entetes) => (chemin.includes("labels=chef-todo") ? { status: 502, data: {} } : github()(chemin, entetes));
    const lu = await lueParLApp(refuse);
    assert.equal(lu.lu, false);
    assert.match(!lu.lu ? lu.raison : "", /^What awaits the chef in acme\/kitchen was not read from GitHub: GitHub answered HTTP 502/);
    const file = await lireLaFile(refuse, REPOSITORY, maintenant);
    assert.match(contextDeLaFile({ nom: "kitchen" }, file), /file non lue : GitHub n'a pas rendu ce qui attend le chef\nWhat awaits the chef/);
  });
});

// #4129 : le manager parque pour le chef l'issue qu'il lui refuse — `chef-todo` et la carte de sa question, plus le label
// `question` ou `decision`. Sa carte garde la réponse qu'il recommande, comme celle d'un écart (#3434).
describe("la carte `chef-todo` d'une question du manager (#4129)", () => {
  const card = (texte: string): Record<number, Issue> => ({ 70: { labels: ["chef-todo"], commentaires: [dit(`<!-- brigade:todo kind=product-question -->\n${texte}`, "2026-11-05T06:00:00Z")] } });
  const entreeDe = async (monde: Record<number, Issue>) => (await lue(github(monde))).attentes.find(({ ticket }) => ticket === 70);

  test("sa ligne `Recommended:` met en avant le choix qu'elle nomme, et quitte le texte de la carte", async () => {
    const entree = await entreeDe(card("Which column order does the export keep?\n\n- [resume] Keep the old order\n- [close] Drop the export\n\n**Recommended:** Keep the old order — the users read it that way"));
    assert.deepEqual(entree?.chef, {
      sorte: "product-question",
      texte: "Which column order does the export keep?\n- [resume] Keep the old order\n- [close] Drop the export",
      recommandee: { texte: "Keep the old order", pourquoi: "the users read it that way" },
    });
  });
});
