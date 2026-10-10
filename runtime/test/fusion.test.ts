// « Vert » veut dire vert une fois fusionné : ce que la pass juge d'une
// livraison est sa fusion avec la base du moment, à chaque fois qu'elle juge —
// et ce qu'elle fait de la base elle-même, quand elle est rouge ou qu'un merge
// s'y est fait hors du runtime. La base est celle du faux dépôt, que chaque
// test fait avancer à la main.
import assert from "node:assert/strict";
import { existsSync, mkdirSync, renameSync, symlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { describe, test, type TestContext } from "node:test";
import { ouvrirDepot, type Depot } from "../src/depot.ts";
import type { Machine } from "../src/machine.ts";
import { controleRetenu, etatDeLaBase, mergesAVerifier, passDuTicket } from "../src/projections/pass.ts";
import { chef, cuisine, fauxGitHub, issue, MACHINE_CALME, montre, type Options } from "./aides/cuisine.ts";
import { BASE, commiter, depotGit, ENV_GIT, git, jusqua, repertoireTemporaire } from "./outils.ts";

// `impossible` : le worktree jetable ne se fait pas — le dépôt lève, comme le
// vrai (`git worktree add` raté), et les gates ne sont pas jouées.
const PANNE_DE_WORKTREE = "git worktree : fatal: could not create leading directories of '.essais/base'";
type Scenario = "vert" | "rouge" | "lent" | "impossible" | "plafond";

// Une cuisine sous grant, un ticket livré (`travail.txt`), et une base dont le
// test tient la tête (`base.tete`).
// `essais` : ce que disent les gates dans un worktree jetable, par son nom —
// `jugement-<ticket>` pour la fusion d'une livraison, `base` pour la base
// seule. Sans scénario, une fusion joue celui des fausses gates du test, et la
// base seule est verte.
// `aLaMain` : sans grant, la livraison verte du ticket 17 s'arrête ; elle est
// alors mergée à la main — hors du runtime, rien ne l'a jugée sur la base —,
// puis le grant est accordé pour les suivantes.
function service(
  t: TestContext,
  options: Omit<Options, "depot"> & {
    essais?: Record<string, Scenario>;
    aLaMain?: boolean;
    // Ce qu'un essai attend avant de jouer ses gates, par son nom.
    avantEssai?: (nom: string) => Promise<void>;
    // Appelé après chaque fusion, avec leur nombre : de quoi faire bouger la base sous un verdict.
    apresFusion?: (combien: number) => void;
    depot?: (depot: Depot) => Partial<Depot>;
  } = {},
) {
  const base = { tete: "base-1" };
  const essais: Record<string, Scenario> = { ...options.essais };
  // Ce qui empêche une fusion : un conflit, ou une panne — ce que git en dit.
  const fusion: { conflit: boolean; panne: string | null; faites: Array<{ nom: string; base: string; sha: string }> } = { conflit: false, panne: null, faites: [] };
  const lieu = cuisine(t, {
    pass: true,
    issues: [issue(17)],
    ...options,
    depot: (depot): Depot => ({
      ...depot,
      rapatrier: async () => base.tete,
      avance: () => 2,
      async essayer(nom) {
        await options.avantEssai?.(nom);
        if (essais[nom] === "impossible") throw new Error(PANNE_DE_WORKTREE);
        const essai = await depot.essayer(nom);
        // Le scénario d'un essai est écrit dans son worktree jetable, pas dans
        // celui que partagent tous les worktrees : la livraison qu'un cook
        // fait juger juste après ne doit pas en hériter.
        writeFileSync(join(essai, ".claude/brigade/scenario-gates"), essais[nom] ?? "vert");
        return essai;
      },
      async fusionner(nom, tete, sha) {
        if (fusion.conflit) return null;
        if (fusion.panne !== null) throw new Error(fusion.panne);
        await options.avantEssai?.(nom);
        const faite = await depot.fusionner(nom, tete, sha);
        if (faite !== null && essais[nom] !== undefined) writeFileSync(join(faite.worktree, ".claude/brigade/scenario-gates"), essais[nom]);
        fusion.faites.push({ nom, base: tete, sha });
        options.apresFusion?.(fusion.faites.length);
        return faite;
      },
      ...options.depot?.(depot),
    }),
  });
  const { journal, repertoire } = lieu;
  const compter = (type: string) => journal.tout().filter((e) => e.type === type).length;
  const jusquAu = (type: string, combien = 1) => jusqua(() => compter(type) >= combien);
  if (options.aLaMain) {
    void jusquAu("pass.held").then(
      () => {
        lieu.gh.mergerPR(101);
        chef(repertoire, "grant.activated");
      },
      () => {},
    );
  } else if (!options.lieux) chef(repertoire, "grant.activated");
  const laisserTourner = () => jusquAu("runtime.ticked", compter("runtime.ticked") + 3);
  const histoire = (ticket = 17) =>
    journal
      .duTicket(ticket)
      .map((e) => e.type)
      .filter((type) => /^(pass\.(judged|outdated|waiting|returned|deferred|escalated)|grant|merge)\b/.test(type));
  const verdicts = (ticket = 17) =>
    journal
      .duTicket(ticket)
      .flatMap((e) => (e.type === "pass.judged" ? [e] : []))
      .map((e) => ({ seq: e.seq, ...e.payload }));
  const essai = (nom: string) => join(repertoire, "worktrees", ".essais", nom);
  const commentaires = (ticket = 17) => lieu.gh.commentaires.filter(([numero]) => numero === ticket).map(([, corps]) => corps).join("\n---\n");
  return { ...lieu, base, essais, fusion, compter, jusquAu, laisserTourner, histoire, verdicts, essai, commentaires, pass: (ticket = 17) => passDuTicket(journal.base, ticket) };
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
describe("une livraison se juge fusionnée avec la base", { concurrency: 8 }, () => {
  test("ce qui est jugé est la fusion de la branche avec la base du moment : les gates s'y jouent, le verdict dit sur quoi il porte — tête de la branche, tête de la base, arbre obtenu —, et la livraison mergée n'a rien à faire vérifier", async (t) => {
    const { journal, gh, gates, fusion, dernier, histoire, verdicts, compter, jusquAu, laisserTourner, essai, commentaires } = service(t);
    await jusquAu("merge.done");
    await laisserTourner();

    assert.deepEqual(histoire(), ["pass.judged", "grant.used", "merge.done"]);
    const sha = String(dernier("pass.started", 17)?.sha);
    assert.deepEqual(fusion.faites, [{ nom: "jugement-17", base: "base-1", sha }]);
    assert.deepEqual(
      verdicts().map(({ sha, base, merged, verdict }) => ({ sha, base, merged, verdict })),
      [{ sha, base: "base-1", merged: `arbre(base-1+${sha})`, verdict: "green" }],
    );
    // Une seule suite, dans le worktree jetable de la fusion — qui ne reste pas.
    assert.deepEqual(gates.appels(), [essai("jugement-17")]);
    assert.equal(existsSync(essai("jugement-17")), false);
    // Mergée par la pass, elle est déjà jugée sur la base : rien n'y est rejoué.
    assert.deepEqual([gh.merges.length, compter("base.checked"), mergesAVerifier(journal.base), dernier("merge.done", 17)?.unverified], [1, 0, [], false]);
    await jusqua(() => /mergée sur `v2`/.test(commentaires()));
    assert.match(commentaires(), /Jugée fusionnée avec `v2` telle qu'elle était au moment de merger \(`base-1`\)/);
  });

  test("une livraison née avant un correctif de la base est verte au premier jugement qui suit le correctif, sans que personne n'intervienne — sur un vrai dépôt, et sans que la fusion jugée soit poussée nulle part", async (t) => {
    const { origine, clone } = depotGit(t);
    // Les gates du projet échouent sur cette machine : il leur manque un correctif.
    mkdirSync(join(clone, ".claude/brigade"), { recursive: true });
    symlinkSync(join(import.meta.dirname, "aides/gates-a-correctif.sh"), join(clone, ".claude/brigade/gates.sh"));
    git(clone, "add", ".");
    git(clone, "commit", "-q", "-m", "les gates du projet");
    git(clone, "push", "-q", "origin", BASE);
    const lieux = { repertoire: repertoireTemporaire(t), origine, clone, gh: fauxGitHub(issue(17)), heure: montre() };
    // Une première vie sans pass : le cook livre sur une branche partie de la base cassée.
    const premiere = cuisine(t, { lieux, git: true });
    await jusqua(() => premiere.types(17).includes("worktree.removed"));
    const branche = String(premiere.dernier("cook.launched", 17)?.branch);
    premiere.runtime.arreter("test");
    const livre = git(origine, "rev-parse", branche);
    // Le correctif est mergé sur la base pendant que le ticket attend.
    commiter(clone, "correctif.txt");
    git(clone, "push", "-q", "origin", BASE);
    const corrigee = git(origine, "rev-parse", BASE);
    // La branche livrée est partie d'avant : elle ne porte pas le correctif.
    assert.equal(git(origine, "ls-tree", "--name-only", livre, "correctif.txt"), "");
    const avant = git(origine, "for-each-ref");
    chef(lieux.repertoire, "grant.activated");

    const { gh, journal, gates } = cuisine(t, { lieux, git: true, pass: true });
    await jusqua(() => gh.merges.length === 1);

    const types = journal.duTicket(17).map((e) => e.type);
    const verdict = journal.duTicket(17).flatMap((e) => (e.type === "pass.judged" ? [e.payload] : []));
    assert.deepEqual([verdict.length, verdict[0]?.verdict, verdict[0]?.sha, verdict[0]?.base], [1, "green", livre, corrigee]);
    assert.match(String(verdict[0]?.merged), /^[0-9a-f]{40}$/);
    assert.deepEqual([types.includes("pass.returned"), types.includes("pass.waiting"), gates.appels().length], [false, false, 1]);
    assert.deepEqual(gh.merges, [[101, livre]]);
    // La fusion est un arbre de jugement : l'origine n'a rien reçu, et la branche du cook y reste la sienne.
    assert.equal(git(origine, "for-each-ref"), avant);
    assert.equal(git(origine, "rev-parse", branche), livre);
  });

  test("la base bouge entre le verdict et le merge : la livraison est rejugée fusionnée avec la base devenue, et c'est ce verdict-là qui autorise le merge — sans seconde relecture", async (t) => {
    const lieu = service(t, { apresFusion: (combien) => void (combien === 1 && (lieu.base.tete = "base-2")) });
    const { gh, gates, dernier, histoire, verdicts, relectures, jusquAu } = lieu;
    await jusquAu("merge.done");

    assert.deepEqual(histoire(), ["pass.judged", "pass.judged", "grant.used", "merge.done"]);
    assert.deepEqual(
      verdicts().map(({ base, verdict }) => [base, verdict]),
      [
        ["base-1", "green"],
        ["base-2", "green"],
      ],
    );
    assert.equal(dernier("grant.used", 17)?.verdict, verdicts()[1]?.seq);
    // Les gates sont rejouées sur la fusion neuve ; le reviewer, lui, a déjà lu ce commit.
    assert.deepEqual([gates.appels().length, relectures().length, gh.merges.length], [2, 1, 1]);
  });

  test("verte fusionnée avec la base d'hier, rouge avec celle d'aujourd'hui : rien n'est mergé, et c'est un renvoi comme un autre — le finding dit sur quelle fusion les gates ont été jouées", async (t) => {
    const lieu = service(t, {
      scenario: "bavard",
      suite: ["livre"],
      apresFusion: (combien) => {
        if (combien !== 1) return;
        lieu.base.tete = "base-2";
        lieu.essais["jugement-17"] = "rouge";
      },
    });
    const { gh, dernier, histoire, verdicts, pass, avertissements, jusquAu } = lieu;
    await jusquAu("pass.returned");

    assert.deepEqual(histoire(), ["pass.judged", "pass.judged", "pass.returned"]);
    assert.deepEqual(
      verdicts().map(({ base, verdict }) => [base, verdict]),
      [
        ["base-1", "green"],
        ["base-2", "red"],
      ],
    );
    const [finding] = dernier("pass.returned", 17)?.findings as string[];
    assert.match(String(finding), /^Gates rouges sur la fusion de `[^`]+` avec `v2` \(`base-2`\) : .*\nFAIL {2}tests du projet en échec/);
    // La base seule est verte : ce rouge est bien celui de la livraison.
    assert.deepEqual([dernier("base.checked")?.sha, dernier("base.checked")?.outcome], ["base-2", "green"]);
    assert.deepEqual([dernier("pass.returned", 17)?.n, pass()?.returns, pass()?.verdict, gh.merges.length], [1, 1, "red", 0]);
    assert.match(avertissements.join("\n"), /pass rouge sur le ticket #17 \(gates rouges/);
  });

  test("rouge une fois fusionnée parce que la base l'est seule : ce rouge n'est celui d'aucun cook — ni verdict ni renvoi, la livraison attend en le disant, et elle est verte dès que la base est réparée", async (t) => {
    const { gh, gates, base, essais, cooks, dernier, histoire, verdicts, pass, compter, jusquAu, laisserTourner, essai, commentaires, avertissements } = service(t, {
      essais: { "jugement-17": "rouge", base: "rouge" },
    });
    await jusquAu("pass.waiting");
    await laisserTourner();

    assert.deepEqual(histoire(), ["pass.waiting"]);
    assert.deepEqual([pass()?.phase, pass()?.reason, pass()?.verdict, pass()?.returns], ["waiting", "base-red", null, 0]);
    // La fusion rouge a fait jouer la base seule, une fois : c'est elle qui est rouge.
    assert.deepEqual(gates.appels(), [essai("jugement-17"), essai("base")]);
    assert.deepEqual([compter("base.checked"), dernier("base.checked")?.sha, dernier("base.checked")?.outcome, dernier("base.checked")?.tickets], [1, "base-1", "red", []]);
    assert.match(avertissements.join("\n"), /v2 est ROUGE \(base-1\) — jugements et merges sont suspendus/);
    assert.deepEqual([cooks().length, compter("pass.returned"), gh.merges.length], [1, 0, 0]);
    assert.match(commentaires(), /\*\*Pass — en attente \(`base-red`\)\.\*\*[\s\S]*`v2` est rouge[\s\S]*ne renvoie aucun cook[\s\S]*sera jugée, et mergée sous grant, dès que `v2` sera réparée/);
    assert.doesNotMatch(commentaires(), /Pass — rouge/);

    // Le correctif arrive sur la base : personne ne touche à la livraison.
    essais.base = "vert";
    essais["jugement-17"] = "vert";
    base.tete = "base-2";
    await jusquAu("merge.done");

    assert.deepEqual(histoire(), ["pass.waiting", "pass.judged", "grant.used", "merge.done"]);
    assert.deepEqual(
      verdicts().map(({ base, verdict }) => [base, verdict]),
      [["base-2", "green"]],
    );
    assert.deepEqual([cooks().length, compter("pass.returned")], [1, 0]);
  });

  test("rouge une fois fusionnée, la base verte seule : c'est le rouge de la livraison, elle est renvoyée — et la base, jugée sur cette tête, n'est pas rejouée au renvoi suivant", async (t) => {
    const { gates, dernier, histoire, compter, jusquAu, essai } = service(t, { essais: { "jugement-17": "rouge" }, scenario: "bavard", suite: ["livre", "livre"] });
    await jusquAu("pass.returned", 2);

    assert.deepEqual(histoire(), ["pass.judged", "pass.returned", "pass.judged", "pass.returned"]);
    assert.deepEqual([compter("base.checked"), dernier("base.checked")?.outcome], [1, "green"]);
    assert.deepEqual(gates.appels(), [essai("jugement-17"), essai("base"), essai("jugement-17")]);
  });

  test("une fusion qui ne se fait pas n'est pas un rouge de tests : sans gates ni relecture, le cook est renvoyé se mettre à jour de la base — une consigne qu'il peut suivre", async (t) => {
    const lieu = service(t, { scenario: "bavard", suite: ["livre"] });
    lieu.fusion.conflit = true;
    const { gh, gates, dernier, verdicts, relectures, compter, jusquAu } = lieu;
    await jusquAu("pass.returned");

    assert.deepEqual(dernier("pass.returned", 17)?.findings, [
      "Conflit avec `v2` : ta branche ne s'y fusionne plus, et c'est sa fusion avec `v2` que la pass juge. Mets-toi à jour de la base : `git fetch origin v2`, puis rebase ta branche sur `origin/v2`, résous les conflits, et rejoue les gates.",
    ]);
    const [verdict] = verdicts();
    assert.deepEqual([verdict?.verdict, verdict?.base, verdict?.merged, (verdict?.gates as { outcome: string }).outcome], ["red", "base-1", null, "skipped"]);
    assert.deepEqual([gates.appels().length, relectures().length, compter("base.checked"), gh.merges.length], [0, 0, 0, 0]);
  });

  test("une fusion qui échoue sans conflit est une panne de la machine : ni verdict ni renvoi, la pass le dit et y revient — et juge quand la panne est levée", async (t) => {
    const lieu = service(t);
    lieu.fusion.panne = "git merge : gpg failed to sign the data";
    const { gh, cooks, fusion, histoire, avertissements, jusquAu, laisserTourner } = lieu;
    await jusqua(() => avertissements.some((ligne) => /la pass a buté sur le ticket #17 — git merge : gpg failed to sign the data/.test(ligne)));
    await laisserTourner();

    assert.deepEqual([histoire(), cooks().length, gh.merges.length], [[], 1, 0]);

    fusion.panne = null;
    await jusquAu("merge.done");
    assert.deepEqual(histoire(), ["pass.judged", "grant.used", "merge.done"]);
  });

  test("rejuger consomme la machine : saturée, la livraison dont la base a bougé attend en le disant, et repart seule", async (t) => {
    const pleine: Machine = { ...MACHINE_CALME, charge: 64 };
    let machine = MACHINE_CALME;
    const lieu = service(t, {
      machine: () => machine,
      // La base bouge et la machine sature une fois la livraison jugée : le cook, lui, est parti.
      apresFusion: (combien) => {
        if (combien !== 1) return;
        lieu.base.tete = "base-2";
        machine = pleine;
      },
    });
    const { gates, histoire, pass, jusquAu, laisserTourner, commentaires } = lieu;
    await jusquAu("pass.waiting");
    await laisserTourner();

    assert.deepEqual([pass()?.phase, pass()?.reason, pass()?.verdict, gates.appels().length], ["waiting", "machine-saturated", "green", 1]);
    assert.deepEqual(histoire(), ["pass.judged", "pass.waiting"]);
    assert.match(commentaires(), /en attente \(`machine-saturated`\)[\s\S]*`v2` a bougé depuis le verdict[\s\S]*\(`base-2`\)[\s\S]*charge de 64 pour 12 au plus/);

    machine = MACHINE_CALME;
    await jusquAu("merge.done");
    assert.deepEqual(histoire(), ["pass.judged", "pass.waiting", "pass.judged", "grant.used", "merge.done"]);
  });

  test("un runtime tué pendant un jugement ne laisse pas son worktree jetable : au redémarrage il est retiré, le jugement repris, et rien n'est mergé deux fois", async (t) => {
    const premiere = service(t, { essais: { "jugement-17": "lent" } });
    await jusqua(() => premiere.gates.appels().length === 1);
    assert.equal(premiere.pass()?.phase, "judging");
    premiere.runtime.arreter("test");
    assert.deepEqual(premiere.gh.merges, []);
    // Arrêté ou tué, il laisse son worktree jetable — et celui de la base,
    // s'il la contrôlait.
    mkdirSync(premiere.essai("jugement-17"), { recursive: true });
    mkdirSync(premiere.essai("base"), { recursive: true });

    const { gh, journal, compter, jusquAu, essai } = service(t, { lieux: premiere.lieux });
    assert.deepEqual([existsSync(essai("jugement-17")), existsSync(essai("base"))], [false, false]);
    await jusquAu("merge.done");

    assert.deepEqual([gh.merges.length, compter("pass.judged")], [1, 1]);
    assert.equal(journal.tout().filter((e) => e.type === "grant.used").length, 1);
    assert.equal(existsSync(essai("jugement-17")), false);
  });

  test("un dépôt qui exige une branche à jour refuse le merge : ce refus-là n'arrête pas la pass, il repart au cook avec la même consigne — se mettre à jour de la base", async (t) => {
    const { gh, dernier, histoire, pass, jusquAu } = service(t, { scenario: "bavard", suite: ["livre"] });
    gh.merge.mode = { refus: "HTTP 405 — Head branch is out of date" };
    const lecture = gh.github.prDeBranche;
    gh.github.prDeBranche = async (branche) => {
      const pr = await lecture(branche);
      return pr && { ...pr, enRetard: gh.merges.length > 0 };
    };
    await jusquAu("pass.returned");

    assert.deepEqual(histoire(), ["pass.judged", "grant.used", "merge.failed", "pass.outdated", "pass.returned"]);
    assert.match(String((dernier("pass.returned", 17)?.findings as string[])[0]), /^Branche en retard sur `v2` : le dépôt exige une branche à jour pour merger, et GitHub a refusé \(HTTP 405 — Head branch is out of date\)\. Mets-toi à jour de la base : `git fetch origin v2`, puis rebase ta branche sur `origin\/v2`, et rejoue les gates\.$/);
    assert.deepEqual([gh.merges.length, pass()?.returns], [1, 1]);
  });

  test("une livraison verte que GitHub refuse de merger faute d'être à jour compte parmi ce qui a été tenté : le manager, à qui la pass passe la main, lit qu'il fallait se mettre à jour de la base", async (t) => {
    const lieu = service(t, { manager: { jugement: "reagit-remonte" } });
    chef(lieu.repertoire, "manager.enabled");
    // Deux livraisons rouges d'elles-mêmes, puis une verte que GitHub refuse.
    lieu.gates.regler("rouge");
    await lieu.jusquAu("pass.returned", 2);
    lieu.gates.regler("vert");
    lieu.gh.merge.mode = { refus: "HTTP 405 — Head branch is out of date" };
    const lecture = lieu.gh.github.prDeBranche;
    lieu.gh.github.prDeBranche = async (branche) => {
      const pr = await lecture(branche);
      return pr && { ...pr, enRetard: lieu.gh.merges.length > 0 };
    };
    await lieu.jusquAu("manager.reacted", 2);

    assert.deepEqual(lieu.histoire().slice(-3), ["pass.outdated", "pass.deferred", "pass.escalated"]);
    const jugement = lieu.relectures().at(-1)?.args.join("\n") ?? "";
    assert.match(jugement, /3\. `sonnet` \/ `low` — pass rouge :\nBranche en retard sur `v2`[\s\S]*Mets-toi à jour de la base/);
    await jusqua(() => /remontée au chef/.test(lieu.commentaires()));
    assert.match(lieu.commentaires(), /\*\*Ce qui a été tenté\.\*\*[\s\S]*3\. `sonnet` \/ `low` — pass rouge :\n\n {3}Branche en retard sur `v2`/);
  });
});

describe("la base elle-même, rouge ou mergée hors du runtime", { concurrency: 8 }, () => {
  test("un merge fait à la main n'a été jugé sur aucune base : les gates sont jouées sur la base seule, hors ticket — vertes, rien n'est retenu", async (t) => {
    const { journal, gh, gates, dernier, jusquAu, essai } = service(t, { aLaMain: true });
    await jusquAu("base.checked");

    assert.deepEqual([dernier("merge.done", 17)?.by, dernier("merge.done", 17)?.unverified, gh.merges.length], ["outside", true, 0]);
    assert.deepEqual(gates.appels().slice(1), [essai("base")]);
    const controle = journal.tout().find((e) => e.type === "base.checked");
    assert.deepEqual([controle?.ticket, controle?.author], [null, "pass"]);
    assert.deepEqual(controle?.payload, { sha: "base-1", outcome: "green", gates: { outcome: "green", code: 0, failures: [], tail: "ok    tests du projet\ngates : VERT" }, tickets: [17] });
    assert.deepEqual([etatDeLaBase(journal.base)?.outcome, mergesAVerifier(journal.base)], ["green", []]);
    assert.equal(existsSync(essai("base")), false);
  });

  test("le plafond de durée des gates, seul rouge sur la base, ne la rend pas rouge", async (t) => {
    const { journal, dernier, avertissements, jusquAu, laisserTourner, commentaires } = service(t, { aLaMain: true, essais: { base: "plafond" } });
    await jusquAu("base.checked");
    const controle = dernier("base.checked");
    assert.deepEqual([controle?.outcome, (controle?.gates as { outcome: string }).outcome, (controle?.gates as { code: number }).code], ["green", "green", 1]);
    assert.deepEqual([etatDeLaBase(journal.base)?.outcome, mergesAVerifier(journal.base)], ["green", []]);
    assert.equal(avertissements.filter((ligne) => /plafond des gates franchi sur v2 \(base-1\), non jugé — 178,3 s de processeur pour un plafond de 165 s : la base n'est pas vue rouge pour lui/.test(ligne)).length, 1);
    await laisserTourner();
    assert.equal(avertissements.some((ligne) => /ROUGE/.test(ligne)), false);
    assert.doesNotMatch(commentaires(), /est rouge après merge/);
  });

  test("un merge à la main casse la base : c'est vu et dit sur son issue, plus rien n'est jugé ni mergé, les livraisons des cooks déjà partis attendent sans verdict — et sont jugées seules quand la base est réparée", async (t) => {
    // Une base rouge retient la station : seuls des cooks partis avant le
    // verdict livrent dessus. Le contrôle de la base attend donc qu'ils aient livré.
    let controler = () => {};
    const livres = new Promise<void>((resoudre) => (controler = resoudre));
    const { journal, gh, gates, base, essais, avertissements, dernier, histoire, verdicts, pass, compter, jusquAu, laisserTourner, essai, commentaires } = service(t, {
      aLaMain: true,
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
    assert.match(avertissements.join("\n"), /v2 est ROUGE \(base-1 — merges à vérifier : #17\) — jugements et merges sont suspendus/);
    await jusqua(() => /est rouge après merge/.test(commentaires()));
    assert.match(commentaires(), /\*\*Pass — `v2` est rouge après merge\.\*\* `base-1`[\s\S]*Ce merge s'est fait hors du runtime[\s\S]*FAIL {2}tests du projet en échec[\s\S]*ne juge ni ne merge plus rien/);

    // Les livraisons suivantes ne sont pas jugées : elles attendent, sans gates ni renvoi.
    await jusquAu("pass.waiting", 2);
    await laisserTourner();
    assert.deepEqual(histoire(18), ["pass.waiting"]);
    assert.deepEqual([pass(18)?.phase, pass(18)?.reason, gh.merges.length, compter("pass.waiting"), compter("base.checked")], ["waiting", "base-red", 0, 2, 1]);
    assert.deepEqual(gates.appels().slice(1), [essai("base")]);
    assert.match(commentaires(18), /en attente \(`base-red`\)[\s\S]*`v2` est rouge[\s\S]*sera jugée, et mergée sous grant, dès que `v2` sera réparée/);

    // Une livraison qui attend se merge à la main, comme son issue le dit : la
    // pass le voit, sert le ticket, et rejoue les gates de la base — toujours rouge.
    gh.mergerPR(102);
    await jusqua(() => gh.fermetures.includes(18));
    assert.deepEqual(histoire(18), ["pass.waiting", "merge.done"]);
    assert.deepEqual([dernier("merge.done", 18)?.by, dernier("merge.done", 18)?.unverified, gh.merges.length], ["outside", true, 0]);
    await jusquAu("base.checked", 2);
    assert.deepEqual([dernier("base.checked")?.outcome, dernier("base.checked")?.tickets, pass(19)?.phase], ["red", [18], "waiting"]);

    // Le chef répare : la base bouge, ses gates sont rejouées, et ce qui attendait est jugé puis mergé.
    essais.base = "vert";
    base.tete = "base-2";
    await jusquAu("merge.done", 3);
    assert.deepEqual(histoire(19), ["pass.waiting", "pass.judged", "grant.used", "merge.done"]);
    assert.deepEqual(verdicts(19).map(({ base, verdict }) => [base, verdict]), [["base-2", "green"]]);
    assert.match(avertissements.join("\n"), /v2 n'est plus rouge \(base-2\) — jugements et merges reprennent/);
    await jusqua(() => etatDeLaBase(journal.base)?.outcome === "green" && mergesAVerifier(journal.base).length === 0);
  });

  test("un contrôle non joué ne lève pas un rouge constaté : la base bouge, ses gates ne peuvent pas se jouer, et rien ne repart — ni merge, ni ticket — jusqu'à un contrôle joué et vert", async (t) => {
    let controler = () => {};
    const livres = new Promise<void>((resoudre) => (controler = resoudre));
    const { journal, gh, base, essais, avertissements, dernier, pass, compter, jusquAu, laisserTourner } = service(t, {
      aLaMain: true,
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
    assert.deepEqual([compter("base.checked"), pass(18)?.phase, pass(18)?.reason, gh.merges.length, dernier("cook.launched", 19)], [2, "waiting", "base-red", 0, undefined]);
    assert.doesNotMatch(avertissements.join("\n"), /n'est plus rouge|a buté sur le contrôle/);
    assert.equal(avertissements.filter((ligne) => /reste ROUGE : ses gates n'ont pas pu être jouées/.test(ligne)).length, 1);

    essais.base = "vert";
    base.tete = "base-3";
    await jusquAu("merge.done", 2);
    await jusqua(() => dernier("cook.launched", 19) !== undefined);
    assert.match(avertissements.join("\n"), /v2 n'est plus rouge \(base-3\)/);
  });

  test("une base jamais vue rouge dont les gates ne peuvent pas se jouer ne retient rien : la station prend le ticket suivant", async (t) => {
    const { journal, gh, avertissements, dernier, compter, jusquAu, laisserTourner } = service(t, {
      aLaMain: true, essais: { base: "impossible" } });
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
    const { journal, repertoire, essais, avertissements, dernier, compter, jusquAu, laisserTourner } = service(t, {
      aLaMain: true, essais: { base: "rouge" } });
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
    const { journal, repertoire, gh, essais, avertissements, dernier, compter, jusquAu, laisserTourner } = service(t, {
      aLaMain: true, essais: { base: "rouge" } });
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
    const lieu = service(t, {
      aLaMain: true, essais: { base: "rouge" }, depot: (depot) => ({ jeter: menageEnPanne(depot, () => lieu.essai("base")) }) });
    const { journal, avertissements, dernier, jusquAu } = lieu;
    await jusquAu("base.checked");

    assert.deepEqual([dernier("base.checked")?.outcome, dernier("base.checked")?.tickets, dernier("base.checked")?.reason], ["red", [17], undefined]);
    assert.deepEqual([etatDeLaBase(journal.base)?.outcome, etatDeLaBase(journal.base)?.reason], ["red", null]);
    assert.match(avertissements.join("\n"), /v2 est ROUGE \(base-1 — merges à vérifier : #17\)/);
    assert.match(avertissements.join("\n"), /le worktree jetable du contrôle de v2 n'a pas pu être retiré — git worktree : fatal: prune impossible/);
  });

  test("un verdict joué n'est pas perdu par un ménage raté : le rejeu demandé par le chef, joué vert, lève le rouge même si son worktree jetable ne se retire pas", async (t) => {
    let panne = false;
    const lieu = service(t, {
      aLaMain: true,
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
    const { journal, repertoire, avertissements, dernier, compter, jusquAu, laisserTourner } = service(t, {
      aLaMain: true, essais: { base: "rouge" }, machine: () => machine });
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
    const lieu = service(t, {
      aLaMain: true,
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
    const lieu = service(t, {
      aLaMain: true,
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
    const lieu = service(t, {
      aLaMain: true,
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

  test("une panne de rapatriement qui change de cause pendant la retenue : le nouveau motif est écrit et dit une fois, la retenue garde sa date, et le même motif répété reste silencieux", async (t) => {
    let panne: string | null = null;
    const lieu = service(t, {
      aLaMain: true,
      essais: { base: "rouge" },
      depot: () => ({
        async rapatrier() {
          if (panne !== null) throw new Error(panne);
          return lieu.base.tete;
        },
      }),
    });
    const { journal, avertissements, dernier, compter, jusquAu, laisserTourner } = lieu;
    await jusquAu("base.checked");

    panne = "git fetch : fatal: Could not resolve host: github.com";
    await jusquAu("base.check-held");
    await laisserTourner();
    const debut = controleRetenu(journal.base);
    assert.deepEqual([compter("base.check-held"), debut?.reason], [1, panne]);

    // Le réseau revient, mais le jeton est refusé : ce n'est plus la même panne.
    panne = "git fetch : fatal: Authentication failed";
    await jusquAu("base.check-held", 2);
    await laisserTourner();
    assert.deepEqual([compter("base.check-held"), compter("base.check-resumed"), dernier("base.check-held")?.reason], [2, 0, panne]);
    assert.deepEqual(controleRetenu(journal.base), { at: debut?.at, reason: panne });
    assert.equal(avertissements.filter((ligne) => /v2 ne se rapatrie pas — git fetch : fatal: Could not resolve host/.test(ligne)).length, 1);
    assert.equal(avertissements.filter((ligne) => /v2 ne se rapatrie toujours pas, mais la panne a changé — git fetch : fatal: Authentication failed/.test(ligne)).length, 1);

    panne = null;
    await jusquAu("base.check-resumed");
    assert.equal(controleRetenu(journal.base), null);
  });
});
