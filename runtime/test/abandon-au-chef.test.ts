// Un ticket que la cuisine sort du rail sans l'avoir servi entre dans le TODO
// du chef, et n'en disparaît jamais seul (#2118). Le scénario est celui de
// #2056 : remonté rouge par le manager, son calibrage déjà au plafond du projet
// (`opus` / `high`), la cuisine l'abandonne à 15:40, puis le sondage voit son
// `fire` retiré à 15:41 — et personne ne l'a vu pendant dix-huit heures.
import assert from "node:assert/strict";
import { describe, test, type TestContext } from "node:test";
import { abandonsAuChef } from "../src/abandon-au-chef.ts";
import { attentesDuChef, decrireAttentes } from "../src/attend.ts";
import { carteDuTicket } from "../src/carte-todo/cartes.ts";
import { faits, lireEtat } from "../src/etat.ts";
import type { Fait } from "../src/evenements.ts";
import { DU_MANAGER, ENCORE_ROUGE } from "../src/events/pass.ts";
import { ouvrirJournal } from "../src/journal.ts";
import { ticketDuRail, lireRail } from "../src/projections/rail.ts";
import { ouvrirRail } from "./aides/rail-du-journal.ts";
import { repondreALaCarte } from "../src/reponse-carte.ts";
import { fauxGitHub, issue, montre } from "./aides/cuisine.ts";
import { aArreter, DEPOT, repertoireTemporaire } from "./outils.ts";

const PROJET = "brigade";
const STATION = "box/claude";
const N = 2056;
const CALIBRAGE = ["model:opus", "effort:high"];
// Le motif du 86 que l'ancienne réaction au manager posait, tel que les journaux d'avant le portent.
const REMONTE = "manager:escalated";

function atelier(t: TestContext) {
  const heure = montre("2026-11-02T15:00:00.000Z");
  const journal = ouvrirJournal(repertoireTemporaire(t), { maintenant: heure.maintenant });
  aArreter(t, () => journal.fermer());
  const rail = ouvrirRail(journal, { projet: PROJET, dureeBailMs: 600_000, maintenant: heure.maintenant });
  const gh = fauxGitHub(issue(N, ["fire", ...CALIBRAGE], { title: "Switch brigade to GitHub-only state", createdAt: "2026-10-30T09:00:00Z" }), issue(18), issue(19), issue(20));
  const noter = (ticket: number, fait: Fait, author = "runtime") => journal.ajouter({ project: PROJET, ticket, author, ...fait });
  const arriver = (ticket: number, title = `Ticket ${ticket}`) =>
    noter(ticket, { type: "ticket.arrived", payload: { title, priority: 0, createdAt: "2026-10-30T09:00:00Z", url: `https://github.com/${DEPOT}/issues/${ticket}`, model: "opus", effort: "high", card: null } }, "github");
  // Le sondage voit `fire` retiré : le ticket quitte le rail.
  const sortir = (ticket: number) => noter(ticket, { type: "ticket.left", payload: { reason: "unfired" } }, "github");
  const enTodo = () => attentesDuChef(journal.base, lireRail(journal.base), heure.maintenant()).filter((attente) => attente.ticket === N);
  const repondre = (reponse: Parameters<typeof repondreALaCarte>[4], ticket = N) => repondreALaCarte(journal, gh.github, PROJET, ticket, reponse);

  // #2056 tel qu'il est parti : pris, livré, rouge, remonté par le manager,
  // puis abandonné par la cuisine — rien ne pouvait plus monter.
  const abandonner = () => {
    arriver(N, "Switch brigade to GitHub-only state");
    rail.prendre(STATION);
    noter(N, { type: "cook.launched", payload: { run: "cook-2056", limits: { durationMs: 1, tokens: 1, idleMs: 1 }, stream: "runs/cook-2056.jsonl", station: STATION, branch: "cook/2056-x", worktree: "worktrees/2056-x" } }, `station:${STATION}`);
    rail.envoyerEnPass(N, STATION);
    noter(N, { type: "pass.started", payload: { run: "cook-2056", pr: `https://github.com/${DEPOT}/pull/2100`, number: 2100, sha: "abc123" } }, "pass");
    noter(N, { type: "pass.escalated", payload: { reason: ENCORE_ROUGE, cause: DU_MANAGER } }, "manager");
    rail.quatreVingtSix(N, { motif: REMONTE });
    heure.avancer(40 * 60_000);
    const reason = "its calibration (`opus` / `high`) is already the highest the kitchen sets, and what it could try before was not enough";
    noter(N, { type: "pass.kitchen-took-over", payload: { cause: DU_MANAGER, move: "drop", reason } }, "pass");
  };
  return { journal, rail, gh, heure, noter, arriver, sortir, enTodo, repondre, abandonner };
}

describe("#2056 : la cuisine abandonne un ticket, et le chef le voit", () => {
  test("sorti du rail, il entre dans TODO : quel ticket, pourquoi en une phrase, et les trois gestes", (t) => {
    const c = atelier(t);
    c.abandonner();
    // 15:40 : abandonné, il est encore sur le rail — sa carte du rail dit ce que fait la cuisine, rien n'attend encore le chef.
    assert.equal(ticketDuRail(c.journal.base, N)?.state, "86");
    assert.deepEqual(c.enTodo(), []);

    // 15:41 : le sondage voit `fire` retiré. Il quitte le rail, et entre dans TODO.
    c.heure.avancer(60_000);
    c.sortir(N);
    assert.equal(ticketDuRail(c.journal.base, N), null);
    assert.deepEqual(c.enTodo(), [{ ticket: N, title: "Switch brigade to GitHub-only state", since: "2026-11-02T15:40:00.000Z", quoi: "abandon", voie: "pass", cause: DU_MANAGER, root: null }]);

    // Ce que l'app montre dans TODO : `facts.attend`, la carte dans la forme unique.
    const lus = faits(lireEtat(c.journal, c.heure.maintenant()), c.heure.maintenant(), DEPOT).attend.filter(({ ticket }) => ticket === N);
    assert.equal(lus.length, 1);
    const [lu] = lus;
    assert.equal(lu?.titre, "Switch brigade to GitHub-only state");
    assert.deepEqual(lu?.decision, { quoi: "abandon", motif: "pass", cause: DU_MANAGER, pr: null });
    assert.equal(
      lu?.carte.resume,
      "The kitchen took #2056 off the rail without serving it. Its delivery stayed blocked (manager-escalated) after everything the kitchen could try, up to the highest calibration it sets.",
    );
    assert.equal(lu?.carte.question, "What becomes of #2056?");
    assert.deepEqual(lu?.carte.choix, [
      { texte: "Put it back on the rail", suite: "resume" },
      { texte: "I take it in a dev session", suite: "drop" },
      { texte: "Close it", suite: "close" },
    ]);

    // La ligne du bloc `awaiting` de `status` le nomme, et dit ses gestes.
    const [, ligne] = decrireAttentes(attentesDuChef(c.journal.base, lireRail(c.journal.base)), () => "1 min");
    assert.match(ligne ?? "", /^ {2}#2056 {2}for 1 min {2}taken off the rail by the kitchen without being served — its delivery stayed blocked \(manager-escalated\) .* — to decide: set `fire` again; or take it in a dev session; or close the issue — .*Switch brigade to GitHub-only state$/);
  });

  test("la carte reste dans TODO jusqu'à la réponse du chef : ni le temps, ni le rail qui tourne, ni une autre réponse ne l'ôtent", (t) => {
    const c = atelier(t);
    c.abandonner();
    c.sortir(N);
    const avant = c.enTodo();
    assert.equal(avant.length, 1);

    // Dix-huit heures passent, la cuisine sert d'autres tickets, un autre quitte le rail, une autre carte est répondue.
    c.heure.avancer(18 * 3_600_000);
    for (const autre of [18, 19]) {
      c.arriver(autre);
      c.rail.prendre(STATION);
      c.rail.envoyerEnPass(autre, STATION);
      c.rail.servir(autre);
    }
    c.arriver(20);
    c.sortir(20);
    c.noter(20, { type: "todo.answered", payload: { choice: 1, answer: "Yes.", then: "resume" } }, "chef");
    c.noter(N, { type: "todo.left", payload: { why: "settled by the triage: wait" } }, "manager");

    assert.deepEqual(c.enTodo(), avant);
  });

  test("« Put it back on the rail » : `fire` revient sur l'issue, la réponse est écrite, et la carte sort de TODO", async (t) => {
    const c = atelier(t);
    c.abandonner();
    c.gh.github.delabelliser(N, "fire");
    c.sortir(N);

    const resultat = await c.repondre({ choix: 1 });

    assert.equal(resultat.done, true);
    assert.match(resultat.price, /^your answer is written on the issue, and `fire` is set on it again: the ticket comes back on the rail at the next poll/);
    assert.deepEqual(c.gh.labellisations, [[N, ["fire"]]]);
    assert.deepEqual(c.gh.lire(N)?.labels, [...CALIBRAGE, "fire"]);
    assert.deepEqual(c.gh.commentaires.map(([numero, corps]) => [numero, corps]), [[N, "**The chef's answer** to the TODO card — choice 1 of 3:\n\n> What becomes of #2056?\n\nPut it back on the rail"]]);
    assert.deepEqual(c.enTodo(), []);
    assert.deepEqual(abandonsAuChef(c.journal.base), []);
  });

  test("« I take it in a dev session » : il reste hors du rail, son issue ouverte, et la carte sort de TODO", async (t) => {
    const c = atelier(t);
    c.abandonner();
    c.sortir(N);

    const resultat = await c.repondre({ choix: 2 });

    assert.equal(resultat.done, true);
    assert.match(resultat.price, /the ticket stays off the rail, its issue open: no cook takes it, it is yours to work on by hand$/);
    assert.deepEqual([c.gh.labellisations, c.gh.fermetures], [[], []]);
    assert.equal(c.gh.lire(N)?.state, "open");
    assert.equal(ticketDuRail(c.journal.base, N), null);
    assert.deepEqual(c.journal.duTicket(N).findLast((e) => e.type === "todo.answered")?.payload, { choice: 2, answer: "I take it in a dev session", then: "drop" });
    assert.deepEqual(c.enTodo(), []);
  });

  test("« Close it » : son issue est fermée, et la carte sort de TODO", async (t) => {
    const c = atelier(t);
    c.abandonner();
    c.sortir(N);

    const resultat = await c.repondre({ choix: 3 });

    assert.equal(resultat.done, true);
    assert.match(resultat.price, /and its issue is closed: the ticket is not cooked/);
    assert.deepEqual(c.gh.fermetures, [N]);
    assert.equal(c.gh.lire(N)?.state, "closed");
    assert.deepEqual(c.enTodo(), []);
  });

  test("GitHub refuse de reposer `fire` : la réponse est sur l'issue, mais la carte reste dans TODO, et le refus le dit", async (t) => {
    const c = atelier(t);
    c.abandonner();
    c.sortir(N);
    c.gh.pannes.label = true;

    const resultat = await c.repondre({ choix: 1 });

    assert.equal(resultat.done, false);
    assert.match(resultat.reason ?? "", /^your answer is on the issue, but `fire` was not set again on #2056: gh api : HTTP 502$/);
    assert.equal(c.enTodo().length, 1);
  });

  test("une réponse en texte libre le remet sur le rail avec elle, comme toute réponse qui reprend un ticket", async (t) => {
    const c = atelier(t);
    c.abandonner();
    c.sortir(N);

    const resultat = await c.repondre({ texte: "Retry it once the board fix is merged." });

    assert.equal(resultat.done, true);
    assert.deepEqual(c.gh.labellisations, [[N, ["fire"]]]);
    assert.deepEqual(c.enTodo(), []);
  });

  test("le chef répond aussi hors de la carte : `fire` remis à la main, l'issue fermée, ou la PR mergée — la carte sort", (t) => {
    for (const reponse of [
      (c: ReturnType<typeof atelier>) => c.arriver(N),
      (c: ReturnType<typeof atelier>) => c.noter(N, { type: "manager.closed", payload: {} }, "manager"),
      (c: ReturnType<typeof atelier>) => c.noter(N, { type: "merge.done", payload: { pr: `https://github.com/${DEPOT}/pull/2100`, sha: "abc123", by: "outside", reconciled: false } }, "pass"),
    ]) {
      const c = atelier(t);
      c.abandonner();
      c.sortir(N);
      assert.equal(c.enTodo().length, 1);
      reponse(c);
      assert.deepEqual(
        attentesDuChef(c.journal.base, lireRail(c.journal.base)).filter((attente) => attente.quoi === "abandon"),
        [],
      );
    }
  });

  test("un retrait du chef lui-même n'ouvre aucune carte : la décision est la sienne", async (t) => {
    const c = atelier(t);
    c.arriver(N);
    c.noter(N, { type: "ticket.left", payload: { reason: "unfired" } }, "chef");
    assert.deepEqual(c.enTodo(), []);
  });
});

describe("les autres voies par lesquelles la cuisine sort un ticket du rail sans le servir", () => {
  test("sorti avec le ticket abandonné qu'il attend : sa carte nomme la racine, et « Put … back » remet `fire` sur elle", async (t) => {
    const c = atelier(t);
    c.abandonner();
    c.sortir(N);
    c.arriver(18);
    c.noter(18, { type: "ticket.dropped-with", payload: { root: N, cause: DU_MANAGER, reason: "son calibrage est déjà au plus haut" } });
    c.sortir(18);

    const carte = carteDuTicket(c.journal.base, 18)?.carte;
    assert.equal(carte?.resume, "The kitchen took #18 off the rail without serving it. It waits for #2056, which the kitchen dropped (manager-escalated), and it left the rail with it.");
    assert.deepEqual(carte?.choix[0], { texte: "Put #2056 back on the rail, and this ticket with it", suite: "resume" });

    const resultat = await c.repondre({ choix: 1 }, 18);
    assert.equal(resultat.done, true);
    assert.match(resultat.price, /`fire` is set again on #2056, which it waits for: #2056 comes back on the rail at the next poll, this ticket with it/);
    assert.deepEqual(c.gh.labellisations, [[N, ["fire"]]]);
    // Sa carte sort ; celle de la racine reste jusqu'à ce que la racine revienne.
    assert.deepEqual(abandonsAuChef(c.journal.base).map(({ ticket }) => ticket), [N]);
  });

  test("sorti avec une racine fermée depuis : rien ne le ramènerait, le geste est refusé avant que rien ne parte", async (t) => {
    const c = atelier(t);
    c.abandonner();
    c.sortir(N);
    c.arriver(18);
    c.noter(18, { type: "ticket.dropped-with", payload: { root: N, cause: DU_MANAGER, reason: "son calibrage est déjà au plus haut" } });
    c.sortir(18);
    await c.gh.github.fermerIssue(N);

    const resultat = await c.repondre({ choix: 1 }, 18);
    assert.equal(resultat.done, false);
    assert.match(resultat.reason ?? "", /#2056 is closed: take #18 in a dev session, or close it/);
    assert.deepEqual([c.gh.labellisations, c.gh.commentaires], [[], []]);
    assert.equal(carteDuTicket(c.journal.base, 18)?.attente.quoi, "abandon");
  });

  test("retiré du rail par le triage au lieu de poser sa carte : il entre dans TODO", (t) => {
    const c = atelier(t);
    c.arriver(19);
    c.sortir(19);
    c.noter(19, { type: "todo.triaged", payload: { action: "remove", sentence: "Doublon de #18.", reason: "Doublon.", run: "trie-19" } }, "manager");

    const carte = carteDuTicket(c.journal.base, 19);
    assert.equal(carte?.attente.quoi, "abandon");
    assert.equal(carte?.carte.resume, "The kitchen took #19 off the rail without serving it. The triage took it off the rail instead of asking you.");
  });
});
