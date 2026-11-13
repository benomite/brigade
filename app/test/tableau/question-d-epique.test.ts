// La question du manager sur une épique, avant qu'elle soit découpée (secondes#5, 2026-11-13) : elle est une carte de TODO, avec
// la question et ses choix en boutons ; tant qu'elle n'a pas de réponse, l'épique attend le chef ; répondue, la carte part.
import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { repondreSurGithub } from "../../src/tableau-gestes/reponse-github.ts";
import { avecCeQuiAttendLeChef, lireCeQuiAttendLeChef } from "../../src/tableau/attente-du-chef.ts";
import type { AppelGitHub, ReponseGitHub } from "../../src/tableau/client.ts";
import { lireLeTableauDuDepot } from "../../src/tableau/lecture.ts";
import { carteDeLaQuestionDEpique } from "../../src/tableau/question-d-epique-github.ts";
import { formeDuChef } from "../../src/tableau/todo-github.ts";
import { rail } from "../../src/faits.ts";

const DEPOT = "benomite/secondes";
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

type Commentaire = { body: string; created_at: string; author_association: string };
const de = (association: string, body: string, created_at: string): Commentaire => ({ body, created_at, author_association: association });
const manager = (body: string, created_at = "2026-11-13T14:58:00Z") => de("OWNER", body, created_at);
const chef = (body: string, created_at = "2026-11-13T15:30:00Z") => de("OWNER", body, created_at);

describe("la carte de la question d'épique", () => {
  test("la question et ses trois choix, tels que le manager les a écrits", () => {
    const carte = carteDeLaQuestionDEpique([manager(QUESTION_DU_MANAGER)]);
    assert.ok(carte !== null);
    const forme = formeDuChef(carte.texte);
    assert.equal(forme.question, "How does a person join a shared journal: (A) with a link, (B) from a list of the journals shared in Drive, or (C) both?");
    assert.deepEqual(forme.choix, [
      { texte: "A) with a link", suite: "resume" },
      { texte: "B) from a list of the journals shared in Drive", suite: "resume" },
      { texte: "C) both", suite: "resume" },
    ]);
    assert.equal(forme.contexte, "");
  });

  test("sans choix lisibles, la carte pose sa question et se répond en une phrase", () => {
    const carte = carteDeLaQuestionDEpique([manager(QUESTION_DU_MANAGER.replace(/How does.*\n/, "Which platform comes first?\n"))]);
    assert.ok(carte !== null);
    assert.deepEqual(formeDuChef(carte.texte), { question: "Which platform comes first?", choix: [], contexte: "" });
  });

  test("une réponse du chef la rend sans objet, mais pas la prise du ticket par une station", () => {
    const prise = de("OWNER", "<!-- brigade:manager-prise station=box/claude etat=ab jeton=cd fait -->\nManager work on this issue done.", "2026-11-13T15:00:00Z");
    assert.notEqual(carteDeLaQuestionDEpique([manager(QUESTION_DU_MANAGER), prise]), null);
    assert.equal(carteDeLaQuestionDEpique([manager(QUESTION_DU_MANAGER), prise, chef("A) with a link")]), null);
  });

  test("le commentaire d'un inconnu n'est ni la question ni la réponse", () => {
    assert.equal(carteDeLaQuestionDEpique([de("NONE", QUESTION_DU_MANAGER, "2026-11-13T14:58:00Z")]), null);
    assert.notEqual(carteDeLaQuestionDEpique([manager(QUESTION_DU_MANAGER), de("NONE", "me too", "2026-11-13T15:00:00Z")]), null);
  });

  test("un commentaire plus récent du manager qui ne pose pas de question la rend sans objet", () => {
    assert.equal(carteDeLaQuestionDEpique([manager(QUESTION_DU_MANAGER), manager("<!-- brigade:manager -->\n**Manager — epic split into 3 tickets.**", "2026-11-13T16:00:00Z")]), null);
  });

  test("aucune question du manager : aucune carte", () => {
    assert.equal(carteDeLaQuestionDEpique([chef("hello")]), null);
    assert.equal(carteDeLaQuestionDEpique([]), null);
  });
});

// Un faux GitHub : l'épique #5, ses commentaires, et un ticket #6 sur le rail.
function github(commentairesDeCinq: Commentaire[], labelsDeCinq = ["epic", "fire"]): AppelGitHub {
  const ok = (data: unknown): ReponseGitHub => ({ status: 200, data });
  const issues = [
    { number: 5, title: "Join a shared journal", html_url: `https://github.com/${DEPOT}/issues/5`, created_at: "2026-11-13T10:00:00Z", labels: labelsDeCinq.map((name) => ({ name })) },
    { number: 6, title: "Another", html_url: `https://github.com/${DEPOT}/issues/6`, created_at: "2026-11-13T11:00:00Z", labels: [{ name: "fire" }] },
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
    const attente = await lireCeQuiAttendLeChef({ depot: DEPOT, appeler, maintenant: () => new Date("2026-11-13T17:00:00Z") });
    assert.ok(attente.lue);
    assert.deepEqual(
      attente.attentes.map(({ ticket, quoi, depuis, chef: carte }) => ({ ticket, quoi, depuis, sorte: carte?.sorte })),
      [{ ticket: 5, quoi: "carte", depuis: "2026-11-13T14:58:00Z", sorte: "manager-epic-question" }],
    );
    assert.match(attente.attentes[0]!.ligne, /\(A\) with a link/);

    const lu = await lireLeTableauDuDepot({ depot: DEPOT, appeler, maintenant: () => new Date("2026-11-13T17:00:00Z") });
    assert.ok(lu.lu);
    const complet = await avecCeQuiAttendLeChef(lu, appeler);
    assert.ok(complet.lu);
    assert.equal(complet.faits.compteurs.attend, 1);
    const vu = rail(complet.faits);
    const carte = [...vu.colonnes.flatMap(({ cartes }) => cartes), ...vu.hors].find(({ ticket }) => ticket === 5);
    assert.ok(carte !== undefined);
    assert.equal(carte.ligne, "The manager asked you a question before splitting this epic: it waits for your answer.");
    assert.doesNotMatch(JSON.stringify(carte), /ready, waits for a place in the kitchen/);
  });

  test("une réponse du chef la fait sortir de TODO, sans autre geste", async () => {
    const attente = await lireCeQuiAttendLeChef({ depot: DEPOT, appeler: github([manager(QUESTION_DU_MANAGER), chef("C) both")]) });
    assert.ok(attente.lue);
    assert.deepEqual(attente.attentes, []);
  });

  test("le bouton d'un choix poste son libellé sur l'issue : le manager le lit, la carte part à la lecture suivante", async () => {
    const carte = carteDeLaQuestionDEpique([manager(QUESTION_DU_MANAGER)]);
    assert.ok(carte !== null);
    const ecrits: { methode: string; chemin: string; corps?: unknown }[] = [];
    const rendu = await repondreSurGithub({
      depot: DEPOT,
      ticket: 5,
      chef: carte,
      reponse: { question: formeDuChef(carte.texte).question, choix: 3 },
      client: {
        lire: async () => ({ status: 404, data: {} }),
        ecrire: async (methode, chemin, corps) => {
          ecrits.push({ methode, chemin, corps });
          return methode === "POST" ? { status: 201, data: { id: 77 } } : { status: 404, data: {} };
        },
      },
    });
    assert.ok("repondue" in rendu, JSON.stringify(rendu));
    assert.equal(ecrits[0]?.chemin, `/repos/${DEPOT}/issues/5/comments`);
    assert.equal((ecrits[0]?.corps as { body: string }).body, "<!-- brigade:reponse gesture=resume -->\nC) both");
  });

  test("un projet sans épique ne change pas : une lecture de plus, aucune carte", async () => {
    const attente = await lireCeQuiAttendLeChef({ depot: DEPOT, appeler: github([manager(QUESTION_DU_MANAGER)], ["fire"]) });
    assert.ok(attente.lue);
    assert.deepEqual(attente.attentes, []);
  });
});
