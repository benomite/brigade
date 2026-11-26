// La question du manager sur une épique, avant qu'elle soit découpée (secondes#5, 2026-11-13) : elle est une carte de TODO, avec
// la question et ses choix en boutons ; tant qu'elle n'a pas de réponse, l'épique attend le chef ; répondue, la carte part.
import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { repondreSurGithub } from "../../src/tableau-actions/answer-github.ts";
import { avecCeQuiAwaitingLeChef, lireCeQuiAwaitingLeChef } from "../../src/tableau/wait-du-chef.ts";
import type { CallGitHub, AnswerGitHub } from "../../src/tableau/client.ts";
import { lireLeTableauDuRepository } from "../../src/tableau/read.ts";
import { cardDeLaQuestionDEpic } from "../../src/tableau/question-d-epic-github.ts";
import { formeDuChef } from "../../src/tableau/todo-github.ts";
import { comprendre, rail } from "../../src/facts.ts";

const REPOSITORY = "benomite/secondes";
const QUESTION_DU_MANAGER = [
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
const de = (association: string, body: string, created_at: string): Comment => ({ body, created_at, author_association: association });
const manager = (body: string, created_at = "2026-11-13T14:58:00Z") => de("OWNER", body, created_at);
const chef = (body: string, created_at = "2026-11-13T15:30:00Z") => de("OWNER", body, created_at);

describe("la carte de la question d'épique", () => {
  test("la question et ses trois choix, tels que le manager les a écrits", () => {
    const card = cardDeLaQuestionDEpic([manager(QUESTION_DU_MANAGER)]);
    assert.ok(card !== null);
    const forme = formeDuChef(card.texte);
    assert.equal(forme.question, "How does a person join a shared journal: (A) with a link, (B) from a list of the journals shared in Drive, or (C) both?");
    assert.deepEqual(forme.choix, [
      { texte: "A) with a link", suite: "resume" },
      { texte: "B) from a list of the journals shared in Drive", suite: "resume" },
      { texte: "C) both", suite: "resume" },
    ]);
    assert.equal(forme.contexte, "");
  });

  test("sans choix lisibles, la carte pose sa question et se répond en une phrase", () => {
    const card = cardDeLaQuestionDEpic([manager(QUESTION_DU_MANAGER.replace(/How does.*\n/, "Which platform comes first?\n"))]);
    assert.ok(card !== null);
    assert.deepEqual(formeDuChef(card.texte), { question: "Which platform comes first?", choix: [], contexte: "" });
  });

  test("une réponse du chef la rend sans objet, mais pas la prise du ticket par une station", () => {
    const taking = de("OWNER", "<!-- brigade:manager-prise station=box/claude etat=ab jeton=cd fait -->\nManager work on this issue done.", "2026-11-13T15:00:00Z");
    assert.notEqual(cardDeLaQuestionDEpic([manager(QUESTION_DU_MANAGER), taking]), null);
    assert.equal(cardDeLaQuestionDEpic([manager(QUESTION_DU_MANAGER), taking, chef("A) with a link")]), null);
  });

  test("le commentaire d'un inconnu n'est ni la question ni la réponse", () => {
    assert.equal(cardDeLaQuestionDEpic([de("NONE", QUESTION_DU_MANAGER, "2026-11-13T14:58:00Z")]), null);
    assert.notEqual(cardDeLaQuestionDEpic([manager(QUESTION_DU_MANAGER), de("NONE", "me too", "2026-11-13T15:00:00Z")]), null);
  });

  test("un commentaire plus récent du manager qui ne pose pas de question la rend sans objet", () => {
    assert.equal(cardDeLaQuestionDEpic([manager(QUESTION_DU_MANAGER), manager("<!-- brigade:manager -->\n**Manager — epic split into 3 tickets.**", "2026-11-13T16:00:00Z")]), null);
  });

  test("aucune question du manager : aucune carte", () => {
    assert.equal(cardDeLaQuestionDEpic([chef("hello")]), null);
    assert.equal(cardDeLaQuestionDEpic([]), null);
  });
});

// Un faux GitHub : l'épique #5, ses commentaires, et un ticket #6 sur le rail.
function github(commentairesDeCinq: Comment[], labelsDeCinq = ["epic", "fire"]): CallGitHub {
  const ok = (data: unknown): AnswerGitHub => ({ status: 200, data });
  const issues = [
    { number: 5, title: "Join a shared journal", html_url: `https://github.com/${REPOSITORY}/issues/5`, created_at: "2026-11-13T10:00:00Z", labels: labelsDeCinq.map((name) => ({ name })) },
    { number: 6, title: "Another", html_url: `https://github.com/${REPOSITORY}/issues/6`, created_at: "2026-11-13T11:00:00Z", labels: [{ name: "fire" }] },
  ];
  return async (chemin) => {
    const label = /\/issues\?.*\blabels=([^&]+)/.exec(chemin)?.[1];
    if (label !== undefined) return ok(issues.filter((issue) => issue.labels.some(({ name }) => name === label)));
    if (chemin.includes("/pulls?")) return ok([]);
    const numero = /\/issues\/(\d+)\/comments/.exec(chemin)?.[1];
    if (numero !== undefined) return ok(numero === "5" ? commentairesDeCinq : []);
    if (/\/issues\?/.test(chemin)) return ok(issues);
    return { status: 404, data: { message: "Not Found" } };
  };
}

describe("TODO d'un projet dont l'épique a posé une question", () => {
  test("secondes#5 est dans TODO avec sa question et ses boutons, et sa carte dit qu'elle attend la réponse du chef", async () => {
    const appeler = github([manager(QUESTION_DU_MANAGER)]);
    const wait = await lireCeQuiAwaitingLeChef({ depot: REPOSITORY, appeler, maintenant: () => new Date("2026-11-13T17:00:00Z") });
    assert.ok(wait.lue);
    assert.deepEqual(
      wait.attentes.map(({ ticket, quoi, depuis, chef: card }) => ({ ticket, quoi, depuis, sorte: card?.sorte })),
      [{ ticket: 5, quoi: "carte", depuis: "2026-11-13T14:58:00Z", sorte: "manager-epic-question" }],
    );
    assert.match(wait.attentes[0]!.ligne, /\(A\) with a link/);

    const lu = await lireLeTableauDuRepository({ depot: REPOSITORY, appeler, maintenant: () => new Date("2026-11-13T17:00:00Z") });
    assert.ok(lu.lu);
    const complet = await avecCeQuiAwaitingLeChef(lu, appeler);
    assert.ok(complet.lu);
    const facts = comprendre(JSON.stringify(complet.faits));
    assert.ok(!("informe" in facts), JSON.stringify(facts));
    assert.equal(facts.attend?.length, 1);
    const vu = rail(facts);
    const card = [...vu.colonnes.flatMap(({ cartes: cards }) => cards), ...vu.hors].find(({ ticket }) => ticket === 5);
    assert.ok(card !== undefined);
    assert.equal(card.ligne, "The manager asked you a question before splitting this epic: it waits for your answer.");
    assert.doesNotMatch(JSON.stringify(card), /ready, waits for a place in the kitchen/);
  });

  test("une épique sans `fire`, dite par la lecture du rail avant lui, pose sa question de même", async () => {
    const appeler = github([manager(QUESTION_DU_MANAGER)], ["epic"]);
    const lu = await lireLeTableauDuRepository({ depot: REPOSITORY, appeler, maintenant: () => new Date("2026-11-13T17:00:00Z") });
    assert.ok(lu.lu);
    assert.equal(lu.avantLeRail?.issues.find(({ ticket }) => ticket === 5)?.etat, "epique");
    const complet = await avecCeQuiAwaitingLeChef(lu, appeler);
    assert.ok(complet.lu);
    const facts = comprendre(JSON.stringify(complet.faits));
    assert.ok(!("informe" in facts), JSON.stringify(facts));
    assert.deepEqual(facts.attend?.map(({ ticket, chef: card }) => [ticket, card?.sorte]), [[5, "manager-epic-question"]]);
  });

  test("une réponse du chef la fait sortir de TODO, sans autre geste", async () => {
    const wait = await lireCeQuiAwaitingLeChef({ depot: REPOSITORY, appeler: github([manager(QUESTION_DU_MANAGER), chef("C) both")]) });
    assert.ok(wait.lue);
    assert.deepEqual(wait.attentes, []);
  });

  test("le bouton d'un choix poste son libellé sur l'issue : le manager le lit, la carte part à la lecture suivante", async () => {
    const card = cardDeLaQuestionDEpic([manager(QUESTION_DU_MANAGER)]);
    assert.ok(card !== null);
    const ecrits: { methode: string; chemin: string; corps?: unknown }[] = [];
    const rendu = await repondreSurGithub({
      depot: REPOSITORY,
      ticket: 5,
      chef: card,
      reponse: { question: formeDuChef(card.texte).question, choix: 3 },
      client: {
        lire: async () => ({ status: 404, data: {} }),
        ecrire: async (methode, chemin, corps) => {
          ecrits.push({ methode, chemin, corps });
          return methode === "POST" ? { status: 201, data: { id: 77 } } : { status: 404, data: {} };
        },
      },
    });
    assert.ok("repondue" in rendu, JSON.stringify(rendu));
    assert.equal(ecrits[0]?.chemin, `/repos/${REPOSITORY}/issues/5/comments`);
    assert.equal((ecrits[0]?.corps as { body: string }).body, "<!-- brigade:reponse gesture=resume -->\nC) both");
  });

  test("un projet sans épique ne change pas : une lecture de plus, aucune carte", async () => {
    const wait = await lireCeQuiAwaitingLeChef({ depot: REPOSITORY, appeler: github([manager(QUESTION_DU_MANAGER)], ["fire"]) });
    assert.ok(wait.lue);
    assert.deepEqual(wait.attentes, []);
  });
});
