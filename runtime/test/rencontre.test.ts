// La rencontre : ce que la pass fait d'une livraison verte quand la base a
// avancé sous elle, et ce qu'elle fait de la base une fois mergé ce que rien
// n'avait vérifié ensemble. La base est celle du faux dépôt, que chaque test
// fait avancer à la main.
import assert from "node:assert/strict";
import { existsSync, mkdirSync, renameSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { describe, test, type TestContext } from "node:test";
import { ouvrirDepot, type Depot } from "../src/depot.ts";
import type { Machine } from "../src/machine.ts";
import { controleRetenu, etatDeLaBase, mergesAVerifier, passDuTicket } from "../src/projections/pass.ts";
import { chef, cuisine, issue, MACHINE_CALME, type Options } from "./aides/cuisine.ts";
import { BASE, depotGit, ENV_GIT, jusqua, repertoireTemporaire } from "./outils.ts";

// `impossible` : le worktree jetable ne se fait pas — le dépôt lève, comme le
// vrai (`git worktree add` raté), et les gates ne sont pas jouées.
const PANNE_DE_WORKTREE = "git worktree : fatal: could not create leading directories of '.essais/base'";
type Scenario = "vert" | "rouge" | "lent" | "impossible";

// Une cuisine sous grant, un ticket livré (`travail.txt`), et une base qui a
// avancé de deux commits depuis son départ. `recus` : ce qu'elle a reçu.
// `essais` : ce que disent les gates dans un worktree jetable, par son nom —
// celles du worktree du cook restent vertes.
function service(
  t: TestContext,
  recus: string[],
  options: Omit<Options, "depot"> & {
    essais?: Record<string, Scenario>;
    conflit?: boolean;
    panne?: string;
    // Ce qu'un essai attend avant de jouer ses gates, par son nom.
    avantEssai?: (nom: string) => Promise<void>;
    depot?: (depot: Depot) => Partial<Depot>;
  } = {},
) {
  const base = { tete: "base-1" };
  const essais: Record<string, Scenario> = { ...options.essais };
  const lieu = cuisine(t, {
    pass: true,
    issues: [issue(17)],
    ...options,
    depot: (depot): Depot => ({
      ...depot,
      rapatrier: async () => base.tete,
      retard: () => ({ depart: "base-0", commits: 2 }),
      arrives: () => recus,
      async essayer(nom, sha) {
        if (options.conflit) return null;
        if (options.panne) throw new Error(options.panne);
        await options.avantEssai?.(nom);
        if (essais[nom] === "impossible") throw new Error(PANNE_DE_WORKTREE);
        const essai = await depot.essayer(nom, sha);
        // Le scénario d'un essai est écrit dans son worktree jetable, pas dans
        // celui que partagent tous les worktrees : la livraison qu'un cook
        // fait juger juste après ne doit pas en hériter.
        if (essai !== null) writeFileSync(join(essai, ".claude/brigade/scenario-gates"), essais[nom] ?? "vert");
        return essai;
      },
      ...options.depot?.(depot),
    }),
  });
  if (!options.lieux) chef(lieu.repertoire, "grant.activated");
  const { journal, repertoire } = lieu;
  const compter = (type: string) => journal.tout().filter((e) => e.type === type).length;
  const jusquAu = (type: string, combien = 1) => jusqua(() => compter(type) >= combien);
  const laisserTourner = () => jusquAu("runtime.ticked", compter("runtime.ticked") + 3);
  const histoire = (ticket = 17) =>
    journal
      .duTicket(ticket)
      .map((e) => e.type)
      .filter((type) => /^(pass\.(judged|base-moved|replayed|outdated|waiting|returned|deferred|escalated)|grant|merge)\b/.test(type));
  const essai = (nom: string) => join(repertoire, "worktrees", ".essais", nom);
  const commentaires = (ticket = 17) => lieu.gh.commentaires.filter(([numero]) => numero === ticket).map(([, corps]) => corps).join("\n---\n");
  return { ...lieu, base, essais, compter, jusquAu, laisserTourner, histoire, essai, commentaires, pass: (ticket = 17) => passDuTicket(journal.base, ticket) };
}

// Une origine qui disparaît puis revient, sans réseau : le rapatriement est un
// vrai `git fetch` sur un vrai dépôt local, dont l'origine est déplacée. Elle
// ne bouge qu'entre deux rapatriements — jamais sous un `fetch` en cours.
function origineFragile(t: TestContext) {
  const { origine, clone } = depotGit(t);
  const depot = ouvrirDepot({ clone, base: BASE, worktrees: join(repertoireTemporaire(t), "worktrees"), env: ENV_GIT });
  const partie = `${origine}.partie`;
  const fragile = {
    presente: true,
    async rapatrier() {
      if (fragile.presente !== existsSync(origine)) renameSync(...((fragile.presente ? [partie, origine] : [origine, partie]) as [string, string]));
      await depot.rapatrier();
    },
  };
  return fragile;
}

// Chaque test a ses lieux : ils se jouent de front.
describe("la rencontre de deux livraisons", { concurrency: 8 }, () => {
  test("la base a avancé sur d'autres fichiers : la livraison est mergée sans rejeu, c'est dit au journal et sur l'issue, et les gates sont jouées sur la base après merge, hors ticket", async (t) => {
    // Un fichier que les deux touchent, mais commun : il n'appartient à personne, et ne se paie pas un rejeu.
    const { journal, gh, gates, dernier, histoire, jusquAu, essai, commentaires } = service(t, ["voisin.ts", "docs/runtime.md"], {
      communs: ["docs"],
      depot: () => ({ changes: () => ["docs/runtime.md", "travail.txt"] }),
    });
    await jusquAu("base.checked");

    assert.deepEqual(histoire(), ["pass.judged", "pass.base-moved", "grant.used", "merge.done"]);
    assert.deepEqual(dernier("pass.base-moved", 17), { sha: dernier("pass.judged", 17)?.sha, base: "base-1", from: "base-0", behind: 2, overlap: [], replay: false });
    assert.equal(dernier("merge.done", 17)?.unverified, true);
    assert.equal(gh.merges.length, 1);
    // Une suite pour la branche, une pour la base : aucune pour la rencontre.
    assert.deepEqual(gates.appels().slice(1), [essai("base")]);
    const controle = journal.tout().find((e) => e.type === "base.checked");
    assert.deepEqual([controle?.ticket, controle?.author], [null, "pass"]);
    assert.deepEqual(controle?.payload, { sha: "base-1", outcome: "green", gates: { outcome: "green", code: 0, failures: [], tail: "ok    tests du projet\ngates : VERT" }, tickets: [17] });
    assert.deepEqual([etatDeLaBase(journal.base)?.outcome, mergesAVerifier(journal.base)], ["green", []]);
    assert.equal(existsSync(essai("base")), false);
    await jusqua(() => /mergée sur `v2`/.test(commentaires()));
    assert.match(commentaires(), /`v2` avait avancé de 2 commits depuis le départ de cette branche, sans toucher à aucun de ses fichiers \(chemins communs mis à part\) : mergée sans rejouer les gates/);
  });

  test("la base a avancé sur les mêmes fichiers : les gates sont rejouées sur le résultat du merge, dans un worktree jetable ; vertes, la livraison est mergée, et la base n'a plus à être vérifiée", async (t) => {
    const { journal, gh, gates, dernier, histoire, compter, jusquAu, laisserTourner, essai, commentaires } = service(t, ["travail.txt", "voisin.ts"]);
    await jusquAu("merge.done");
    await laisserTourner();

    assert.deepEqual(histoire(), ["pass.judged", "pass.base-moved", "pass.replayed", "grant.used", "merge.done"]);
    assert.deepEqual([dernier("pass.base-moved", 17)?.overlap, dernier("pass.base-moved", 17)?.replay], [["travail.txt"], true]);
    const rejeu = dernier("pass.replayed", 17);
    assert.deepEqual([rejeu?.base, (rejeu?.gates as { outcome: string }).outcome, rejeu?.findings], ["base-1", "green", []]);
    assert.deepEqual(gates.appels().slice(1), [essai("rencontre-17")]);
    assert.equal(existsSync(essai("rencontre-17")), false);
    assert.deepEqual([gh.merges.length, compter("base.checked"), mergesAVerifier(journal.base), dernier("merge.done", 17)?.unverified], [1, 0, [], false]);
    await jusqua(() => /gates ont été rejouées sur le résultat du merge avant de merger, et elles sont vertes/.test(commentaires()));
  });

  test("vertes séparément, rouges ensemble : rien n'est mergé, la rencontre repart au cook comme un renvoi, avec la consigne de rebaser", async (t) => {
    const { gh, dernier, histoire, pass, jusquAu, essai, avertissements } = service(t, ["travail.txt"], { essais: { "rencontre-17": "rouge" }, scenario: "bavard", suite: ["livre"] });
    await jusquAu("pass.returned");

    assert.deepEqual(histoire(), ["pass.judged", "pass.base-moved", "pass.replayed", "pass.returned"]);
    assert.equal(dernier("pass.judged", 17)?.verdict, "green");
    const [finding] = dernier("pass.returned", 17)?.findings as string[];
    assert.match(String(finding), /^Rencontre avec `v2` : la branche est verte seule[\s\S]*`v2` a reçu 2 commits[\s\S]*\(`travail\.txt`\)[\s\S]*rebase ta branche sur `origin\/v2`[\s\S]*\nGates rouges : .*\nFAIL {2}tests du projet en échec/);
    assert.deepEqual([dernier("pass.returned", 17)?.n, pass()?.returns, pass()?.verdict], [1, 1, "red"]);
    assert.deepEqual(gh.merges, []);
    assert.equal(existsSync(essai("rencontre-17")), false);
    assert.match(avertissements.join("\n"), /pass rouge sur le ticket #17 — gates rouges sur le résultat du merge dans v2/);
  });

  test("un merge qui ne se fait plus dans le worktree jetable est un conflit : il repart au cook, sans gates", async (t) => {
    const { gh, gates, dernier, jusquAu } = service(t, ["travail.txt"], { conflit: true, scenario: "bavard", suite: ["livre"] });
    await jusquAu("pass.returned");

    assert.match(String((dernier("pass.returned", 17)?.findings as string[])[0]), /^Conflit avec `v2`/);
    assert.equal((dernier("pass.replayed", 17)?.gates as { outcome: string }).outcome, "skipped");
    assert.deepEqual([gates.appels().length, gh.merges.length], [1, 0]);
  });

  test("un rejeu qui ne peut pas se faire n'est pas un conflit : aucun cook n'est renvoyé, la panne remonte au chef avec son motif", async (t) => {
    const { gh, gates, dernier, histoire, pass, cooks, jusquAu, commentaires } = service(t, ["travail.txt"], { panne: "git merge : gpg failed to sign the data" });
    await jusquAu("pass.escalated");

    assert.deepEqual(histoire(), ["pass.judged", "pass.base-moved", "pass.escalated"]);
    assert.deepEqual([dernier("pass.escalated", 17), pass()?.returns, pass()?.verdict], [{ reason: "replay-failed" }, 0, "green"]);
    assert.deepEqual([cooks().length, gates.appels().length, gh.merges.length], [1, 1, 0]);
    await jusqua(() => /replay-failed/.test(commentaires()));
    assert.match(commentaires(), /n'a pas pu rejouer les gates sur le résultat du merge : git merge : gpg failed to sign the data\. Ce n'est ni un conflit ni un verdict/);
  });

  test("la rencontre casse la base malgré tout : c'est vu après merge et remonté, les merges sous grant s'arrêtent, les livraisons des cooks déjà partis attendent en le disant — et repartent seules quand la base est réparée", async (t) => {
    // Une base rouge retient la station : seuls des cooks partis avant le
    // verdict livrent dessus. Le contrôle de la base attend donc qu'ils aient livré.
    let controler = () => {};
    const livres = new Promise<void>((resoudre) => (controler = resoudre));
    const { journal, gh, base, essais, avertissements, dernier, histoire, pass, compter, jusquAu, laisserTourner, commentaires } = service(t, ["voisin.ts"], {
      cooks: 3,
      essais: { base: "rouge" },
      avantEssai: (nom) => (nom === "base" ? livres : Promise.resolve()),
    });
    await jusquAu("merge.done");
    gh.poser(issue(18));
    await jusqua(() => dernier("cook.reported", 18) !== undefined);
    gh.poser(issue(19));
    await jusqua(() => dernier("cook.reported", 19) !== undefined);
    controler();
    await jusquAu("base.checked");

    const controle = journal.tout().find((e) => e.type === "base.checked")?.payload;
    assert.deepEqual([controle?.outcome, controle?.tickets, (controle?.gates as { failures: string[] }).failures], ["red", [17], ["FAIL  tests du projet en échec"]]);
    assert.match(avertissements.join("\n"), /v2 est ROUGE après merge \(base-1 — merges à vérifier : #17\) — les merges sous grant sont suspendus/);
    await jusqua(() => /est rouge après merge/.test(commentaires()));
    assert.match(commentaires(), /\*\*Pass — `v2` est rouge après merge\.\*\* `base-1`[\s\S]*Chaque livraison était verte seule[\s\S]*FAIL {2}tests du projet en échec[\s\S]*ne merge plus rien sous grant/);

    // Les livraisons suivantes sont vertes, et attendent.
    await jusquAu("pass.waiting", 2);
    await laisserTourner();
    assert.deepEqual(histoire(18), ["pass.judged", "pass.waiting"]);
    assert.deepEqual([pass(18)?.phase, pass(18)?.reason, gh.merges.length, compter("pass.waiting"), compter("base.checked")], ["waiting", "base-red", 1, 2, 1]);
    assert.match(commentaires(18), /verte, en attente \(`base-red`\)[\s\S]*`v2` est rouge[\s\S]*sera mergée seule dès que `v2` sera réparée/);

    // Une livraison qui attend se merge à la main, comme son issue le dit : la
    // pass le voit, sert le ticket, et rejoue les gates de la base — toujours rouge.
    gh.mergerPR(102);
    await jusqua(() => gh.fermetures.includes(18));
    assert.deepEqual(histoire(18), ["pass.judged", "pass.waiting", "merge.done"]);
    assert.deepEqual([dernier("merge.done", 18)?.by, dernier("merge.done", 18)?.unverified, gh.merges.length], ["outside", true, 1]);
    await jusquAu("base.checked", 2);
    assert.deepEqual([dernier("base.checked")?.outcome, dernier("base.checked")?.tickets, pass(19)?.phase], ["red", [18], "waiting"]);

    // Le chef répare : la base bouge, ses gates sont rejouées, et ce qui attendait part.
    essais.base = "vert";
    base.tete = "base-2";
    await jusquAu("merge.done", 3);
    assert.deepEqual(histoire(19).slice(2), ["pass.base-moved", "grant.used", "merge.done"]);
    assert.match(avertissements.join("\n"), /v2 n'est plus rouge \(base-2\) — les merges sous grant reprennent/);
    await jusqua(() => etatDeLaBase(journal.base)?.outcome === "green" && mergesAVerifier(journal.base).length === 0);
  });

  test("un contrôle non joué ne lève pas un rouge constaté : la base bouge, ses gates ne peuvent pas se jouer, et rien ne repart — ni merge, ni ticket — jusqu'à un contrôle joué et vert", async (t) => {
    let controler = () => {};
    const livres = new Promise<void>((resoudre) => (controler = resoudre));
    const { journal, gh, base, essais, avertissements, dernier, pass, compter, jusquAu, laisserTourner } = service(t, ["voisin.ts"], {
      cooks: 2,
      essais: { base: "rouge" },
      avantEssai: (nom) => (nom === "base" ? livres : Promise.resolve()),
    });
    await jusquAu("merge.done");
    gh.poser(issue(18));
    await jusqua(() => dernier("cook.reported", 18) !== undefined);
    controler();
    await jusquAu("base.checked");
    await jusqua(() => pass(18)?.phase === "waiting");
    gh.poser(issue(19));
    await jusqua(() => dernier("station.held")?.reason === "base");

    essais.base = "impossible";
    base.tete = "base-2";
    await jusquAu("base.checked", 2);
    assert.deepEqual(dernier("base.checked"), { sha: "base-2", outcome: "skipped", gates: { outcome: "skipped", code: null, failures: [], tail: "" }, tickets: [], red: "base-1", reason: PANNE_DE_WORKTREE });
    const controle = etatDeLaBase(journal.base);
    assert.deepEqual([controle?.outcome, controle?.sha, controle?.unplayed?.sha, controle?.reason], ["red", "base-1", "base-2", PANNE_DE_WORKTREE]);
    assert.match(avertissements.join("\n"), /v2 reste ROUGE : ses gates n'ont pas pu être jouées sur base-2 \(git worktree : fatal: could not create leading directories of '\.essais\/base'\), et un contrôle non joué ne lève pas le rouge constaté sur base-1/);

    // Le contrôle non joué n'est pas retenté à chaque tick, et rien n'est reparti.
    await laisserTourner();
    assert.deepEqual([compter("base.checked"), pass(18)?.phase, pass(18)?.reason, gh.merges.length, dernier("cook.launched", 19)], [2, "waiting", "base-red", 1, undefined]);
    assert.doesNotMatch(avertissements.join("\n"), /n'est plus rouge|a buté sur le contrôle/);
    assert.equal(avertissements.filter((ligne) => /reste ROUGE : ses gates n'ont pas pu être jouées/.test(ligne)).length, 1);

    essais.base = "vert";
    base.tete = "base-3";
    await jusquAu("merge.done", 2);
    await jusqua(() => dernier("cook.launched", 19) !== undefined);
    assert.match(avertissements.join("\n"), /v2 n'est plus rouge \(base-3\)/);
  });

  test("une base jamais vue rouge dont les gates ne peuvent pas se jouer ne retient rien : la station prend le ticket suivant", async (t) => {
    const { journal, gh, avertissements, dernier, compter, jusquAu, laisserTourner } = service(t, ["voisin.ts"], { essais: { base: "impossible" } });
    await jusquAu("base.checked");
    assert.deepEqual([dernier("base.checked")?.outcome, dernier("base.checked")?.red, etatDeLaBase(journal.base)?.outcome], ["skipped", undefined, "skipped"]);
    // L'essai qui ne s'est pas fait dit pourquoi, une fois, et le merge n'est pas revérifié à chaque réveil.
    assert.deepEqual([dernier("base.checked")?.reason, etatDeLaBase(journal.base)?.reason, mergesAVerifier(journal.base)], [PANNE_DE_WORKTREE, PANNE_DE_WORKTREE, []]);

    await laisserTourner();
    assert.equal(compter("base.checked"), 1);
    assert.deepEqual(
      avertissements.filter((ligne) => /gates de v2/.test(ligne)),
      [`brigade : gates de v2 non jouées sur base-1 après le merge de #17 : l'essai ne s'est pas fait (${PANNE_DE_WORKTREE}) — rien n'est retenu, et rien n'a été vérifié`],
    );
    assert.doesNotMatch(avertissements.join("\n"), /a buté sur le contrôle/);

    gh.poser(issue(18));
    await jusqua(() => dernier("cook.launched", 18) !== undefined);
  });

  test("le rejeu que le chef demande et qui ne peut pas se faire est servi par un contrôle non joué : le rouge reste, le motif est au journal, et c'est dit une fois — pas à chaque réveil", async (t) => {
    const { journal, repertoire, essais, avertissements, dernier, compter, jusquAu, laisserTourner } = service(t, ["voisin.ts"], { essais: { base: "rouge" } });
    await jusquAu("base.checked");

    essais.base = "impossible";
    chef(repertoire, "base.recheck-requested");
    await jusquAu("base.checked", 2);
    await laisserTourner();

    assert.deepEqual(dernier("base.checked"), { sha: "base-1", outcome: "skipped", gates: { outcome: "skipped", code: null, failures: [], tail: "" }, tickets: [], red: "base-1", reason: PANNE_DE_WORKTREE });
    const controle = etatDeLaBase(journal.base);
    // La demande n'attend plus : ce qui se lit est le contrôle qui n'a pas pu se jouer, et pourquoi.
    assert.deepEqual([controle?.outcome, controle?.recheck, controle?.unplayed?.sha, controle?.reason], ["red", null, "base-1", PANNE_DE_WORKTREE]);
    assert.equal(compter("base.checked"), 2);
    assert.equal(avertissements.filter((ligne) => /reste ROUGE : ses gates n'ont pas pu être jouées sur base-1 \(git worktree : fatal/.test(ligne)).length, 1);
    assert.doesNotMatch(avertissements.join("\n"), /a buté sur le contrôle/);

    // Le dépôt réparé, le chef redemande : le rejeu se joue.
    essais.base = "vert";
    chef(repertoire, "base.recheck-requested");
    await jusquAu("base.checked", 3);
    assert.deepEqual([etatDeLaBase(journal.base)?.outcome, etatDeLaBase(journal.base)?.reason], ["green", null]);
  });

  test("le chef fait rejouer les gates d'une base rouge sans commit : rouges, la retenue reste ; vertes, elle tombe et la prise de tickets reprend", async (t) => {
    const { journal, repertoire, gh, essais, avertissements, dernier, compter, jusquAu, laisserTourner } = service(t, ["voisin.ts"], { essais: { base: "rouge" } });
    await jusquAu("base.checked");
    gh.poser(issue(18));
    await jusqua(() => dernier("station.held")?.reason === "base");

    // Un rouge instable : rejouées, les gates passeraient. Sans commit ni geste, la pass ne les rejoue pas.
    await laisserTourner();
    assert.equal(compter("base.checked"), 1);

    chef(repertoire, "base.recheck-requested");
    await jusquAu("base.checked", 2);
    assert.deepEqual([dernier("base.checked")?.sha, dernier("base.checked")?.outcome, etatDeLaBase(journal.base)?.recheck], ["base-1", "red", null]);
    assert.match(avertissements.join("\n"), /v2 reste ROUGE \(base-1\) : rejouées à la demande du chef, ses gates ne passent toujours pas/);
    // La demande est servie : elle ne se rejoue pas d'elle-même.
    await laisserTourner();
    assert.deepEqual([compter("base.checked"), dernier("cook.launched", 18)], [2, undefined]);

    essais.base = "vert";
    chef(repertoire, "base.recheck-requested");
    await jusquAu("base.checked", 3);
    assert.deepEqual([dernier("base.checked")?.sha, dernier("base.checked")?.outcome, etatDeLaBase(journal.base)?.outcome], ["base-1", "green", "green"]);
    assert.match(avertissements.join("\n"), /v2 n'est plus rouge \(base-1\)/);
    await jusqua(() => dernier("cook.launched", 18) !== undefined);
  });

  // Un ménage qui échoue après coup : le worktree jetable de la base part, puis git se plaint.
  // `pose` : où ce worktree vit, connu une fois la cuisine montée.
  const menageEnPanne = (depot: Depot, pose: () => string) => (nom?: string) => {
    const joue = nom === "base" && existsSync(pose());
    depot.jeter(nom);
    if (joue) throw new Error("git worktree : fatal: prune impossible");
  };

  test("un verdict joué n'est pas perdu par un ménage raté : sur une base jamais vue rouge, des gates rouges dont le worktree jetable ne se retire pas font une base rouge, pas un contrôle non joué", async (t) => {
    const lieu = service(t, ["voisin.ts"], { essais: { base: "rouge" }, depot: (depot) => ({ jeter: menageEnPanne(depot, () => lieu.essai("base")) }) });
    const { journal, avertissements, dernier, jusquAu } = lieu;
    await jusquAu("base.checked");

    assert.deepEqual([dernier("base.checked")?.outcome, dernier("base.checked")?.tickets, dernier("base.checked")?.reason], ["red", [17], undefined]);
    assert.deepEqual([etatDeLaBase(journal.base)?.outcome, etatDeLaBase(journal.base)?.reason], ["red", null]);
    assert.match(avertissements.join("\n"), /v2 est ROUGE après merge/);
    assert.match(avertissements.join("\n"), /le worktree jetable du contrôle de v2 n'a pas pu être retiré — git worktree : fatal: prune impossible/);
  });

  test("un verdict joué n'est pas perdu par un ménage raté : le rejeu demandé par le chef, joué vert, lève le rouge même si son worktree jetable ne se retire pas", async (t) => {
    let panne = false;
    const lieu = service(t, ["voisin.ts"], {
      essais: { base: "rouge" },
      depot: (depot) => ({ jeter: (nom) => (panne ? menageEnPanne(depot, () => lieu.essai("base"))(nom) : depot.jeter(nom)) }),
    });
    const { journal, repertoire, essais, avertissements, dernier, jusquAu } = lieu;
    await jusquAu("base.checked");

    essais.base = "vert";
    panne = true;
    chef(repertoire, "base.recheck-requested");
    await jusquAu("base.checked", 2);

    assert.deepEqual([dernier("base.checked")?.outcome, dernier("base.checked")?.reason], ["green", undefined]);
    assert.deepEqual([etatDeLaBase(journal.base)?.outcome, etatDeLaBase(journal.base)?.recheck], ["green", null]);
    assert.match(avertissements.join("\n"), /v2 n'est plus rouge \(base-1\)/);
  });

  test("le rejeu demandé par le chef consomme la machine comme un autre : saturée, il attend en le disant une fois, et se joue seul quand elle se calme", async (t) => {
    const pleine: Machine = { ...MACHINE_CALME, charge: 64 };
    let machine = MACHINE_CALME;
    const { journal, repertoire, avertissements, dernier, compter, jusquAu, laisserTourner } = service(t, ["voisin.ts"], { essais: { base: "rouge" }, machine: () => machine });
    await jusquAu("base.checked");

    machine = pleine;
    chef(repertoire, "base.recheck-requested");
    await jusquAu("base.recheck-held");
    await laisserTourner();
    assert.deepEqual([compter("base.recheck-held"), compter("base.checked"), dernier("base.recheck-held")?.resource], [1, 1, "cpu"]);
    assert.notEqual(etatDeLaBase(journal.base)?.recheck?.heldAt, null);
    assert.equal(avertissements.filter((ligne) => /rejeu des gates de v2 demandé par le chef, mais la machine n'en peut plus — charge de 64 pour 12 au plus/.test(ligne)).length, 1);

    machine = MACHINE_CALME;
    await jusquAu("base.checked", 2);
    assert.equal(etatDeLaBase(journal.base)?.recheck, null);
  });

  test("le rejeu que le chef demande sur une base qui ne se rapatrie pas est retenu : écrit et dit une fois, retenté au tick, le rouge reste — et il se joue seul quand l'origine revient", async (t) => {
    const origine = origineFragile(t);
    const lieu = service(t, ["voisin.ts"], {
      essais: { base: "rouge" },
      depot: () => ({ rapatrier: async () => (await origine.rapatrier(), lieu.base.tete) }),
    });
    const { journal, repertoire, essais, avertissements, dernier, compter, jusquAu, laisserTourner } = lieu;
    await jusquAu("base.checked");

    // Rejouées, les gates passeraient : seul le rapatriement manque.
    essais.base = "vert";
    origine.presente = false;
    chef(repertoire, "base.recheck-requested");
    await jusquAu("base.check-held");
    await laisserTourner();

    assert.deepEqual([compter("base.check-held"), compter("base.check-resumed"), compter("base.checked")], [1, 0, 1]);
    assert.match(String(dernier("base.check-held")?.reason), /^git fetch\b.*origine\.git/);
    assert.doesNotMatch(String(dernier("base.check-held")?.reason), /\n/);
    // La demande reste due, et le rouge constaté n'est pas levé.
    const controle = etatDeLaBase(journal.base);
    assert.deepEqual([controle?.outcome, controle?.recheck?.heldAt, controleRetenu(journal.base)?.reason], ["red", null, dernier("base.check-held")?.reason]);
    assert.equal(avertissements.filter((ligne) => /rejeu des gates de v2 demandé par le chef, mais v2 ne se rapatrie pas — git fetch/.test(ligne)).length, 1);
    assert.doesNotMatch(avertissements.join("\n"), /a buté sur le contrôle|n'est plus rouge/);

    origine.presente = true;
    await jusquAu("base.checked", 2);
    assert.deepEqual(
      journal.tout().map((e) => e.type).filter((type) => /^base\./.test(type)),
      ["base.checked", "base.recheck-requested", "base.check-held", "base.check-resumed", "base.checked"],
    );
    assert.deepEqual([etatDeLaBase(journal.base)?.outcome, etatDeLaBase(journal.base)?.recheck, controleRetenu(journal.base)], ["green", null, null]);
    assert.match(avertissements.join("\n"), /v2 se rapatrie de nouveau — son contrôle reprend/);
  });

  test("des merges à vérifier sur une base qui ne se rapatrie pas : leur contrôle est retenu, dit une fois pour la série, et se joue seul quand l'origine revient", async (t) => {
    const origine = origineFragile(t);
    let reparee = false;
    const lieu = service(t, ["voisin.ts"], {
      depot: () => ({
        async rapatrier() {
          // L'origine tombe une fois la livraison mergée : c'est le contrôle de la base qui bute, pas le jugement.
          origine.presente = reparee || lieu.compter("merge.done") === 0;
          await origine.rapatrier();
          return lieu.base.tete;
        },
      }),
    });
    const { journal, avertissements, dernier, compter, jusquAu, laisserTourner } = lieu;
    await jusquAu("base.check-held");
    await laisserTourner();

    assert.deepEqual([compter("base.check-held"), compter("base.checked"), mergesAVerifier(journal.base), etatDeLaBase(journal.base)], [1, 0, [17], null]);
    assert.notEqual(controleRetenu(journal.base), null);
    assert.equal(avertissements.filter((ligne) => /gates de v2 à jouer après le merge de #17, mais v2 ne se rapatrie pas — git fetch/.test(ligne)).length, 1);
    assert.doesNotMatch(avertissements.join("\n"), /a buté sur le contrôle/);

    reparee = true;
    await jusquAu("base.checked");
    assert.deepEqual([compter("base.check-resumed"), dernier("base.checked")?.outcome, dernier("base.checked")?.tickets], [1, "green", [17]]);
    assert.deepEqual([mergesAVerifier(journal.base), controleRetenu(journal.base)], [[], null]);
  });

  test("une base rouge qui ne se rapatrie plus : c'est dit une fois, pas à chaque tick ; l'origine revenue sur la même tête, rien n'est rejoué et le rouge reste", async (t) => {
    const origine = origineFragile(t);
    const lieu = service(t, ["voisin.ts"], {
      essais: { base: "rouge" },
      depot: () => ({ rapatrier: async () => (await origine.rapatrier(), lieu.base.tete) }),
    });
    const { journal, avertissements, compter, jusquAu, laisserTourner } = lieu;
    await jusquAu("base.checked");

    origine.presente = false;
    await jusquAu("base.check-held");
    await laisserTourner();
    assert.equal(compter("base.check-held"), 1);
    assert.equal(avertissements.filter((ligne) => /v2 est rouge, à rejouer dès qu'elle bouge, mais v2 ne se rapatrie pas — git fetch/.test(ligne)).length, 1);

    origine.presente = true;
    await jusquAu("base.check-resumed");
    await laisserTourner();
    assert.deepEqual([compter("base.check-resumed"), compter("base.checked"), etatDeLaBase(journal.base)?.outcome, controleRetenu(journal.base)], [1, 1, "red", null]);
    assert.doesNotMatch(avertissements.join("\n"), /a buté sur le contrôle|n'est plus rouge/);
  });

  test("rejouer des gates consomme la machine : saturée, le rejeu attend en le disant, et repart seul", async (t) => {
    const pleine: Machine = { ...MACHINE_CALME, charge: 64 };
    let machine: Machine | null = null;
    const { gates, histoire, pass, jusquAu, laisserTourner, commentaires } = service(t, ["travail.txt"], {
      machine: () => machine ?? MACHINE_CALME,
      // La machine sature une fois la livraison jugée : le cook, lui, est parti.
      depot: () => ({ arrives: () => ((machine ??= pleine), ["travail.txt"]) }),
    });
    await jusquAu("pass.waiting");
    await laisserTourner();

    assert.deepEqual([pass()?.phase, pass()?.reason, gates.appels().length], ["waiting", "machine-saturated", 1]);
    assert.deepEqual(histoire(), ["pass.judged", "pass.waiting"]);
    assert.match(commentaires(), /en attente \(`machine-saturated`\)[\s\S]*`travail\.txt`[\s\S]*charge de 64 pour 12 au plus/);

    machine = MACHINE_CALME;
    await jusquAu("merge.done");
    assert.deepEqual(histoire(), ["pass.judged", "pass.waiting", "pass.base-moved", "pass.replayed", "grant.used", "merge.done"]);
  });

  test("un runtime tué pendant un rejeu ne laisse pas son worktree jetable : au redémarrage il est retiré, le rejeu repris, et rien n'est mergé deux fois", async (t) => {
    const premiere = service(t, ["travail.txt"], { essais: { "rencontre-17": "lent" } });
    await jusqua(() => premiere.gates.appels().length === 2);
    assert.equal(premiere.pass()?.phase, "replaying");
    premiere.runtime.arreter("test");
    assert.deepEqual(premiere.gh.merges, []);
    // Arrêté proprement, il retire son worktree jetable ; tué, il l'aurait
    // laissé — et celui de la base avec.
    await jusqua(() => !existsSync(premiere.essai("rencontre-17")));
    mkdirSync(premiere.essai("rencontre-17"), { recursive: true });
    mkdirSync(premiere.essai("base"), { recursive: true });

    const { gh, journal, compter, jusquAu, essai } = service(t, ["travail.txt"], { lieux: premiere.lieux });
    assert.deepEqual([existsSync(essai("rencontre-17")), existsSync(essai("base"))], [false, false]);
    await jusquAu("merge.done");

    assert.deepEqual([gh.merges.length, compter("pass.base-moved"), compter("pass.replayed"), compter("pass.judged")], [1, 1, 1, 1]);
    assert.equal(journal.tout().filter((e) => e.type === "grant.used").length, 1);
    assert.equal(existsSync(essai("rencontre-17")), false);
  });

  test("un dépôt qui exige une branche à jour refuse le merge : ce refus-là n'arrête pas la pass, il repart au cook pour rebase", async (t) => {
    const { gh, dernier, histoire, pass, jusquAu } = service(t, ["voisin.ts"], { scenario: "bavard", suite: ["livre"] });
    gh.merge.mode = { refus: "HTTP 405 — Head branch is out of date" };
    const lecture = gh.github.prDeBranche;
    gh.github.prDeBranche = async (branche) => {
      const pr = await lecture(branche);
      return pr && { ...pr, enRetard: gh.merges.length > 0 };
    };
    await jusquAu("pass.returned");

    assert.deepEqual(histoire(), ["pass.judged", "pass.base-moved", "grant.used", "merge.failed", "pass.outdated", "pass.returned"]);
    assert.match(String((dernier("pass.returned", 17)?.findings as string[])[0]), /^Branche en retard sur `v2` : le dépôt exige une branche à jour pour merger, et GitHub a refusé \(HTTP 405 — Head branch is out of date\)\. Rapatrie la base/);
    assert.deepEqual([gh.merges.length, pass()?.returns], [1, 1]);
  });


  test("une livraison rougie par sa rencontre compte parmi ce qui a été tenté : le manager, à qui la pass passe la main, lit qu'il fallait rebaser", async (t) => {
    const lieu = service(t, ["travail.txt"], { essais: { "rencontre-17": "rouge" }, manager: { jugement: "reagit-remonte" } });
    chef(lieu.repertoire, "manager.enabled");
    // Deux livraisons rouges d'elles-mêmes, puis une verte que la base rend rouge.
    lieu.gates.regler("rouge");
    await lieu.jusquAu("pass.returned", 2);
    lieu.gates.regler("vert");
    await lieu.jusquAu("manager.reacted", 2);

    assert.deepEqual(lieu.histoire().slice(-3), ["pass.replayed", "pass.deferred", "pass.escalated"]);
    const jugement = lieu.relectures().at(-1)?.args.join("\n") ?? "";
    assert.match(jugement, /3\. `sonnet` \/ `low` — pass rouge :\nRencontre avec `v2` : la branche est verte seule[\s\S]*rebase ta branche sur `origin\/v2`/);
    await jusqua(() => /remontée au chef/.test(lieu.commentaires()));
    assert.match(lieu.commentaires(), /\*\*Ce qui a été tenté\.\*\*[\s\S]*3\. `sonnet` \/ `low` — pass rouge :\n\n {3}Rencontre avec `v2`/);
  });
});
