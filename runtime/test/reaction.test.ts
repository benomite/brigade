// Le manager devant un ticket que la pass juge rouge : sur un runtime complet,
// des gates rouges, un GitHub de test, et un faux `claude` pour ses choix.
import assert from "node:assert/strict";
import { describe, test, type TestContext } from "node:test";
import { REDECOUPE } from "../src/evenements/rail.ts";
import { MARQUEUR } from "../src/fiche.ts";
import { MARQUEUR_MANAGER } from "../src/juger.ts";
import { etatDesGardeFous } from "../src/projections/garde-fous.ts";
import { passDuTicket } from "../src/projections/pass.ts";
import { reactionDe } from "../src/projections/reactions.ts";
import { STATION } from "../src/station.ts";
import { chef, cuisine, issue, type Options } from "./aides/cuisine.ts";
import { jusqua } from "./outils.ts";

type Charge = Record<string, unknown>;

// Une cuisine dont les gates sont rouges et le manager allumé, sauf mention
// contraire.
function echec(t: TestContext, options: Options & { eteint?: boolean } = {}) {
  const c = cuisine(t, { pass: true, ...options, manager: { jugement: "reagit-remonte", ...options.manager } });
  c.gates.regler("rouge");
  if (!options.eteint) chef(c.repertoire, "manager.enabled");
  const { journal } = c;
  const faits = (type: string, ticket?: number) => (ticket === undefined ? journal.tout() : journal.duTicket(ticket)).filter((e) => e.type === type);
  const charges = (type: string, ticket: number) => faits(type, ticket).map((e) => e.payload as Charge);
  const jusquAu = (type: string, ticket: number, combien = 1) => jusqua(() => faits(type, ticket).length >= combien);
  // Le calibrage de chaque cook parti sur le ticket, dans l'ordre.
  const calibrages = (ticket: number) =>
    charges("cook.launched", ticket)
      .filter((lance) => lance.station === STATION)
      .map((lance) => `${lance.model}/${lance.effort}`);
  const jugements = () => c.lancements().filter((lancement) => lancement.args.includes("--tools"));
  const dits = (numero: number) => c.gh.commentaires.filter(([n, corps]) => n === numero && corps.includes(MARQUEUR_MANAGER)).map(([, corps]) => corps);
  const labels = (numero: number) => c.gh.lire(numero)?.labels ?? [];
  const ticket = (numero: number) => c.runtime.rail.tickets().find((x) => x.ticket === numero);
  return { ...c, faits, charges, jusquAu, calibrages, jugements, dits, labels, ticket, pass: (numero: number) => passDuTicket(journal.base, numero) };
}

describe("le manager réagit à un échec", { concurrency: 8 }, () => {
  test("éteint, rien ne change : deux renvois au même calibrage, puis la pass remonte au chef", async (t) => {
    const c = echec(t, { eteint: true, issues: [issue(17)], manager: { plafond: { model: "opus", effort: "max" } } });
    await c.jusquAu("pass.escalated", 17);

    assert.deepEqual(c.calibrages(17), ["sonnet/low", "sonnet/low", "sonnet/low"]);
    assert.deepEqual([c.pass(17)?.cause, c.faits("pass.deferred").length, c.faits("manager.reacted").length], ["returns-exhausted", 0, 0]);
  });

  test("au second rouge, la pass passe la main : le manager monte d'un cran le label qu'il a posé, sans LLM, puis renvoie", async (t) => {
    const c = echec(t, { issues: [issue(30, [])], manager: { suite: ["juge-ticket"], plafond: { model: "sonnet", effort: "medium" } } });
    await c.jusquAu("pass.returned", 30, 2);

    assert.deepEqual(c.labels(30), ["fire", "model:haiku", "effort:medium"]);
    assert.deepEqual(c.gh.delabellisations, [[30, "effort:low"]]);
    const [reaction] = c.charges("manager.reacted", 30);
    assert.deepEqual(
      { ...reaction, verdict: null, reason: null },
      { verdict: null, returns: 1, choice: "raise", reason: null, proposal: null, run: null, from: { model: "haiku", effort: "low" }, to: { model: "haiku", effort: "medium" } },
    );
    assert.deepEqual(c.charges("manager.raised", 30), [{ added: ["effort:medium"], removed: ["effort:low"] }]);
    // Le premier renvoi est celui de la pass, le second celui du manager.
    assert.deepEqual(c.faits("pass.returned", 30).map((e) => [e.author, (e.payload as Charge).n]), [["pass", 1], ["manager", 2]]);
    // Le seul appel au modèle est le jugement qui a mis le ticket sur le rail.
    assert.equal(c.jugements().length, 1);
    assert.ok(c.dits(30).some((dit) => /second renvoi.*monté de `haiku` \/ `low` à `haiku` \/ `medium`/s.test(dit)));

    // Le cook du second renvoi part au calibrage monté, jamais à l'ancien.
    await jusqua(() => c.calibrages(30).length === 3);
    assert.deepEqual(c.calibrages(30), ["haiku/low", "haiku/low", "haiku/medium"]);
  });

  test("un label de calibrage posé par le chef n'est jamais touché : le second renvoi part au même calibrage, et le manager dit pourquoi", async (t) => {
    const c = echec(t, { issues: [issue(17)], manager: { plafond: { model: "opus", effort: "max" } } });
    await c.jusquAu("pass.returned", 17, 2);

    assert.deepEqual(c.labels(17), ["fire", "model:sonnet", "effort:low"]);
    assert.deepEqual([c.gh.labellisations, c.gh.delabellisations], [[], []]);
    const [reaction] = c.charges("manager.reacted", 17);
    assert.deepEqual([reaction?.choice, reaction?.to], ["retry", null]);
    assert.match(String(reaction?.reason), /posés par le chef/);
    assert.ok(c.dits(17).some((dit) => /second renvoi au même calibrage.*posés par le chef/s.test(dit)));
  });

  test("sans plafond configuré, rien ne monte, et le manager le dit", async (t) => {
    const c = echec(t, { issues: [issue(30, [])], manager: { suite: ["juge-ticket"] } });
    await c.jusquAu("pass.returned", 30, 2);

    assert.deepEqual(c.labels(30), ["fire", "model:haiku", "effort:low"]);
    assert.match(String(c.charges("manager.reacted", 30)[0]?.reason), /aucun plafond de calibrage n'est configuré/);
  });

  test("passé les deux renvois, le manager choisit — monter — et un ticket ne repart jamais à l'identique", async (t) => {
    const c = echec(t, { issues: [issue(30, [])], manager: { suite: ["juge-ticket", "reagit-monte"], plafond: { model: "sonnet", effort: "medium" } } });
    await c.jusquAu("pass.escalated", 30);

    // L'effort d'abord, puis le modèle : chaque relance a changé de calibrage.
    assert.deepEqual(c.calibrages(30), ["haiku/low", "haiku/low", "haiku/medium", "sonnet/medium"]);
    assert.deepEqual(c.labels(30), ["fire", "effort:medium", "model:sonnet"]);
    const reactions = c.charges("manager.reacted", 30);
    assert.deepEqual(reactions.map((reaction) => [reaction.returns, reaction.choice]), [[1, "raise"], [2, "raise"], [3, "escalate"]]);
    // Le choix vient d'un jugement, qui figure au journal comme un cook.
    assert.match(String(reactions[1]?.run), /^reagit-30-[0-9a-f]{8}$/);
    assert.equal(reactions[1]?.reason, "Le ticket est bien posé : le cook cale sur le raisonnement.");
    assert.deepEqual(reactions[1]?.to, { model: "sonnet", effort: "medium" });
    // Un jugement pour qualifier, un par réaction passée les deux renvois.
    assert.equal(c.jugements().length, 3);
    // Au plafond, monter n'est plus offert : la consigne le dit au jugement.
    assert.match(c.jugements()[2]?.args[1] ?? "", /Monter n'est pas possible : le calibrage est déjà au plafond \(`sonnet` \/ `medium`\)/);
    assert.ok(c.dits(30).some((dit) => /monte le calibrage.*`haiku` \/ `medium` à `sonnet` \/ `medium`.*le cook cale sur le raisonnement/s.test(dit)));
  });

  test("le chef n'est sollicité qu'en dernier recours, et reçoit de quoi trancher : ce qui a été tenté, ce qui a échoué, ce que le manager propose", async (t) => {
    const c = echec(t, { issues: [issue(17)] });
    await c.jusquAu("pass.escalated", 17);
    await jusqua(() => c.dits(17).some((dit) => /remontée au chef/.test(dit)));

    assert.deepEqual([c.pass(17)?.phase, c.pass(17)?.reason, c.pass(17)?.cause], ["escalated", "still-red", "manager-escalated"]);
    assert.deepEqual([c.ticket(17)?.state, c.ticket(17)?.reason], ["86", "manager:escalated"]);
    const dit = c.dits(17).find((corps) => /remontée au chef/.test(corps)) ?? "";
    assert.match(dit, /Ce qui a été tenté/);
    assert.match(dit, /1\. `sonnet` \/ `low` — pass rouge/);
    assert.match(dit, /3\. `sonnet` \/ `low` — pass rouge/);
    assert.match(dit, /Gates rouges/);
    assert.match(dit, /Pourquoi le manager remonte\.\*\* Le critère d'acceptation n° 2 se contredit\./);
    assert.match(dit, /Ce qu'il propose\.\*\* Trancher le critère n° 2, puis rendre le ticket\./);
    assert.match(dit, /Réagi par le manager en `sonnet` \/ `medium`/);
    assert.match(dit, /Mergée à la main, sa PR sert le ticket/);
    assert.equal(c.cooks().length, 3);
  });

  test("remonté sans diff, le ticket n'a pas de PR : le commentaire ne propose pas de la merger, et dit ce que le chef peut faire", async (t) => {
    const c = echec(t, { issues: [issue(17)], scenario: "bavard", suite: ["rapporte-sans-commit", "rapporte-sans-commit", "rapporte-sans-commit"], reviewer: { relecture: "relit-rouge" } });
    await c.jusquAu("pass.escalated", 17);
    await jusqua(() => c.dits(17).some((dit) => /remontée au chef/.test(dit)));

    assert.deepEqual(c.gh.prs, []);
    const dit = c.dits(17).find((corps) => /remontée au chef/.test(corps)) ?? "";
    assert.match(dit, /le ticket est 86/);
    assert.doesNotMatch(dit, /sa PR|Mergée/);
    assert.match(dit, /Il n'a pas de PR, donc rien à merger : retirer `fire` le sort du rail, ou ferme-le/);
  });

  test("une réaction illisible, ou qui choisit ce qui n'était pas offert, vaut remontée : le manager ne devine pas", async (t) => {
    // Monter n'est pas offert — le calibrage est au chef — et c'est ce que le jugement choisit.
    const c = echec(t, { issues: [issue(17)], manager: { jugement: "reagit-monte", plafond: { model: "opus", effort: "max" } } });
    await c.jusquAu("pass.escalated", 17);

    const reaction = c.charges("manager.reacted", 17).at(-1);
    assert.equal(reaction?.choice, "escalate");
    assert.match(String(reaction?.reason), /« monter » n'était pas offert/);
    assert.equal(c.cooks().length, 3);
    assert.deepEqual(c.labels(17), ["fire", "model:sonnet", "effort:low"]);
  });

  test("redécoupé, le ticket devient l'épique de ses sous-tickets : il ne tient plus sa zone, et ils partent", async (t) => {
    const c = echec(t, { issues: [issue(30, [])], manager: { suite: ["juge-ticket", "reagit-redecoupe", "decoupe-tickets"] } });
    c.gh.ficher(30, "2026-10-08T09:00:00Z", `${MARQUEUR}\n- zone : runtime/src, docs/`);
    await c.jusquAu("manager.split-done", 30);

    assert.deepEqual(c.charges("manager.reacted", 30).map((reaction) => [reaction.choice, reaction.reason]).at(-1), ["split", "Deux livrables dans un seul ticket."]);
    assert.deepEqual([c.pass(30)?.phase, c.pass(30)?.reason], ["escalated", "manager-split"]);
    assert.deepEqual([c.ticket(30)?.state, c.ticket(30)?.reason], ["86", REDECOUPE]);
    // Sa PR reste ouverte : rien n'est mergé, rien n'est fermé.
    assert.deepEqual([c.gh.merges, c.gh.fermetures], [[], []]);
    assert.ok(c.dits(30).some((dit) => /redécoupe le ticket.*Deux livrables dans un seul ticket\./s.test(dit)));
    // La consigne du découpage porte ce qui a échoué.
    assert.match(c.jugements()[2]?.args[1] ?? "", /a échoué 3 fois en pass.*Gates rouges/s);

    // Le premier sous-ticket possède `runtime/src/rail.ts`, dans la zone du
    // parent : il part quand même.
    assert.deepEqual(c.gh.creations, [501, 502, 503]);
    await c.jusquAu("cook.launched", 501);
    assert.deepEqual(c.ticket(501)?.card?.zone, ["runtime/src/rail.ts"]);
    assert.equal(c.ticket(30)?.state, "86");

    // Un ticket né d'un redécoupage ne se redécoupe pas : ce n'est plus offert.
    await c.jusquAu("pass.escalated", 501);
    assert.match(c.jugements().at(-1)?.args[1] ?? "", /Redécouper n'est pas possible.*Issue #501/s);
    assert.equal(c.faits("manager.split").length, 1);
  });

  test("un redécoupage que le LLM ne sait pas faire vaut remontée, sans rien créer", async (t) => {
    const c = echec(t, { issues: [issue(17)], manager: { suite: ["reagit-redecoupe", "decoupe-question"] } });
    await c.jusquAu("pass.escalated", 17);

    assert.deepEqual(c.charges("manager.reacted", 17).map((reaction) => reaction.choice), ["retry", "split", "escalate"]);
    assert.match(String(c.charges("manager.reacted", 17).at(-1)?.reason), /redécoupage est impossible.*Plus rapide/s);
    assert.deepEqual([c.gh.creations, c.pass(17)?.cause, c.ticket(17)?.reason], [[], "manager-escalated", "manager:escalated"]);
  });

  test("le disjoncteur garde le dernier mot : des relances du manager restées rouges l'ouvrent, et il remonte sans plus rien relancer ni juger", async (t) => {
    const c = echec(t, {
      seuilDisjoncteur: 2,
      issues: [issue(30, [])],
      manager: { suite: ["juge-ticket"], jugement: "reagit-monte", plafond: { model: "opus", effort: "high" } },
    });
    await c.jusquAu("pass.escalated", 30);

    // Les deux relances décidées par le manager sont marquées, et jugées rouges.
    assert.deepEqual(c.charges("cook.launched", 30).filter((lance) => lance.station === STATION).map((lance) => lance.relaunch === true), [false, false, false, true, true]);
    assert.deepEqual(c.charges("relaunch.judged", 30).map((juge) => juge.verdict), ["red", "red"]);
    assert.notEqual(etatDesGardeFous(c.journal.base).breakerOpenedAt, null);
    // Il lui restait de quoi monter — `opus` —, et il ne l'a pas fait.
    assert.deepEqual(c.calibrages(30), ["haiku/low", "haiku/low", "haiku/medium", "haiku/high", "sonnet/high"]);
    const reaction = c.charges("manager.reacted", 30).at(-1);
    assert.deepEqual([reaction?.choice, reaction?.run], ["escalate", null]);
    assert.match(String(reaction?.reason), /disjoncteur/);
    assert.equal(c.jugements().length, 3);
    assert.deepEqual([c.ticket(30)?.state, c.ticket(30)?.reason], ["86", "manager:escalated"]);
  });

  test("éteint pendant qu'il tenait un ticket, le manager le rend à la pass, qui reprend sa règle d'avant", async (t) => {
    const c = echec(t, { issues: [issue(17)] });
    // Sa réaction ne peut pas se dire : le ticket reste entre ses mains.
    c.gh.pannes.commentaire = true;
    await c.jusquAu("manager.reacted", 17);
    assert.equal(c.pass(17)?.phase, "deferred");

    chef(c.repertoire, "manager.disabled");
    await c.jusquAu("pass.escalated", 17);

    assert.deepEqual(c.faits("pass.returned", 17).map((e) => [e.author, (e.payload as Charge).n]), [["pass", 1], ["pass", 2]]);
    assert.equal(c.pass(17)?.cause, "returns-exhausted");
    assert.equal(c.faits("manager.reaction-commented", 17).length, 0);
  });

  test("une montée que GitHub refuse ne relance rien et ne se redécide pas : elle reprend où elle en était", async (t) => {
    const c = echec(t, { issues: [issue(30, [])], manager: { suite: ["juge-ticket"], plafond: { model: "sonnet", effort: "medium" } } });
    await c.jusquAu("manager.labeled", 30);
    c.gh.pannes.label = true;
    await c.jusquAu("manager.reacted", 30);
    await jusqua(() => c.avertissements.filter((ligne) => /réaction du manager interrompue sur le ticket #30/.test(ligne)).length >= 2);

    // Le ticket attend, entre les mains du manager : aucun cook n'est reparti à l'ancien calibrage.
    assert.deepEqual([c.pass(30)?.phase, c.faits("pass.returned", 30).length, c.calibrages(30).length], ["deferred", 1, 2]);

    c.gh.pannes.label = false;
    await c.jusquAu("pass.returned", 30, 2);
    await jusqua(() => c.calibrages(30).length === 3);

    assert.deepEqual(c.calibrages(30).at(-1), "haiku/medium");
    assert.deepEqual([c.charges("manager.reacted", 30).filter((reaction) => reaction.returns === 1).length, c.faits("manager.raised", 30).length, c.dits(30).filter((dit) => /second renvoi/.test(dit)).length], [1, 1, 1]);
  });

  test("le chef recalibre pendant que le manager tient le ticket : son label reste, et le ticket repart à son calibrage", async (t) => {
    const c = echec(t, { issues: [issue(30, [])], manager: { suite: ["juge-ticket"], plafond: { model: "sonnet", effort: "medium" } } });
    await c.jusquAu("manager.labeled", 30);
    c.gh.pannes.label = true;
    await c.jusquAu("manager.reacted", 30);
    // Le chef remplace l'effort que le manager s'apprêtait à monter.
    c.gh.poser(issue(30, ["fire", "model:haiku", "effort:high"], { updatedAt: "2026-10-08T09:45:00Z" }));
    c.gh.pannes.label = false;
    await jusqua(() => c.calibrages(30).length === 3);

    assert.deepEqual(c.labels(30), ["fire", "model:haiku", "effort:high"]);
    assert.deepEqual(c.gh.delabellisations, []);
    assert.deepEqual(c.charges("manager.raised", 30), [{ added: [], removed: [] }]);
    assert.equal(c.calibrages(30).at(-1), "haiku/high");
    // Ni l'issue ni le journal ne décrivent une montée qui n'a pas eu lieu.
    assert.equal(reactionDe(c.journal.base, 30)?.applied, false);
    assert.ok(!c.dits(30).some((dit) => /calibrage monté/.test(dit)));
    assert.ok(c.dits(30).some((dit) => /second renvoi à ton calibrage \(`haiku` \/ `high`\).*`effort:low` n'y est plus/s.test(dit)));
  });

  test("une montée faite sur GitHub mais dont la note s'est perdue n'est ni refaite ni reniée : le label reste au manager, qui peut monter encore", async (t) => {
    const c = echec(t, { issues: [issue(30, [])], manager: { suite: ["juge-ticket", "reagit-monte"], plafond: { model: "sonnet", effort: "medium" } } });
    // Le label est retiré, et la réponse se perd : rien n'est noté de l'échange.
    c.gh.pannes.apresRetrait = true;
    await c.jusquAu("pass.escalated", 30);

    assert.deepEqual(c.charges("manager.raised", 30)[0], { added: ["effort:medium"], removed: ["effort:low"] });
    assert.deepEqual(c.gh.delabellisations.filter(([, label]) => label === "effort:low").length, 1);
    assert.ok(c.dits(30).some((dit) => /second renvoi : calibrage monté de `haiku` \/ `low` à `haiku` \/ `medium`/.test(dit)));
    // `effort:medium` est bien à lui : la montée suivante n'est pas refusée au nom du chef.
    assert.deepEqual(c.calibrages(30), ["haiku/low", "haiku/low", "haiku/medium", "sonnet/medium"]);
    assert.ok(!c.charges("manager.reacted", 30).some((reaction) => /posé par le chef/.test(String(reaction.reason))));
  });

  test("éteint pendant le redécoupage, le manager n'en garde rien : aucun sous-ticket ne naîtra derrière un parent qui tient sa zone", async (t) => {
    const c = echec(t, { issues: [issue(17)], manager: { suite: ["reagit-redecoupe", "decoupe-tickets-lent"] } });
    // Le choix est fait, le découpage est en cours.
    await jusqua(() => c.jugements().length === 2);
    chef(c.repertoire, "manager.disabled");
    await c.jusquAu("pass.escalated", 17);

    // La pass a repris sa règle : le ticket est remonté, et tient sa zone.
    assert.deepEqual([c.pass(17)?.cause, c.ticket(17)?.reason], ["returns-exhausted", "pass:still-red"]);
    assert.equal(c.faits("manager.split").length, 0);

    chef(c.repertoire, "manager.enabled");
    const depart = c.gh.sondages.ouvertes;
    await jusqua(() => c.gh.sondages.ouvertes >= depart + 3);
    assert.deepEqual([c.gh.creations, c.faits("manager.split").length], [[], 0]);
  });

  test("une remontée que GitHub empêche de dire est faite quand même, et dite dès qu'il répond", async (t) => {
    const c = echec(t, { issues: [issue(17)] });
    await c.jusquAu("pass.returned", 17, 2);
    c.gh.pannes.commentaire = true;
    await c.jusquAu("pass.escalated", 17);

    assert.deepEqual([c.ticket(17)?.state, c.ticket(17)?.reason], ["86", "manager:escalated"]);
    assert.ok(!c.dits(17).some((dit) => /remontée au chef/.test(dit)));

    c.gh.pannes.commentaire = false;
    await jusqua(() => c.dits(17).some((dit) => /remontée au chef/.test(dit)));
    await jusqua(() => reactionDe(c.journal.base, 17)?.commented === true);
    assert.equal(c.dits(17).filter((dit) => /remontée au chef/.test(dit)).length, 1);
  });

  test("une remontée que GitHub empêche de dire, puis dont le chef ferme la PR : le mot du manager est dit quand même", async (t) => {
    const c = echec(t, { issues: [issue(17)] });
    await c.jusquAu("pass.returned", 17, 2);
    c.gh.pannes.commentaire = true;
    await c.jusquAu("pass.escalated", 17);
    for (const pr of c.gh.ouvertes.values()) pr.state = "closed";
    await c.jusquAu("pass.pr-closed", 17);

    assert.deepEqual([c.pass(17)?.phase, c.pass(17)?.reason, c.pass(17)?.cause], ["closed", "still-red", "manager-escalated"]);
    assert.ok(!c.dits(17).some((dit) => /remontée au chef/.test(dit)));

    c.gh.pannes.commentaire = false;
    await jusqua(() => reactionDe(c.journal.base, 17)?.commented === true);
    assert.equal(c.dits(17).filter((dit) => /remontée au chef/.test(dit)).length, 1);
  });

  test("la réaction en cours se relit dans le journal : le chef y lit le choix et son motif", async (t) => {
    const c = echec(t, { issues: [issue(17)] });
    // Le ticket est 86 d'abord, le commentaire suit : il ne dit rien qui n'ait eu lieu.
    await jusqua(() => reactionDe(c.journal.base, 17)?.choice === "escalate" && reactionDe(c.journal.base, 17)?.commented === true);

    const reaction = reactionDe(c.journal.base, 17);
    assert.deepEqual(
      [reaction?.choice, reaction?.returns, reaction?.reason, reaction?.proposal, reaction?.commented],
      ["escalate", 2, "Le critère d'acceptation n° 2 se contredit.", "Trancher le critère n° 2, puis rendre le ticket.", true],
    );
  });
});
