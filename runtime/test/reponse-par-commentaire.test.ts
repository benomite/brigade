// Répondre à la question d'une carte par un commentaire sur GitHub (#3253) :
// le commentaire que la cuisine a posé (mention-du-chef/) se répond ou se
// cite, et la réponse vaut celle de l'app — mais seulement de l'auteur que
// l'app laisserait répondre, jamais d'un bot, et une seule fois.
import assert from "node:assert/strict";
import { describe, test, type TestContext } from "node:test";
import { cartesEnTodo, entrerDansTodo, type Proposition } from "../src/carte-todo.ts";
import type { Fait } from "../src/evenements.ts";
import { DU_MANAGER, ENCORE_ROUGE } from "../src/events/pass.ts";
import { ouvrirJournal } from "../src/journal.ts";
import { mentionneurDuChef } from "../src/mention-du-chef/mention-du-chef.ts";
import { passDuTicket } from "../src/projections/pass.ts";
import { repondeurParCommentaire, separerLaCitation } from "../src/reponse-par-commentaire/reponse-par-commentaire.ts";
import { fauxGitHub, issue, montre } from "./aides/cuisine.ts";
import { ouvrirRail } from "./aides/rail-du-journal.ts";
import { aArreter, DEPOT, repertoireTemporaire } from "./outils.ts";

const PROJET = "brigade";
const STATION = "box/claude";
const LISTE: Proposition = {
  type: "product",
  raison: "product-choice",
  resume: "The ticket adds a saved list. It can be kept per project or shared by all of them.",
  enonce: "One list per project, or one for all projects?",
  choix: [{ texte: "One list per project." }, { texte: "One list for all projects." }],
};

function atelier(t: TestContext, humains: unknown = undefined) {
  const heure = montre();
  const journal = ouvrirJournal(repertoireTemporaire(t), { maintenant: heure.maintenant });
  aArreter(t, () => journal.fermer());
  const gh = fauxGitHub(issue(12, []), issue(30));
  const avertis: string[] = [];
  const mentionneur = mentionneurDuChef(journal.base, { github: gh.github, chef: () => "benomite" });
  const repondeur = repondeurParCommentaire({ journal }, { github: gh.github, projet: PROJET, chef: () => "benomite", reglages: () => humains, avertir: (ligne) => avertis.push(ligne) });
  // Le commentaire de la question, posé par la cuisine ; puis ce que le chef répond.
  const poser = async (ticket: number) => {
    await mentionneur.passer();
    return gh.github.commentaires(ticket).then((lus) => lus.at(-1)?.body ?? "");
  };
  const repondre = (ticket: number, corps: string, auteur = "benomite", association = "OWNER") => gh.repondre(ticket, corps, association, auteur);
  const reponses = (ticket: number) => journal.duTicket(ticket).filter((e) => e.type === "todo.answered").map((e) => e.payload);
  // Une carte de la porte : un ticket sorti du rail, retenu pour le chef.
  const carte = (ticket: number, proposition: Proposition = LISTE) => entrerDansTodo(journal, PROJET, ticket, proposition, "manager");
  return { journal, gh, avertis, mentionneur, repondeur, poser, repondre, reponses, carte, heure };
}

describe("répondre par un commentaire GitHub", () => {
  test("le commentaire de la question dit que répondre ou citer répond", async (t) => {
    const c = atelier(t);
    c.carte(12);
    const corps = await c.poser(12);
    assert.match(corps, /Reply to this comment \(or quote-reply it\) to answer/);
    assert.equal(corps.split("\n").filter((ligne) => ligne.startsWith("Reply to this comment")).length, 1);
  });

  test("un choix cité, casse et espaces ignorés : il est enregistré comme cliqué dans l'app, et la carte sort de TODO", async (t) => {
    const c = atelier(t);
    c.carte(12);
    const question = await c.poser(12);
    c.repondre(12, `${question.split("\n").map((ligne) => `> ${ligne}`).join("\n")}\n\n  one LIST   for all projects.  `);
    await c.repondeur.passer();
    assert.deepEqual(c.reponses(12).map(({ choice, answer, then }) => ({ choice, answer, then })), [{ choice: 2, answer: "One list for all projects.", then: "resume" }]);
    assert.deepEqual(cartesEnTodo(c.journal.base), []);
    assert.equal(c.journal.duTicket(12).findLast((e) => e.type === "todo.left")?.author, "chef");
    assert.deepEqual(c.avertis, []);
  });

  test("un texte qui n'est aucun choix : sa réponse libre est passée comme celle du chef", async (t) => {
    const c = atelier(t);
    c.carte(12);
    await c.poser(12);
    c.repondre(12, "Per team, please.");
    await c.repondeur.passer();
    assert.deepEqual(c.reponses(12).map(({ choice, answer }) => ({ choice, answer })), [{ choice: null, answer: "Per team, please." }]);
    assert.match(c.gh.commentaires.at(-1)?.[1] ?? "", /in their own words:\n\n> One list per project, or one for all projects\?\n\nPer team, please\.$/);
    assert.deepEqual(cartesEnTodo(c.journal.base), []);
  });

  test("un auteur que l'app ne laisserait pas répondre est ignoré : la carte reste dans TODO", async (t) => {
    const c = atelier(t, { humans: [{ login: "designer", roles: ["design"] }] });
    c.carte(12);
    await c.poser(12);
    c.repondre(12, "One list per project.", "passant", "NONE");
    c.repondre(12, "One list per project.", "designer", "MEMBER");
    await c.repondeur.passer();
    assert.deepEqual(c.reponses(12), []);
    assert.equal(cartesEnTodo(c.journal.base).length, 1);
  });

  test("un humain dont le rôle répond à la question peut répondre", async (t) => {
    const c = atelier(t, { humans: [{ login: "Pat", roles: ["product"] }] });
    c.carte(12);
    await c.poser(12);
    c.repondre(12, "One list per project.", "pat", "MEMBER");
    await c.repondeur.passer();
    assert.equal(c.reponses(12).length, 1);
    assert.deepEqual(cartesEnTodo(c.journal.base), []);
  });

  test("un bot, et les commentaires de la cuisine elle-même, ne répondent jamais", async (t) => {
    const c = atelier(t);
    c.carte(12);
    await c.poser(12);
    c.repondre(12, "One list per project.", "brigade-manager[bot]", "NONE");
    c.repondre(12, "<!-- brigade:manager -->\nOne list per project.", "benomite", "OWNER");
    await c.repondeur.passer();
    assert.deepEqual(c.reponses(12), []);
    assert.equal(cartesEnTodo(c.journal.base).length, 1);
  });

  test("sans citation, avec une seule question ouverte : c'est sa réponse", async (t) => {
    const c = atelier(t);
    c.carte(12);
    await c.poser(12);
    c.repondre(12, "One list for all projects.");
    await c.repondeur.passer();
    assert.deepEqual(c.reponses(12).map(({ choice }) => choice), [2]);
  });

  describe("plusieurs questions ouvertes sur une issue", () => {
    // Une carte de la porte sur un ticket 86 : sa remontée (renvoyer, retirer) était posée la première.
    async function deuxQuestions(t: TestContext) {
      const c = atelier(t);
      const rail = ouvrirRail(c.journal, { projet: PROJET, dureeBailMs: 600_000, maintenant: c.heure.maintenant });
      const noter = (fait: Fait, author = "runtime") => c.journal.ajouter({ project: PROJET, ticket: 30, author, ...fait });
      noter({ type: "ticket.arrived", payload: { title: "Ticket 30", priority: 1, createdAt: "2026-10-01T00:00:30Z", url: `https://github.com/${DEPOT}/issues/30`, card: null } }, "github");
      rail.prendre(STATION);
      noter({ type: "cook.launched", payload: { run: "cook-30", limits: { durationMs: 1, tokens: 1, idleMs: 1 }, stream: "runs/cook-30.jsonl", station: STATION, branch: "cook/30-x", worktree: "worktrees/30-x" } }, `station:${STATION}`);
      rail.envoyerEnPass(30, STATION);
      const pr = await c.gh.github.ouvrirPR({ branche: "cook/30-x", base: "v2", titre: "#30", corps: "" });
      noter({ type: "pass.started", payload: { run: "cook-30", pr, number: 101, sha: "abc123" } }, "pass");
      noter({ type: "pass.escalated", payload: { reason: ENCORE_ROUGE, cause: DU_MANAGER } }, "manager");
      rail.quatreVingtSix(30, { motif: "manager:escalated" });
      const premiere = await c.poser(30);
      c.carte(30);
      const seconde = await c.poser(30);
      return { ...c, premiere, seconde, citer: (q: string) => q.split("\n").map((ligne) => `> ${ligne}`).join("\n") };
    }

    test("sans citation : la plus ancienne question ouverte reçoit la réponse", async (t) => {
      const c = await deuxQuestions(t);
      assert.notEqual(c.premiere, c.seconde);
      c.repondre(30, "Send it back to a cook");
      await c.repondeur.passer();
      assert.equal(c.reponses(30).length, 1);
      assert.equal(c.reponses(30)[0]?.answer, "Send it back to a cook");
      assert.equal(c.gh.commentaires.at(-1)?.[1].includes("> Send it back"), false);
      assert.equal(passDuTicket(c.journal.base, 30)?.findings.length, 1);
      assert.match(passDuTicket(c.journal.base, 30)?.findings[0] ?? "", /Send it back to a cook/);
    });

    test("avec une citation de la question qui n'est pas la plus ancienne : c'est elle qui reçoit la réponse", async (t) => {
      const c = await deuxQuestions(t);
      c.repondre(30, `${c.citer(c.seconde)}\n\nOne list for all projects.`);
      await c.repondeur.passer();
      assert.equal(c.reponses(30).length, 1);
      assert.deepEqual(c.reponses(30)[0] && { choice: c.reponses(30)[0]?.choice, answer: c.reponses(30)[0]?.answer }, { choice: 2, answer: "One list for all projects." });
      // La réponse est à la question de la carte, pas à celle de la remontée.
      assert.deepEqual(passDuTicket(c.journal.base, 30)?.findings, ["Le chef a répondu à la question « One list per project, or one for all projects? » : One list for all projects."]);
    });
  });

  test("un second commentaire sur une question déjà répondue ne change pas la réponse et ne rouvre pas la carte", async (t) => {
    const c = atelier(t);
    c.carte(12);
    await c.poser(12);
    c.repondre(12, "One list per project.");
    await c.repondeur.passer();
    c.repondre(12, "No wait, one list for all projects.");
    await c.repondeur.passer();
    await c.repondeur.passer();
    assert.deepEqual(c.reponses(12).map(({ choice }) => choice), [1]);
    assert.deepEqual(cartesEnTodo(c.journal.base), []);
  });

  test("une citation qui ne reproduit aucune question ouverte, ou rien après la citation : pas une réponse", async (t) => {
    const c = atelier(t);
    c.carte(12);
    const question = await c.poser(12);
    c.repondre(12, "> something else entirely\n\nOne list per project.");
    c.repondre(12, question.split("\n").map((ligne) => `> ${ligne}`).join("\n"));
    await c.repondeur.passer();
    assert.deepEqual(c.reponses(12), []);
  });

  test("une lecture de GitHub qui échoue se dit une fois, ne répond à rien, et se rejoue au tick suivant", async (t) => {
    const c = atelier(t);
    c.carte(12);
    await c.poser(12);
    c.repondre(12, "One list per project.");
    let panne = true;
    const lire = c.gh.github.commentaires;
    c.gh.github.commentaires = async (numero) => {
      if (panne) throw new Error("gh api : HTTP 502");
      return lire(numero);
    };
    await c.repondeur.passer();
    await c.repondeur.passer();
    assert.deepEqual(c.avertis, ["brigade : replies on #12 are not read — gh api : HTTP 502"]);
    assert.deepEqual(c.reponses(12), []);
    panne = false;
    await c.repondeur.passer();
    assert.equal(c.reponses(12).length, 1);
  });

  test("séparer la citation : un bloc de `>` en tête, des lignes vides au milieu, le reste est la réponse", () => {
    assert.deepEqual(separerLaCitation("> a\n>\n> b\n\n> c\n\nyes"), { citation: "a\n\nb\n\nc", reponse: "yes" });
    assert.deepEqual(separerLaCitation("yes\n> a"), { citation: null, reponse: "yes\n> a" });
  });
});
