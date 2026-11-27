// La question du manager sur une épique, avant qu'elle soit découpée (secondes#5, 2026-11-13) : elle est une carte de TODO, avec
// la question et ses choix en boutons ; tant qu'elle n'a pas de réponse, l'épique attend le chef ; répondue, la carte part.
import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { answerOnGithub } from "../../src/board-actions/answer-github.ts";
import { readWhatAwaitingTheChef } from "../../src/board/wait-of-chef.ts";
import type { CallGitHub, AnswerGitHub } from "../../src/board/client.ts";
import { cardOfTheQuestionOfEpic } from "../../src/board/question-of-epic-github.ts";
import { shapeOfChef } from "../../src/board/todo-github.ts";

const REPOSITORY = "benomite/secondes";
const QUESTION_OF_MANAGER = [
  "<!-- brigade:manager -->",
  "<!-- brigade:question -->",
  "**Manager — epic not split: a question.**",
  "",
  "How does a person join a shared journal: (A) with a link, (B) from a list of the journals shared in Drive, or (C) both?",
  "",
  "Answer here, or edit the epic: it will be read again, and split if the answer is enough. No ticket is created until then — and nothing else awaits this answer: the rail of the kitchen goes on.",
  "",
  "_Read by the manager · run 1_",
].join("\n");

type Comment = { body: string; created_at: string; author_association: string };
const of = (association: string, body: string, created_at: string): Comment => ({ body, created_at, author_association: association });
const manager = (body: string, created_at = "2026-11-13T14:58:00Z") => of("OWNER", body, created_at);
const chef = (body: string, created_at = "2026-11-13T15:30:00Z") => of("OWNER", body, created_at);

describe("la carte de la question d'épique", () => {
  test("la question et ses trois choix, tels que le manager les a écrits", () => {
    const card = cardOfTheQuestionOfEpic([manager(QUESTION_OF_MANAGER)]);
    assert.ok(card !== null);
    const shape = shapeOfChef(card.texte);
    assert.equal(shape.question, "How does a person join a shared journal: (A) with a link, (B) from a list of the journals shared in Drive, or (C) both?");
    assert.deepEqual(shape.choix, [
      { texte: "A) with a link", suite: "resume" },
      { texte: "B) from a list of the journals shared in Drive", suite: "resume" },
      { texte: "C) both", suite: "resume" },
    ]);
    assert.equal(shape.contexte, "");
  });

  test("sans choix lisibles, la carte pose sa question et se répond en une phrase", () => {
    const card = cardOfTheQuestionOfEpic([manager(QUESTION_OF_MANAGER.replace(/How does.*\n/, "Which platform comes first?\n"))]);
    assert.ok(card !== null);
    assert.deepEqual(shapeOfChef(card.texte), { question: "Which platform comes first?", choix: [], contexte: "" });
  });

  test("une réponse du chef la rend sans objet, mais pas la prise du ticket par une station", () => {
    const taking = of("OWNER", "<!-- brigade:manager-prise station=box/claude etat=ab jeton=cd fait -->\nManager work on this issue done.", "2026-11-13T15:00:00Z");
    assert.notEqual(cardOfTheQuestionOfEpic([manager(QUESTION_OF_MANAGER), taking]), null);
    assert.equal(cardOfTheQuestionOfEpic([manager(QUESTION_OF_MANAGER), taking, chef("A) with a link")]), null);
  });

  test("le commentaire d'un inconnu n'est ni la question ni la réponse", () => {
    assert.equal(cardOfTheQuestionOfEpic([of("NONE", QUESTION_OF_MANAGER, "2026-11-13T14:58:00Z")]), null);
    assert.notEqual(cardOfTheQuestionOfEpic([manager(QUESTION_OF_MANAGER), of("NONE", "me too", "2026-11-13T15:00:00Z")]), null);
  });

  test("un commentaire plus récent du manager qui ne pose pas de question la rend sans objet", () => {
    assert.equal(cardOfTheQuestionOfEpic([manager(QUESTION_OF_MANAGER), manager("<!-- brigade:manager -->\n**Manager — epic split into 3 tickets.**", "2026-11-13T16:00:00Z")]), null);
  });

  test("aucune question du manager : aucune carte", () => {
    assert.equal(cardOfTheQuestionOfEpic([chef("hello")]), null);
    assert.equal(cardOfTheQuestionOfEpic([]), null);
  });
});

// Un faux GitHub : l'épique #5, ses commentaires, et un ticket #6 sur le rail.
function github(commentsOfFive: Comment[], labelsOfFive = ["epic", "fire"]): CallGitHub {
  const ok = (data: unknown): AnswerGitHub => ({ status: 200, data });
  const issues = [
    { number: 5, title: "Join a shared journal", html_url: `https://github.com/${REPOSITORY}/issues/5`, created_at: "2026-11-13T10:00:00Z", labels: labelsOfFive.map((name) => ({ name })) },
    { number: 6, title: "Another", html_url: `https://github.com/${REPOSITORY}/issues/6`, created_at: "2026-11-13T11:00:00Z", labels: [{ name: "fire" }] },
  ];
  return async (path) => {
    const label = /\/issues\?.*\blabels=([^&]+)/.exec(path)?.[1];
    if (label !== undefined) return ok(issues.filter((issue) => issue.labels.some(({ name }) => name === label)));
    if (path.includes("/pulls?")) return ok([]);
    const number = /\/issues\/(\d+)\/comments/.exec(path)?.[1];
    if (number !== undefined) return ok(number === "5" ? commentsOfFive : []);
    if (/\/issues\?/.test(path)) return ok(issues);
    return { status: 404, data: { message: "Not Found" } };
  };
}

describe("TODO d'un projet dont l'épique a posé une question", () => {
  test("secondes#5 est dans TODO avec sa question et ses boutons, et sa carte dit qu'elle attend la réponse du chef", async () => {
    const call = github([manager(QUESTION_OF_MANAGER)]);
    const wait = await readWhatAwaitingTheChef({ depot: REPOSITORY, appeler: call, maintenant: () => new Date("2026-11-13T17:00:00Z") });
    assert.ok(wait.lue);
    assert.deepEqual(
      wait.attentes.map(({ ticket, quoi: what, depuis: since, chef: card }) => ({ ticket, quoi: what, depuis: since, sorte: card?.sorte })),
      [{ ticket: 5, quoi: "carte", depuis: "2026-11-13T14:58:00Z", sorte: "manager-epic-question" }],
    );
    assert.match(wait.attentes[0]!.ligne, /\(A\) with a link/);
  });

  test("une réponse du chef la fait sortir de TODO, sans autre geste", async () => {
    const wait = await readWhatAwaitingTheChef({ depot: REPOSITORY, appeler: github([manager(QUESTION_OF_MANAGER), chef("C) both")]) });
    assert.ok(wait.lue);
    assert.deepEqual(wait.attentes, []);
  });

  test("le bouton d'un choix poste son libellé sur l'issue : le manager le lit, la carte part à la lecture suivante", async () => {
    const card = cardOfTheQuestionOfEpic([manager(QUESTION_OF_MANAGER)]);
    assert.ok(card !== null);
    const writtenOnes: { methode: string; chemin: string; corps?: unknown }[] = [];
    const rendered = await answerOnGithub({
      depot: REPOSITORY,
      ticket: 5,
      chef: card,
      reponse: { question: shapeOfChef(card.texte).question, choix: 3 },
      client: {
        lire: async () => ({ status: 404, data: {} }),
        ecrire: async (method, path, body) => {
          writtenOnes.push({ methode: method, chemin: path, corps: body });
          return method === "POST" ? { status: 201, data: { id: 77 } } : { status: 404, data: {} };
        },
      },
    });
    assert.ok("repondue" in rendered, JSON.stringify(rendered));
    assert.equal(writtenOnes[0]?.chemin, `/repos/${REPOSITORY}/issues/5/comments`);
    assert.equal((writtenOnes[0]?.corps as { body: string }).body, "<!-- brigade:reponse gesture=resume -->\nC) both");
  });

  test("un projet sans épique ne change pas : une lecture de plus, aucune carte", async () => {
    const wait = await readWhatAwaitingTheChef({ depot: REPOSITORY, appeler: github([manager(QUESTION_OF_MANAGER)], ["fire"]) });
    assert.ok(wait.lue);
    assert.deepEqual(wait.attentes, []);
  });
});
