// La réponse du chef à une carte de TODO : un de ses choix, ou un texte libre.
// Un seul appel écrit la réponse sur l'issue, sort la carte de TODO et fait
// avancer le ticket — le chef n'a pas d'autre geste à faire. Ce qui ne peut
// pas se faire est refusé avant que rien ne parte.
import assert from "node:assert/strict";
import { describe, test, type TestContext } from "node:test";
import { cartesEnTodo, entrerDansTodo, type Proposition } from "../src/carte-todo.ts";
import type { Fait } from "../src/evenements.ts";
import { DU_MANAGER, ENCORE_ROUGE } from "../src/events/pass.ts";
import { ouvrirJournal } from "../src/journal.ts";
import { principal as montrerRail } from "../src/montrer-rail.ts";
import { passDuTicket } from "../src/projections/pass.ts";
import { ticketDuRail } from "../src/projections/rail.ts";
import { ouvrirRail } from "../src/rail.ts";
import { REMONTE } from "../src/reaction.ts";
import { repondreALaCarte, REPONSE_DU_CHEF } from "../src/reponse-carte.ts";
import { RETENUE } from "../src/requalifier.ts";
import { fauxGitHub, issue, montre } from "./aides/cuisine.ts";
import { aArreter, appeler, DEPOT, fauxGh, repertoireTemporaire } from "./outils.ts";
import { posixOnly } from "./support/plateforme.ts";

const PROJET = "brigade";
const STATION = "box/claude";
const BRANCHE = "cook/30-x";
const CARTE: Proposition = {
  type: "product",
  enonce: "Export CSV ou export JSON ?",
  choix: [{ texte: "L'export CSV." }, { texte: "L'export JSON." }, { texte: "Garder la livraison telle quelle.", suite: "merge" }],
};

function atelier(t: TestContext) {
  const heure = montre();
  const journal = ouvrirJournal(repertoireTemporaire(t), { maintenant: heure.maintenant });
  aArreter(t, () => journal.fermer());
  const rail = ouvrirRail(journal, { projet: PROJET, dureeBailMs: 600_000, maintenant: heure.maintenant });
  const gh = fauxGitHub(issue(30), issue(40, [RETENUE]));
  const noter = (ticket: number, fait: Fait, author = "runtime") => journal.ajouter({ project: PROJET, ticket, author, ...fait });
  const arriver = () =>
    noter(30, { type: "ticket.arrived", payload: { title: "Ticket 30", priority: 1, createdAt: "2026-10-01T00:00:30Z", url: `https://github.com/${DEPOT}/issues/30`, card: null } }, "github");
  // Livré : sa branche, sa PR, son commit.
  const livrer = async () => {
    arriver();
    rail.prendre(STATION);
    noter(30, { type: "cook.launched", payload: { run: "cook-30", limits: { turns: 1, durationMs: 1, tokens: 1, idleMs: 1 }, stream: "runs/cook-30.jsonl", station: STATION, branch: BRANCHE, worktree: "worktrees/30-x" } }, `station:${STATION}`);
    rail.envoyerEnPass(30, STATION);
    const pr = await gh.github.ouvrirPR({ branche: BRANCHE, base: "v2", titre: "#30", corps: "" });
    noter(30, { type: "pass.started", payload: { run: "cook-30", pr, number: 101, sha: "abc123" } }, "pass");
  };
  // Rouge, remonté par le manager : 86, la carte dans TODO.
  const remonter = async () => {
    await livrer();
    noter(30, { type: "pass.escalated", payload: { reason: ENCORE_ROUGE, cause: DU_MANAGER } }, "manager");
    rail.quatreVingtSix(30, { motif: REMONTE });
    entrerDansTodo(journal, PROJET, 30, CARTE, "manager");
  };
  const dits = (numero = 30) => gh.commentaires.filter(([ticket]) => ticket === numero).map(([, corps]) => corps);
  const repondre = (reponse: Parameters<typeof repondreALaCarte>[4], ticket = 30) => repondreALaCarte(journal, gh.github, PROJET, ticket, reponse);
  return { journal, rail, gh, noter, arriver, livrer, remonter, dits, repondre };
}

describe("répondre d'un clic à une carte de TODO", () => {
  test("par un choix : la réponse est écrite sur l'issue, et le ticket repart chez un cook avec elle, dans le même appel", async (t) => {
    const c = atelier(t);
    await c.remonter();
    assert.equal(cartesEnTodo(c.journal.base).length, 1);

    const resultat = await c.repondre({ choix: 2 });

    assert.equal(resultat.done, true);
    assert.match(resultat.price, /^your answer is written on the issue; a cook is launched again on cook\/30-x, on the project's quota/);
    // Sur l'issue : la question et le choix.
    assert.deepEqual(c.dits(), ["**The chef's answer** to the TODO card — choice 2 of 3:\n\n> Export CSV ou export JSON ?\n\nL'export JSON."]);
    // Le ticket avance : rendu au rail, sa livraison renvoyée au cook avec la réponse.
    assert.equal(ticketDuRail(c.journal.base, 30)?.state, "waiting");
    assert.equal(c.journal.duTicket(30).findLast((e) => e.type === "ticket.released")?.payload.reason, REPONSE_DU_CHEF);
    assert.deepEqual(passDuTicket(c.journal.base, 30)?.findings, ["Le chef a répondu à la question « Export CSV ou export JSON ? » : L'export JSON."]);
    // La carte sort de TODO ; la réponse est au journal.
    assert.deepEqual(cartesEnTodo(c.journal.base), []);
    assert.deepEqual(c.journal.duTicket(30).findLast((e) => e.type === "todo.answered")?.payload, { choice: 2, answer: "L'export JSON.", then: "resume" });
    assert.equal(c.journal.duTicket(30).findLast((e) => e.type === "todo.left")?.author, "chef");
  });

  test("en texte libre : de même, ses mots sont écrits sur l'issue et le ticket repart avec eux", async (t) => {
    const c = atelier(t);
    await c.remonter();

    const resultat = await c.repondre({ texte: "  Ni l'un ni l'autre : un export Excel, en plus du CSV.  " });

    assert.equal(resultat.done, true);
    assert.deepEqual(c.dits(), ["**The chef's answer** to the TODO card, in their own words:\n\n> Export CSV ou export JSON ?\n\nNi l'un ni l'autre : un export Excel, en plus du CSV."]);
    assert.equal(ticketDuRail(c.journal.base, 30)?.state, "waiting");
    assert.deepEqual(passDuTicket(c.journal.base, 30)?.findings, ["Le chef a répondu à la question « Export CSV ou export JSON ? » : Ni l'un ni l'autre : un export Excel, en plus du CSV."]);
    assert.deepEqual(cartesEnTodo(c.journal.base), []);
    assert.deepEqual(c.journal.duTicket(30).findLast((e) => e.type === "todo.answered")?.payload, { choice: null, answer: "Ni l'un ni l'autre : un export Excel, en plus du CSV.", then: "resume" });
  });

  test("un choix qui merge : la livraison verte qui attend le chef est mergée, la réponse écrite, et la carte sort de TODO", async (t) => {
    const c = atelier(t);
    await c.livrer();
    c.noter(30, { type: "pass.held", payload: { reason: "no-grant" } }, "pass");
    entrerDansTodo(c.journal, PROJET, 30, CARTE, "pass");

    const resultat = await c.repondre({ choix: 3 });

    assert.equal(resultat.done, true);
    assert.deepEqual(c.gh.merges, [[101, `tete-de-${BRANCHE}`]]);
    assert.match(c.dits()[0] ?? "", /choice 3 of 3:\n\n> Export CSV ou export JSON \?\n\nGarder la livraison telle quelle\.$/);
    assert.deepEqual(cartesEnTodo(c.journal.base), []);
    // Le merge, la pass le constate et sert le ticket : rien ne le renvoie au cook.
    assert.equal(ticketDuRail(c.journal.base, 30)?.state, "pass");
  });

  test("un ticket 86 sans livraison revient sur le rail ; une issue retenue par `blocked-on-human` perd son label, et le manager la rejuge", async (t) => {
    const c = atelier(t);
    c.arriver();
    c.rail.quatreVingtSix(30, { motif: "no-station: chrome" });
    entrerDansTodo(c.journal, PROJET, 30, CARTE, "manager");
    assert.equal((await c.repondre({ choix: 1 })).done, true);
    assert.equal(ticketDuRail(c.journal.base, 30)?.state, "waiting");

    entrerDansTodo(c.journal, PROJET, 40, CARTE, "manager");
    const retenue = await c.repondre({ texte: "Le CSV, séparé par des points-virgules." }, 40);
    assert.equal(retenue.done, true);
    assert.match(retenue.price, /`blocked-on-human` is removed: the manager judges the issue again with your answer/);
    assert.deepEqual(c.gh.delabellisations, [[40, RETENUE]]);
    assert.equal(c.dits(40).length, 1);
    assert.deepEqual(cartesEnTodo(c.journal.base), []);
  });

  test("ce qui ne peut pas se faire est refusé avant que rien ne parte : ni commentaire, ni carte sortie", async (t) => {
    const c = atelier(t);
    assert.deepEqual(await c.repondre({ choix: 1 }), { done: false, reason: "#30 has no card in TODO", price: "none: nothing was changed" });

    await c.remonter();
    for (const choix of [0, 4, 1.5]) assert.equal((await c.repondre({ choix })).done, false, String(choix));
    assert.match(((await c.repondre({ choix: 4 })) as { reason: string }).reason, /offers choices 1 to 3/);
    assert.match(((await c.repondre({ texte: "   " })) as { reason: string }).reason, /it is empty/);
    // Merger une livraison remontée, rouge : ce n'est pas une livraison verte qui attend.
    assert.match(((await c.repondre({ choix: 3 })) as { reason: string }).reason, /no green delivery of it waits to be merged/);
    assert.deepEqual(c.gh.merges, []);
    assert.deepEqual(c.dits(), []);
    assert.equal(cartesEnTodo(c.journal.base).length, 1);
    assert.equal(ticketDuRail(c.journal.base, 30)?.state, "86");
  });

  test("GitHub refuse le commentaire : rien n'a changé, la carte reste dans TODO", async (t) => {
    const c = atelier(t);
    await c.remonter();
    c.gh.pannes.commentaire = true;
    await assert.rejects(c.repondre({ choix: 1 }), /HTTP 502/);
    assert.equal(cartesEnTodo(c.journal.base).length, 1);
    assert.equal(ticketDuRail(c.journal.base, 30)?.state, "86");
  });
});

describe("`rail choose` et `rail answer`", () => {
  const COMMENTAIRES = `repos/${DEPOT}/issues/30/comments`;

  function cuisine(t: TestContext) {
    const repertoire = repertoireTemporaire(t);
    const journal = ouvrirJournal(repertoire);
    aArreter(t, () => journal.fermer());
    journal.ajouter({ project: PROJET, ticket: 30, author: "github", type: "ticket.arrived", payload: { title: "Ticket 30", priority: 1, createdAt: "2026-10-01T00:00:30Z", url: "https://exemple.test/30" } });
    entrerDansTodo(journal, PROJET, 30, CARTE, "manager");
    const gh = fauxGh(t);
    const jouer = (args: string[]) => appeler(montrerRail, args, { BRIGADE_STATE_DIR: repertoire, BRIGADE_GITHUB_REPO: DEPOT, BRIGADE_GH_BIN: gh.bin });
    return { journal, gh, jouer };
  }

  test("`choose` répond par le choix n, `answer` en mots tapés sans guillemets : la réponse part sur l'issue, et le prix est dit", { skip: posixOnly("the fake gh is a POSIX shell script") }, async (t) => {
    const { journal, gh, jouer } = cuisine(t);
    gh.repondre(COMMENTAIRES, { statut: 201, corps: {} });

    const choisi = jouer(["choose", "30", "1"]);
    assert.equal(await choisi.fin, 0);
    assert.match(choisi.sortie(), /^#30: card answered, choice 1 — cost: your answer is written on the issue; the ticket is queued on the rail/);
    assert.equal(gh.appels().at(-1)?.at(-1), COMMENTAIRES);
    assert.deepEqual(cartesEnTodo(journal.base), []);

    entrerDansTodo(journal, PROJET, 30, CARTE, "manager");
    const libre = jouer(["answer", "30", "Un", "export", "Excel."]);
    assert.equal(await libre.fin, 0);
    assert.match(libre.sortie(), /^#30: card answered — cost: your answer is written on the issue/);
    assert.equal(journal.duTicket(30).findLast((e) => e.type === "todo.answered")?.payload.answer, "Un export Excel.");
  });

  test("une demande mal formée est refusée en 2, une réponse impossible en 1, avant que rien ne parte", { skip: posixOnly("the fake gh is a POSIX shell script") }, async (t) => {
    const { gh, jouer } = cuisine(t);
    for (const args of [["choose", "30"], ["choose", "30", "zéro"], ["choose", "30", "0"], ["choose", "30", "1", "2"], ["answer", "x", "oui"]]) {
      const commande = jouer(args);
      assert.equal(await commande.fin, 2, args.join(" "));
      assert.match(commande.sortie(), /usage/, args.join(" "));
    }
    const horsChoix = jouer(["choose", "30", "9"]);
    assert.equal(await horsChoix.fin, 1);
    assert.match(horsChoix.sortie(), /#30 is not touched: the card of #30 offers choices 1 to 3/);
    assert.deepEqual(gh.appels(), []);
  });
});
