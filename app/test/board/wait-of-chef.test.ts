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
// #31, parqué pour un autre que le chef (`parked`, WAITING) ; #1683, l'issue du tableau de la cuisine.
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
  31: { labels: ["parked"] },
  1683: { labels: ["fire", "served-elsewhere", "kitchen-board"] },
};

// Un faux GitHub : les issues ouvertes au label demandé — ou toutes, pour le kanban de l'app —, leurs commentaires, leurs
// événements, et ses PR. `appels` : chaque chemin demandé.
function github(world: Record<number, Issue> = WORLD, calls: string[] = []): CallGitHub {
  const ok = (data: unknown): AnswerGitHub => ({ status: 200, data });
  const issueJson = (number: number, issue: Issue) => ({ number: number, title: `Ticket ${number}`, html_url: `https://github.com/${REPOSITORY}/issues/${number}`, created_at: issue.created_at ?? "2026-11-01T00:00:00Z", labels: issue.labels.map((name) => ({ name })) });
  return async (path) => {
    calls.push(path);
    const label = /\/issues\?.*\blabels=([^&]+)/.exec(path)?.[1];
    if (label !== undefined) return ok(Object.entries(world).filter(([, issue]) => issue.labels.includes(label)).map(([number, issue]) => issueJson(Number(number), issue)));
    if (path.includes("/pulls?")) return ok([]);
    if (path.includes("/issues?")) return ok(Object.entries(world).map(([number, issue]) => issueJson(Number(number), issue)));
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
      "awaiting   3 decisions await the chef — the oldest for 4 h 00",
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
    assert.deepEqual((await readEntry(github(world))).attentes.map(({ ticket }) => ticket), [8]);
  });

  test("une issue `chef-todo` dont la question ne se lit pas n'est pas une entrée, et le second en est prévenu (#2455)", async () => {
    const world = {
      5: { labels: ["chef-todo"], created_at: "2026-11-05T05:00:00Z" },
      6: { labels: ["chef-todo"], created_at: "2026-11-05T05:30:00Z", commentaires: [said("<!-- brigade:todo kind=blocked -->\n  ", "2026-11-05T05:40:00Z")] },
    };
    const reading = await readEntry(github(world));
    assert.deepEqual(reading.attentes, []);
    assert.equal(reading.illisibles.length, 2);
    assert.match(reading.illisibles[0] ?? "", /^#5 carries `chef-todo` but is not shown in Todo: no comment marked/);
    assert.match(reading.illisibles[1] ?? "", /^#6 carries `chef-todo` but is not shown in Todo: its marked card has no text/);
    // Le second le lit dans le bloc `awaiting`.
    const block = blockOfChef(reading);
    assert.ok(block.includes(`  ${reading.illisibles[0]}`) && block.includes(`  ${reading.illisibles[1]}`), block.join("\n"));
    assert.ok(!block.some((line) => line.startsWith("  #5  for")));
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

// La lecture de l'app (main.ts, `lireLeTableau`) : le rail, puis ce qui attend le chef.
const readByTheApp = async (call: CallGitHub) => withWhatAwaitingTheChef(await readTheBoardOfRepository({ depot: REPOSITORY, appeler: call, maintenant: now }), call);

// La cuisine parque pour le chef par `parked:chef` (#4474) : le Todo de l'app n'a que ces issues (#4507).
const KITCHEN: Record<number, Issue> = {
  1: { labels: ["fire", "model:sonnet", "effort:medium"] },
  40: { labels: ["fire", "parked:chef"], commentaires: [said("Parked for the chef: the cook wrote PARK: which export format?", "2026-11-05T09:00:00Z")] },
  41: { labels: ["fire", "in-pass", "parked:chef"], commentaires: [said("Parked for the chef: sent back three times — the CI stays red.", "2026-11-05T07:00:00Z")] },
};

describe("l'app et le second ne se contredisent pas : la même lecture, les mêmes entrées", () => {
  test("le Todo de l'app, son bloc `awaiting` et la file du second disent les mêmes entrées, dans le même ordre, mot pour mot", async () => {
    const readOne = await readByTheApp(github(KITCHEN));
    assert.ok(readOne.lu, !readOne.lu ? readOne.raison : "");
    // L'app : le bloc de son `status`, et les cartes de Todo qu'elle en dessine.
    const status = statusOfBoard(readOne);
    const shownOne = putAside({ projet: "kitchen", demande: 0, a: READ, sorties: [{ commande: "status", texte: status }] });
    assert.ok(!("erreur" in shownOne) && shownOne.attend !== undefined, "status carries its awaiting block");
    const facts = understand(JSON.stringify(readOne.faits));
    assert.ok(!("informe" in facts), `facts are in shape: ${"informe" in facts ? facts.informe : ""}`);
    const todo = boardOf(facts as Facts, { bloc: shownOne.attend, a: READ }, { texte: status, a: READ }).rail.colonnes.find(({ nom: name }) => name === "Awaiting you")?.cartes ?? [];
    assert.deepEqual(todo.map(({ ticket }) => ticket), [41, 40]);
    // Le second : la même lecture, le même bloc.
    const file = await readTheFile(github(KITCHEN), REPOSITORY, now);
    assert.ok(file.lue, JSON.stringify(file));
    assert.equal(file.texte, shownOne.attend);
    const context = contextOfTheFile({ nom: "kitchen", depot: REPOSITORY }, file);
    assert.ok(context.includes(shownOne.attend.trimEnd()), context);
    assert.match(context, /from GitHub only .* not the Kitchen board/);
    assert.equal(facts.compteurs.attend, 2);
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
    const refuses: CallGitHub = async (path, headers) => (path.includes("/issues/40/comments") ? { status: 502, data: {} } : github(KITCHEN)(path, headers));
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
