// La rencontre : ce que la pass fait d'une livraison verte quand la base a
// avancé sous elle, et ce qu'elle fait de la base une fois mergé ce que rien
// n'avait vérifié ensemble. La base est celle du faux dépôt, que chaque test
// fait avancer à la main.
import assert from "node:assert/strict";
import { existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { describe, test, type TestContext } from "node:test";
import type { Depot } from "../src/depot.ts";
import type { Machine } from "../src/machine.ts";
import { etatDeLaBase, mergesAVerifier, passDuTicket } from "../src/projections/pass.ts";
import { chef, cuisine, issue, MACHINE_CALME, type Options } from "./aides/cuisine.ts";
import { jusqua } from "./outils.ts";

type Scenario = "vert" | "rouge" | "lent";

// Une cuisine sous grant, un ticket livré (`travail.txt`), et une base qui a
// avancé de deux commits depuis son départ. `recus` : ce qu'elle a reçu.
// `essais` : ce que disent les gates dans un worktree jetable, par son nom —
// celles du worktree du cook restent vertes.
function service(
  t: TestContext,
  recus: string[],
  options: Omit<Options, "depot"> & { essais?: Record<string, Scenario>; conflit?: boolean; depot?: (depot: Depot) => Partial<Depot> } = {},
) {
  const base = { tete: "base-1" };
  const essais: Record<string, Scenario> = { ...options.essais };
  // Les fausses gates n'ont qu'un scénario pour tous les worktrees : il est
  // réglé à l'entrée de chaque worktree jetable.
  let regler = (_scenario: Scenario) => {};
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
        regler(essais[nom] ?? "vert");
        return depot.essayer(nom, sha);
      },
      ...options.depot?.(depot),
    }),
  });
  regler = lieu.gates.regler;
  if (!options.lieux) chef(lieu.repertoire, "grant.activated");
  const { journal, repertoire } = lieu;
  const compter = (type: string) => journal.tout().filter((e) => e.type === type).length;
  const jusquAu = (type: string, combien = 1) => jusqua(() => compter(type) >= combien);
  const laisserTourner = () => jusquAu("runtime.ticked", compter("runtime.ticked") + 3);
  const histoire = (ticket = 17) =>
    journal
      .duTicket(ticket)
      .map((e) => e.type)
      .filter((type) => /^(pass\.(judged|base-moved|replayed|outdated|waiting|returned)|grant|merge)\b/.test(type));
  const essai = (nom: string) => join(repertoire, "worktrees", ".essais", nom);
  const commentaires = (ticket = 17) => lieu.gh.commentaires.filter(([numero]) => numero === ticket).map(([, corps]) => corps).join("\n---\n");
  return { ...lieu, base, essais, compter, jusquAu, laisserTourner, histoire, essai, commentaires, pass: (ticket = 17) => passDuTicket(journal.base, ticket) };
}

// Chaque test a ses lieux : ils se jouent de front.
describe("la rencontre de deux livraisons", { concurrency: 8 }, () => {
  test("la base a avancé sur d'autres fichiers : la livraison est mergée sans rejeu, c'est dit au journal et sur l'issue, et les gates sont jouées sur la base après merge, hors ticket", async (t) => {
    const { journal, gh, gates, dernier, histoire, jusquAu, essai, commentaires } = service(t, ["voisin.ts"]);
    await jusquAu("base.checked");

    assert.deepEqual(histoire(), ["pass.judged", "pass.base-moved", "grant.used", "merge.done"]);
    assert.deepEqual(dernier("pass.base-moved", 17), { sha: dernier("pass.judged", 17)?.sha, base: "base-1", from: "base-0", behind: 2, overlap: [], replay: false });
    assert.equal(gh.merges.length, 1);
    // Une suite pour la branche, une pour la base : aucune pour la rencontre.
    assert.deepEqual(gates.appels().slice(1), [essai("base")]);
    const controle = journal.tout().find((e) => e.type === "base.checked");
    assert.deepEqual([controle?.ticket, controle?.author], [null, "pass"]);
    assert.deepEqual(controle?.payload, { sha: "base-1", outcome: "green", gates: { outcome: "green", code: 0, failures: [], tail: "ok    tests du projet\ngates : VERT" }, tickets: [17] });
    assert.deepEqual([etatDeLaBase(journal.base)?.outcome, mergesAVerifier(journal.base)], ["green", []]);
    assert.equal(existsSync(essai("base")), false);
    await jusqua(() => /mergée sur `v2`/.test(commentaires()));
    assert.match(commentaires(), /`v2` avait avancé de 2 commits depuis le départ de cette branche, sans toucher à aucun de ses fichiers : mergée sans rejouer les gates/);
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
    assert.deepEqual([gh.merges.length, compter("base.checked"), mergesAVerifier(journal.base)], [1, 0, []]);
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

  test("un recouvrement limité aux chemins communs ne se paie pas un rejeu : c'est le contrôle de la base qui le couvre", async (t) => {
    const { gates, dernier, jusquAu, essai, commentaires } = service(t, ["docs/runtime.md", "docs/guide/pass.md"], {
      communs: ["docs"],
      depot: () => ({ changes: () => ["docs/runtime.md", "travail.txt"] }),
    });
    await jusquAu("base.checked");

    assert.deepEqual([dernier("pass.base-moved", 17)?.overlap, dernier("pass.base-moved", 17)?.replay], [[], false]);
    assert.deepEqual(gates.appels().slice(1), [essai("base")]);
    assert.match(commentaires(), /sans toucher à aucun de ses fichiers \(chemins communs mis à part\)/);
  });

  test("la rencontre casse la base malgré tout : c'est vu après merge et remonté, les merges sous grant s'arrêtent, la livraison suivante attend en le disant — et repart seule quand la base est réparée", async (t) => {
    const { journal, gh, gates, base, essais, avertissements, histoire, pass, compter, jusquAu, laisserTourner, commentaires } = service(t, ["voisin.ts"], { essais: { base: "rouge" } });
    await jusquAu("base.checked");

    const controle = journal.tout().find((e) => e.type === "base.checked")?.payload;
    assert.deepEqual([controle?.outcome, controle?.tickets, (controle?.gates as { failures: string[] }).failures], ["red", [17], ["FAIL  tests du projet en échec"]]);
    assert.match(avertissements.join("\n"), /v2 est ROUGE après merge \(base-1 — merges à vérifier : #17\) — les merges sous grant sont suspendus/);
    await jusqua(() => /est rouge après merge/.test(commentaires()));
    assert.match(commentaires(), /\*\*Pass — `v2` est rouge après merge\.\*\* `base-1`[\s\S]*Chaque livraison était verte seule[\s\S]*FAIL {2}tests du projet en échec[\s\S]*ne merge plus rien sous grant/);

    // La livraison suivante est verte, et attend.
    gates.regler("vert");
    gh.poser(issue(18));
    await jusquAu("pass.waiting");
    await laisserTourner();
    assert.deepEqual(histoire(18), ["pass.judged", "pass.waiting"]);
    assert.deepEqual([pass(18)?.phase, pass(18)?.reason, gh.merges.length, compter("pass.waiting"), compter("base.checked")], ["waiting", "base-red", 1, 1, 1]);
    assert.match(commentaires(18), /verte, en attente \(`base-red`\)[\s\S]*`v2` est rouge[\s\S]*sera mergée seule dès que `v2` sera réparée/);

    // Le chef répare : la base bouge, ses gates sont rejouées, et ce qui attendait part.
    essais.base = "vert";
    base.tete = "base-2";
    await jusquAu("merge.done", 2);
    assert.deepEqual(histoire(18).slice(2), ["pass.base-moved", "grant.used", "merge.done"]);
    assert.match(avertissements.join("\n"), /v2 n'est plus rouge \(base-2\) — les merges sous grant reprennent/);
    await jusqua(() => etatDeLaBase(journal.base)?.outcome === "green" && mergesAVerifier(journal.base).length === 0);
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

  test("une base qui n'a pas bougé ne coûte rien : ni fait, ni rejeu, ni contrôle", async (t) => {
    const { gates, histoire, compter, jusquAu, laisserTourner } = service(t, [], { depot: () => ({ retard: () => ({ depart: "base-1", commits: 0 }) }) });
    await jusquAu("merge.done");
    await laisserTourner();

    assert.deepEqual(histoire(), ["pass.judged", "grant.used", "merge.done"]);
    assert.deepEqual([gates.appels().length, compter("base.checked")], [1, 0]);
  });

  test("une PR mergée à la main n'a été vérifiée par personne sur la base : ses gates y sont jouées après coup", async (t) => {
    const lieu = service(t, [], { depot: () => ({ retard: () => ({ depart: "base-1", commits: 0 }) }) });
    chef(lieu.repertoire, "grant.revoked");
    await lieu.jusquAu("pass.held");

    lieu.gh.mergerPR(101);
    await lieu.jusquAu("base.checked");

    assert.deepEqual(lieu.dernier("base.checked"), { sha: "base-1", outcome: "green", gates: lieu.dernier("base.checked")?.gates, tickets: [17] });
    assert.deepEqual(lieu.gh.merges, []);
  });
});
