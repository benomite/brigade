// Ticket #3840 — la carte du Pass tenue par une base rouge. Le rail et les cooks d'un projet, lus de GitHub seul (#2220 ; seul chemin depuis #2061) : la vue du rail range ses
// issues `fire` d'après leurs labels et leurs PR — en attente, prises, en pass, en WAITING, mises de côté (#2075) —, et
// l'onglet Cooks montre les stations d'après leurs commentaires de prise et leurs signes de vie (#2358). Joué sur un faux
// GitHub, puis rendu par le rail de l'app. Son TODO est ce qui attend le chef lu de GitHub, la lecture même que le
// second relaie (#2460).
import assert from "node:assert/strict";
import { test } from "node:test";
import { understand, board as boardOf, holdFacts, type Facts, type Board } from "../../../src/facts.ts";
import type { CallGitHub, AnswerGitHub } from "../../../src/board/client.ts";
import { readTheBoardOfRepository, type ReadOfBoardOfRepository } from "../../../src/board/read.ts";
import { withWhatAwaitingTheChef } from "../../../src/board/wait-of-chef.ts";
import type { MemoryOfReads } from "../../../src/board/rail-github.ts";
import { statusOfBoard } from "../../../src/board/rail.ts";
import { type SignsOfLife } from "../../../src/vue/rail/github.ts";

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

const cardsOfPass = (seenOne: Board) => seenOne.rail.colonnes.find(({ nom: name }) => name === "Pass")?.cartes ?? [];
const allWhatSaysTheCard = (card: ReturnType<typeof cardsOfPass>[number]) => [card.ligne, ...card.dit.map(({ valeur: value }) => value), card.age?.dit ?? ""].join(" | ");

test("critère 3 — une carte ne dit jamais « waits for a place in the kitchen » tant que sa livraison est en pass", async () => {
  for (const base of ["failure", "success"]) {
    const cards = cardsOfPass(draws(await read(github({ base }))));
    assert.ok(cards.length > 0, `the Pass column has a card (main ${base})`);
    for (const card of cards) {
      assert.doesNotMatch(JSON.stringify(card), /waits for a place in the kitchen/, `main ${base}`);
    }
  }
});
