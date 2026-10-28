// Une base rouge se traite seule : la pass rejoue d'abord ses gates, une fois.
// Un rouge passager tombe ainsi, sans rien ouvrir. Un rouge qui tient fait
// naître un ticket de réparation qui nomme ce qui échoue et la base, passe
// devant tout le rail, et part dans une station alors que la base est encore
// rouge — sans que le chef le demande. Un seul à la fois.
import assert from "node:assert/strict";
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { describe, test, type TestContext } from "node:test";
import { decrireEtat, lireEtat } from "../src/etat.ts";
import type { Fait } from "../src/evenements.ts";
import type { Issue } from "../src/github.ts";
import { ouvrirJournal } from "../src/journal.ts";
import { etatDeLaBase, pass, reparationDeLaBase, reparationEnCours } from "../src/projections/pass.ts";
import { lireRail, rail } from "../src/projections/rail.ts";
import { posixOnly } from "./support/plateforme.ts";
import { chef, controlerBase, cuisine, issue } from "./aides/cuisine.ts";
import { BASE, horloge, jusqua, repertoireTemporaire } from "./outils.ts";

type Scenario = "vert" | "rouge";

// Une cuisine sous grant dont la base est celle du test (`base.tete`), et dont
// les gates de la base seule jouent `essais.base` — vertes, sauf scénario.
// `avantEssai` : ce qu'un essai de la base attend avant de jouer ses gates.
function service(t: TestContext, options: { issues?: Issue[]; scenario?: string; essais?: Record<string, Scenario>; avantEssai?: (nom: string) => Promise<void> } = {}) {
  const base = { tete: "base-1" };
  const essais: Record<string, Scenario> = { ...options.essais };
  const lieu = cuisine(t, {
    pass: true,
    issues: options.issues ?? [],
    scenario: options.scenario,
    depot: (depot) => ({
      ...depot,
      rapatrier: async () => base.tete,
      async essayer(nom) {
        await options.avantEssai?.(nom);
        const essai = await depot.essayer(nom);
        writeFileSync(join(essai, ".claude/brigade/scenario-gates"), essais[nom] ?? "vert");
        return essai;
      },
    }),
  });
  chef(lieu.repertoire, "grant.activated");
  const { journal } = lieu;
  const compter = (type: string) => journal.tout().filter((e) => e.type === type).length;
  const jusquAu = (type: string, combien = 1) => jusqua(() => compter(type) >= combien);
  const laisserTourner = () => jusquAu("runtime.ticked", compter("runtime.ticked") + 5);
  const lance = (ticket: number) => lieu.dernier("cook.launched", ticket) !== undefined;
  // La pass vient de voir la base rouge, sur sa tête : ce qu'un contrôle joué aurait écrit.
  const rougir = () => controlerBase(lieu.repertoire, "red", base.tete);
  return { ...lieu, base, essais, compter, jusquAu, laisserTourner, lance, rougir };
}

describe("une base rouge : rejeu automatique, puis ticket de réparation", { concurrency: 8 }, () => {
  test("rouge puis verte au rejeu : la pass rejoue seule, aucun ticket de réparation n'est ouvert, et la cuisine reprend le travail", async (t) => {
    // Le rejeu attend que le test ait vu la station retenue par la base.
    let rejouer = () => {};
    const retenu = new Promise<void>((resoudre) => (rejouer = resoudre));
    const { journal, gh, gates, avertissements, dernier, compter, jusquAu, laisserTourner, lance, rougir } = service(t, {
      avantEssai: (nom) => (nom === "base" ? retenu : Promise.resolve()),
    });
    rougir();
    gh.poser(issue(18));
    await jusqua(() => dernier("station.held")?.reason === "base");
    assert.equal(lance(18), false);

    // Personne n'a rien demandé : la pass demande elle-même le rejeu, et le joue.
    rejouer();
    await jusquAu("base.checked", 2);
    const demandes = journal.tout().filter((e) => e.type === "base.recheck-requested");
    assert.deepEqual(demandes.map((e) => e.author), ["pass"]);
    assert.deepEqual([dernier("base.checked")?.sha, dernier("base.checked")?.outcome, etatDeLaBase(journal.base)?.outcome], ["base-1", "green", "green"]);
    // Seules les gates de la base seule comptent : la cuisine a repris, et le
    // ticket 18, parti et livré entre-temps, peut déjà avoir eu les siennes.
    assert.deepEqual(gates.appels().filter((worktree) => /[\\/]\.essais[\\/]base$/.test(worktree)).length, 1);
    assert.match(avertissements.join("\n"), /v2 n'est plus rouge \(base-1\)/);

    // La cuisine reprend : le ticket qui attendait part.
    await jusqua(() => lance(18));
    await laisserTourner();
    assert.deepEqual([gh.creations, compter("base.repair-opening"), compter("base.repair-opened"), reparationDeLaBase(journal.base)], [[], 0, 0, null]);
    assert.equal(compter("base.recheck-requested"), 1);
  });

  test("rouge qui reste rouge après le rejeu : un ticket de réparation est ouvert, qui nomme ce qui échoue et la base — calibré, `fire`, et `prio:0`", async (t) => {
    const { journal, gh, avertissements, dernier, jusquAu, rougir } = service(t, { essais: { base: "rouge" } });
    rougir();
    await jusquAu("base.repair-opened");

    // Le rejeu a eu lieu, demandé par la pass, et il est resté rouge.
    const types = journal.tout().map((e) => e.type).filter((type) => type.startsWith("base."));
    assert.deepEqual(types, ["base.checked", "base.recheck-requested", "base.checked", "base.repair-opening", "base.repair-opened"]);
    assert.equal(journal.tout().find((e) => e.type === "base.recheck-requested")?.author, "pass");

    assert.deepEqual(gh.creations, [501]);
    const ouverte = gh.lire(501);
    assert.deepEqual(ouverte?.labels, ["fire", "prio:0", "model:opus", "effort:high"]);
    assert.equal(ouverte?.title, "Réparer la base `v2`, rouge sur base-1 : tests du projet en échec");
    const corps = gh.corpsDe(501);
    assert.match(corps, /^<!-- brigade:reparation-base base-1 -->/);
    assert.match(corps, /La base d'intégration `v2` est rouge depuis [^,]+, sur `base-1`/);
    assert.match(corps, /## Ce qui échoue\n\n- tests du projet en échec\n/);
    assert.match(corps, /Gates rouges : `\.claude\/brigade\/gates\.sh` est sorti en 1\.\nFAIL {2}tests du projet en échec/);

    const ouvert = journal.tout().find((e) => e.type === "base.repair-opened");
    assert.deepEqual([ouvert?.ticket, ouvert?.author, ouvert?.payload], [501, "pass", { sha: "base-1", failures: ["tests du projet en échec"], reconciled: false }]);
    const reparation = reparationDeLaBase(journal.base);
    assert.deepEqual(
      [reparation?.ticket, reparation?.sha, reparation?.redSince, reparation?.failures, reparation?.etat],
      [501, "base-1", etatDeLaBase(journal.base)?.redSince, ["tests du projet en échec"], "en-cours"],
    );
    assert.match(avertissements.join("\n"), /v2 reste ROUGE \(base-1\) : rejouées une fois d'elles-mêmes, ses gates ne passent toujours pas/);
    assert.match(avertissements.join("\n"), /v2 reste ROUGE après son rejeu \(base-1\) — ticket de réparation #501 ouvert/);
    assert.equal(dernier("base.checked")?.outcome, "red");
  });

  test("le ticket de réparation passe devant tous les tickets en attente et part dans une station alors que la base est encore rouge, sans commande du chef — puis il est jugé et mergé malgré elle, et la cuisine repart", { skip: posixOnly("waits for a process or timing fact that the Windows runner does not meet in time (a `jusqua` that never completes there); cause not traced, listed in #1868") }, async (t) => {
    const { journal, gh, base, essais, dernier, jusquAu, laisserTourner, lance, rougir, runtime } = service(t, { essais: { base: "rouge" } });
    rougir();
    // Des tickets attendent, dont un en `prio:1` : la base rouge les retient tous.
    gh.poser(issue(17, ["fire", "model:sonnet", "effort:low", "prio:1"]));
    gh.poser(issue(18));
    await jusqua(() => runtime.rail.tickets().length === 2 && dernier("station.held")?.reason === "base");

    await jusquAu("base.repair-opened");
    // Sur le rail, il passe devant : `prio:0`.
    await jusqua(() => runtime.rail.tickets().some((ticket) => ticket.ticket === 501));
    assert.deepEqual(lireRail(journal.base).map((ticket) => [ticket.ticket, ticket.priority]), [[501, 0], [17, 1], [18, null]]);

    // Il part, la base toujours rouge ; aucun autre ne part.
    await jusqua(() => lance(501));
    const lancement = journal.tout().find((e) => e.type === "cook.launched" && e.ticket === 501);
    const rougeAuLancement = journal.tout().findLast((e) => e.type === "base.checked" && e.seq < (lancement?.seq ?? 0));
    assert.equal(rougeAuLancement?.type === "base.checked" && rougeAuLancement.payload.outcome, "red");
    assert.equal(etatDeLaBase(journal.base)?.outcome, "red");
    assert.equal(journal.tout().some((e) => ["kitchen.resumed", "base.recheck-requested"].includes(e.type) && e.author === "chef"), false);
    assert.deepEqual([lance(17), lance(18)], [false, false]);

    // Sa livraison est jugée fusionnée avec la base rouge, verte, et mergée sous grant.
    await jusqua(() => dernier("merge.done", 501) !== undefined);
    assert.deepEqual([dernier("pass.judged", 501)?.verdict, dernier("pass.judged", 501)?.base], ["green", "base-1"]);
    assert.equal(journal.duTicket(501).some((e) => e.type === "pass.waiting"), false);
    await laisserTourner();
    assert.deepEqual([lance(17), lance(18), reparationDeLaBase(journal.base)?.etat], [false, false, "servie"]);

    // Le merge fait bouger la base : rejouée, elle est verte, et la cuisine repart — `prio:1` d'abord.
    essais.base = "vert";
    base.tete = "base-2";
    await jusqua(() => lance(17));
    assert.equal(etatDeLaBase(journal.base)?.outcome, "green");
    assert.deepEqual(gh.creations, [501]);
  });

  test("une réparation mergée qui laisse la base rouge met une ligne dans le bloc `awaiting` ; la base revenue au vert, la ligne en sort et la cuisine relance seule les tickets retenus", { skip: posixOnly("waits for a process or timing fact that the Windows runner does not meet in time (a `jusqua` that never completes there); cause not traced, listed in #1868") }, async (t) => {
    const { journal, gh, base, essais, dernier, jusquAu, laisserTourner, lance, rougir } = service(t, { essais: { base: "rouge" } });
    const ligneDeLaBase = () => {
      const lignes = decrireEtat(lireEtat(journal, new Date()), new Date());
      return lignes.slice(lignes.findIndex((ligne) => ligne.startsWith("awaiting")), lignes.indexOf("end awaiting")).filter((ligne) => ligne.startsWith("  base  "));
    };
    rougir();
    gh.poser(issue(18));
    await jusquAu("base.repair-opened");
    // Elle travaille : rien n'attend le chef.
    assert.deepEqual(ligneDeLaBase(), []);
    await jusqua(() => dernier("merge.done", 501) !== undefined);
    await laisserTourner();
    assert.deepEqual(ligneDeLaBase(), []);

    // Le merge fait bouger la base, qui reste rouge : la réparation a échoué, la base attend le chef.
    base.tete = "base-2";
    await jusqua(() => reparationDeLaBase(journal.base)?.etat === "echouee");
    const [ligne] = ligneDeLaBase();
    assert.match(ligne ?? "", /^ {2}base {2}for .+? {2}BASE RED on base-2, failing: tests du projet en échec — its repair #501 merged, did not bring it back to green — to repair: fix the base by hand; .*`brigade <projet> base replay`$/);
    await laisserTourner();
    assert.deepEqual([lance(18), gh.creations], [false, [501]]);

    // Corrigée à la main : verte, la ligne sort du bloc et le ticket retenu part, sans commande du chef.
    essais.base = "vert";
    base.tete = "base-3";
    await jusqua(() => lance(18));
    assert.equal(etatDeLaBase(journal.base)?.outcome, "green");
    assert.deepEqual(ligneDeLaBase(), []);
    assert.equal(journal.tout().some((e) => e.author === "chef" && e.type !== "grant.activated"), false);
  });

  test("tant que le premier ticket de réparation est en cours, aucun second n'est ouvert — ni quand la base bouge en restant rouge, ni au rejeu demandé par le chef", async (t) => {
    const { journal, repertoire, gh, base, compter, jusquAu, laisserTourner, lance, rougir } = service(t, { essais: { base: "rouge" }, scenario: "commite-puis-attend" });
    rougir();
    await jusquAu("base.repair-opened");
    await jusqua(() => lance(501));

    // La base bouge, toujours rouge : rejouée, elle le reste.
    base.tete = "base-2";
    await jusqua(() => journal.tout().some((e) => e.type === "base.checked" && e.payload.sha === "base-2"));
    // Le chef la fait rejouer : rouge encore.
    const avant = compter("base.checked");
    chef(repertoire, "base.recheck-requested");
    await jusquAu("base.checked", avant + 1);
    await laisserTourner();

    assert.deepEqual([gh.creations, compter("base.repair-opening"), compter("base.repair-opened")], [[501], 1, 1]);
    assert.deepEqual([reparationEnCours(journal.base), reparationDeLaBase(journal.base)?.etat, etatDeLaBase(journal.base)?.outcome], [501, "en-cours", "red"]);
    // Un rejeu de la pass vaut pour tout le rouge : elle ne le redemande pas.
    assert.equal(journal.tout().filter((e) => e.type === "base.recheck-requested" && e.author === "pass").length, 1);
  });

  // Le cook de la réparation n'a rien livré (`attend`) : c'est le chef qui corrige la base, par une PR
  // `Closes #501` — GitHub ferme l'issue du ticket.
  const fermerParUnMerge = (gh: ReturnType<typeof service>["gh"], base: string | null) => {
    const connue = gh.lire(501);
    if (connue === undefined) throw new Error("la réparation 501 n'existe pas");
    if (base !== null) gh.fermeesParUnMerge.set(501, { number: 9, url: "https://github.com/o/r/pull/9", base, sha: "correctif", state: "closed", merged: true, enRetard: false, mergeePar: "chef" });
    gh.poser({ ...connue, state: "closed", updatedAt: "2026-10-08T11:00:00.000Z" });
  };
  const ligneDeLaBase = (journal: ReturnType<typeof service>["journal"]) => {
    const lignes = decrireEtat(lireEtat(journal, new Date()), new Date());
    return lignes.slice(lignes.findIndex((ligne) => ligne.startsWith("awaiting")), lignes.indexOf("end awaiting")).filter((ligne) => ligne.startsWith("  base  "));
  };

  test("une réparation fermée par la PR mergée qui corrige la base n'a pas « quitté le rail sans être servie » : elle est servie, la base est contrôlée sur la tête où le merge l'a laissée, et verte, la cuisine repart seule", { skip: posixOnly("waits for a process or timing fact that the Windows runner does not meet in time (a `jusqua` that never completes there); cause not traced, listed in #1868") }, async (t) => {
    const { journal, gh, base, essais, jusquAu, laisserTourner, lance, rougir } = service(t, { essais: { base: "rouge" }, scenario: "attend" });
    rougir();
    gh.poser(issue(18));
    await jusquAu("base.repair-opened");
    await jusqua(() => lance(501));

    // Le merge fait bouger la base, qui reste rouge pour une autre raison : le ticket est servi, mais n'a pas réparé.
    base.tete = "base-2";
    fermerParUnMerge(gh, BASE);
    await jusqua(() => reparationDeLaBase(journal.base)?.echec === "rouge-apres-merge");
    assert.equal(journal.tout().findLast((e) => e.type === "base.checked")?.payload.sha, "base-2");
    const [ligne] = ligneDeLaBase(journal);
    assert.match(ligne ?? "", /its repair #501 merged, did not bring it back to green/);
    assert.doesNotMatch(ligne ?? "", /left the rail/);

    // Verte sur la tête suivante : le blocage se lève sans geste du chef et sans rouvrir le ticket.
    essais.base = "vert";
    base.tete = "base-3";
    await jusqua(() => lance(18));
    await laisserTourner();
    assert.deepEqual([etatDeLaBase(journal.base)?.outcome, reparationDeLaBase(journal.base)?.etat, ligneDeLaBase(journal)], ["green", "servie", []]);
    assert.equal(gh.lire(501)?.state, "closed");
    assert.equal(journal.tout().some((e) => e.author === "chef" && e.type !== "grant.activated"), false);
    assert.deepEqual(gh.creations, [501]);
  });

  test("une réparation dont la base est verte sur la tête mergée lève le blocage sans geste du chef ni rouvrir le ticket", async (t) => {
    const { journal, gh, base, essais, jusquAu, lance, rougir } = service(t, { essais: { base: "rouge" }, scenario: "attend" });
    rougir();
    gh.poser(issue(18));
    await jusquAu("base.repair-opened");
    await jusqua(() => lance(501));

    essais.base = "vert";
    base.tete = "base-2";
    fermerParUnMerge(gh, BASE);
    await jusqua(() => lance(18));
    await jusqua(() => reparationDeLaBase(journal.base)?.etat === "servie");
    const verte = journal.tout().findLast((e) => e.type === "base.checked");
    assert.deepEqual([verte?.payload.sha, verte?.payload.outcome, reparationDeLaBase(journal.base)?.etat, ligneDeLaBase(journal)], ["base-2", "green", "servie", []]);
    assert.equal(gh.lire(501)?.state, "closed");
  });

  test("une réparation fermée sans aucun merge qui l'ait fermée garde « left the rail without being served » : la base reste rouge", async (t) => {
    const { journal, gh, base, laisserTourner, jusquAu, lance, rougir } = service(t, { essais: { base: "rouge" }, scenario: "attend" });
    rougir();
    await jusquAu("base.repair-opened");
    await jusqua(() => lance(501));

    base.tete = "base-2";
    fermerParUnMerge(gh, null);
    await jusqua(() => reparationDeLaBase(journal.base)?.echec === "partie");
    await laisserTourner();
    const [ligne] = ligneDeLaBase(journal);
    assert.match(ligne ?? "", /its repair #501 left the rail without being served/);
    assert.deepEqual([reparationDeLaBase(journal.base)?.echec, etatDeLaBase(journal.base)?.outcome], ["partie", "red"]);
  });

  test("une création dont la réponse se perd n'ouvre pas une seconde issue : au tick suivant, la pass retrouve la sienne par sa marque", async (t) => {
    const { journal, gh, avertissements, jusquAu, laisserTourner, lance, rougir } = service(t, { essais: { base: "rouge" } });
    gh.pannes.apresCreation = true;
    rougir();
    await jusquAu("base.repair-opened");
    await laisserTourner();

    assert.deepEqual(gh.creations, [501]);
    const ouvert = journal.tout().filter((e) => e.type === "base.repair-opened");
    assert.deepEqual(ouvert.map((e) => [e.ticket, e.payload.reconciled]), [[501, true]]);
    assert.equal(avertissements.filter((ligne) => /ticket de réparation n'a pas pu être ouvert — gh api : délai dépassé/.test(ligne)).length, 1);
    await jusqua(() => lance(501));
  });
});

// Ce que la projection dit d'une réparation, d'un fait à l'autre — avec le
// rail, dont elle lit le sort du ticket.
test("une réparation est en cours jusqu'à son service ; elle a échoué si elle quitte le rail sans être servie, ou si la base reste rouge après son merge — et un rouge neuf repart sans rejeu", (t) => {
  const journal = ouvrirJournal(repertoireTemporaire(t), { maintenant: horloge(), projections: [rail, pass] });
  t.after(() => journal.fermer());
  const noter = (fait: Fait, ticket: number | null = null, author = "pass") => journal.ajouter({ project: "brigade", ticket, author, ...fait });
  const ROUGES = { outcome: "red" as const, code: 1, failures: ["FAIL  tests du projet en échec"], tail: "" };
  const VERTES = { outcome: "green" as const, code: 0, failures: [], tail: "" };
  const controler = (sha: string, outcome: "red" | "green") => noter({ type: "base.checked", payload: { sha, outcome, gates: outcome === "red" ? ROUGES : VERTES, tickets: [] } });
  const arriver = (ticket: number) =>
    noter({ type: "ticket.arrived", payload: { title: `Ticket ${ticket}`, priority: 0, createdAt: "2026-10-08T10:00:00Z", url: `https://github.com/o/r/issues/${ticket}` } }, ticket, "github");
  const { base } = journal;
  const etat = () => reparationDeLaBase(base)?.etat;

  assert.equal(reparationDeLaBase(base), null);
  const rouge = controler("base-1", "red");
  noter({ type: "base.recheck-requested", payload: {} });
  assert.equal(etatDeLaBase(base)?.recheck?.by, "pass");
  controler("base-1", "red");
  noter({ type: "base.repair-opening", payload: { sha: "base-1" } });
  noter({ type: "base.repair-opened", payload: { sha: "base-1", failures: ["tests du projet en échec"], reconciled: false } }, 501);
  // Avant même d'être sur le rail, elle est en cours : c'est elle qui part de la base rouge.
  assert.deepEqual([etat(), reparationEnCours(base), reparationDeLaBase(base)?.redSince], ["en-cours", 501, rouge?.at]);
  arriver(501);
  assert.equal(reparationEnCours(base), 501);

  // Mergée : servie, tant que la base n'a pas été recontrôlée.
  noter({ type: "merge.done", payload: { pr: "https://github.com/o/r/pull/9", sha: "abc", by: "pass", reconciled: false } }, 501);
  assert.deepEqual([etat(), reparationEnCours(base)], ["servie", null]);
  // Recontrôlée rouge après son merge : elle n'a pas réparé.
  controler("base-2", "red");
  assert.equal(etat(), "echouee");

  // Un rouge qui tombe, puis un rouge neuf : il n'a pas encore été rejoué, et repart de un.
  controler("base-3", "green");
  assert.equal(etat(), "servie");
  controler("base-4", "red");
  assert.deepEqual([etatDeLaBase(base)?.recheck, etatDeLaBase(base)?.redSince === rouge?.at], [null, false]);

  // Une seconde réparation, qui quitte le rail sans être servie : échouée.
  noter({ type: "base.recheck-requested", payload: {} }, null, "chef");
  assert.equal(etatDeLaBase(base)?.recheck?.by, "chef");
  controler("base-4", "red");
  noter({ type: "base.repair-opened", payload: { sha: "base-4", failures: ["tests du projet en échec"], reconciled: false } }, 502);
  arriver(502);
  assert.equal(reparationEnCours(base), 502);
  noter({ type: "ticket.left", payload: { reason: "closed" } }, 502, "github");
  assert.deepEqual([etat(), reparationEnCours(base)], ["echouee", null]);
});
