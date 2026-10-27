// La fermeture qui écrit, de bout en bout sur un vrai dépôt git : la passe ne
// part que sur une demande — du chef, ou du runtime sur un déclencheur —, sous
// sa condition d'exécution ; chaque garde-fou l'arrête et le dit ; les zones tiennent dans les deux sens ; et ce
// qu'elle retire arrive par une PR, jamais par un commit sur la base.
import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { principal } from "../../src/closing/command.ts";
import { SANS_MOTIF } from "../../src/closing/brief.ts";
import { ouvrirJournal } from "../../src/journal.ts";
import { chef, PLAFONDS, STATION } from "../aides/cuisine.ts";
import { appeler, BASE, ENV_GIT, git, jusqua } from "../outils.ts";
import type { ReglagesDeFermeture } from "../../src/events/closing.ts";
import { cuisineFermee, REGLAGES_DE_FERMETURE, RETIRER_M1 } from "./kitchen.ts";
import { posixOnly } from "../support/plateforme.ts";

// Chaque test a sa cuisine — état, dépôt, GitHub : ils se jouent de front.
describe("la passe de fermeture, en cuisine", { concurrency: 8 }, () => {
  test("ce que la passe retire arrive par une PR vers la branche d'intégration — aucun commit direct dessus, aucun merge —, et tout ce qu'elle laisse y est écrit avec son motif", { skip: posixOnly("runs the closing pass end to end on a real git repository with the fake claude (a bash script) as the closer; the zone and removal checks read the files it changed differently; on the Windows job: + 'zone' - 'delivered'") }, async (t) => {
    const { demander, fin, closer, gh, journal, origine, clone, teteDeLaBase, branchesDeLOrigine, avertissements } = cuisineFermee(t);
    const avant = teteDeLaBase();
    closer.gestes(RETIRER_M1);
    closer.message("J'ai retiré `inutile`, que rien n'appelle.\n\n<livrable>\nRetiré : M1.\nLAISSÉ D1 : les deux suites se ressemblent mais servent deux modules qui évoluent à part\n</livrable>\n");

    const { code, sortie } = await demander();
    assert.equal(code, 0, sortie);
    assert.match(sortie, /^brigade : closing pass requested — start condition met: 0 cook in flight for a threshold of 1, rail empty\n/);
    const passe = await fin();

    assert.equal(passe.outcome, "delivered");
    assert.equal(passe.removedLines, 1);
    assert.deepEqual(passe.files, ["src/libre/outils.ts"]);
    // La branche d'intégration n'a pas bougé, ni sur l'origine ni dans le clone :
    // la passe n'y a rien poussé, et rien n'a mergé.
    assert.equal(teteDeLaBase(), avant);
    assert.equal(git(clone, "rev-parse", `origin/${BASE}`), avant);
    assert.deepEqual(gh.merges, []);
    assert.deepEqual(journal.tout().filter((e) => e.type.startsWith("merge.") || e.type === "grant.used"), []);
    // Son travail est sur sa branche à elle, poussée, à un commit de la base.
    const branche = passe.branch ?? "";
    assert.deepEqual(branchesDeLOrigine(), [branche, BASE].sort());
    assert.match(branche, /^cook\/fermeture-[0-9a-f]{8}$/);
    assert.equal(git(origine, "rev-list", "--count", `${BASE}..${branche}`), "1");
    assert.equal(git(origine, "show", `${branche}:src/libre/outils.ts`), "export function vivant() { return 1; }");
    // Et dans une PR vers la base — une seule, que rien ici ne merge.
    assert.equal(gh.prs.length, 1);
    const [pr] = gh.prs;
    assert.equal(pr?.base, BASE);
    assert.equal(pr?.branche, branche);
    assert.equal(passe.pr, "https://github.com/acme/brigade/pull/101");
    const corps = pr?.corps ?? "";
    assert.match(corps, /ne merge rien : ce qu'elle retire arrive par cette PR/);
    assert.match(corps, /## Retiré — 1 sur 2 exports morts\n\n- \*\*M1\*\* — export `inutile` of `src\/libre\/outils\.ts:2` — referenced nowhere\n/);
    assert.match(corps, /## Factorisé — 0 sur 1 doublon\n\nAucun doublon n'a été réuni\.\n/);
    assert.match(corps, /## Lignes gagnées — 1\n\n1 ligne retirée, aucune ajoutée, dans 1 fichier : 1 ligne de moins\./);
    // Ce qu'elle a laissé : ce que le closer dit, avec son motif — et ce qu'il
    // n'a pas nommé mais que sa branche porte encore, dit sans motif.
    assert.match(corps, /## Laissé faute d'être sûr — 2\n/);
    assert.match(corps, /- \*\*D1\*\* — 8 identical lines of code: `src\/libre\/a\.ts:1-8` = `src\/libre\/b\.ts:1-8`\n {2}- les deux suites se ressemblent mais servent deux modules qui évoluent à part\n/);
    assert.ok(corps.includes(`- **M2** — export \`oublie\` of \`src/tenu/outils.ts:2\` — referenced nowhere\n  - ${SANS_MOTIF}`), corps);
    assert.deepEqual(
      passe.kept?.map(({ id, reason, before }) => [id, reason, before]),
      [
        ["D1", "les deux suites se ressemblent mais servent deux modules qui évoluent à part", false],
        ["M2", null, false],
      ],
    );
    assert.match(avertissements.join("\n"), /passe de fermeture fermeture-[0-9a-f]{8} — livrée : 1 ligne retirée dans 1 fichier, 2 candidats laissés faute d'être sûr/);
    // Le closer est parti une fois, dans son worktree, sous la station « closer ».
    assert.equal(closer.lancements().length, 1);
    const lancement = journal.tout().find((e) => e.type === "cook.launched");
    assert.equal(lancement?.ticket, null);
    assert.equal((lancement?.payload as { station?: string }).station, "closer");
    assert.match(closer.consigne(), /- M1 — export `inutile`/);
  });

  test("un doublon que le closer réunit en un seul endroit est dit factorisé, à côté du code mort supprimé, avec les lignes gagnées et ce qui est laissé — une entrée par candidat, son lieu et son motif", { skip: posixOnly("has the fake claude (a bash script) factor a duplicate and remove dead code on a real git repository, then commit it all with `git add -A`; the closing pass on the Windows job judges such a closer's files out of its zone (+ 'zone' - 'delivered'), as for the delivery test above") }, async (t) => {
    const { demander, fin, closer, gh } = cuisineFermee(t);
    // `b.ts` appelle ce que `a.ts` garde, au lieu d'en porter la copie ; `inutile` part.
    closer.gestes(
      [`printf 'export const partage = 1;\\n' >>src/libre/a.ts`, `printf 'import { partage } from "./a.ts";\\nconsole.log(partage);\\n' >src/libre/b.ts`, RETIRER_M1].join("\n"),
    );
    closer.message("<livrable>\nFactorisé : D1, dans `src/libre/a.ts`. Supprimé : M1.\nLAISSÉ M2 : lu par convention par le framework de tests\n</livrable>\n");

    const { code, sortie } = await demander();
    assert.equal(code, 0, sortie);
    const passe = await fin();
    assert.equal(passe.outcome, "delivered");
    assert.deepEqual([passe.removedLines, passe.addedLines], [9, 3]);
    assert.deepEqual(passe.removed?.map(({ id }) => id), ["D1", "M1"]);
    const corps = gh.prs[0]?.corps ?? "";
    // Les quatre parties, dans cet ordre.
    const parties = [...corps.matchAll(/^## (.+) — /gm)].map(([, titre]) => titre);
    assert.deepEqual(parties, ["Retiré", "Factorisé", "Lignes gagnées", "Laissé faute d'être sûr"]);
    assert.match(corps, /## Retiré — 1 sur 2 exports morts\n\n- \*\*M1\*\* — export `inutile`/);
    assert.match(corps, /## Factorisé — 1 sur 1 doublon\n\n- \*\*D1\*\* — 8 identical lines of code: `src\/libre\/a\.ts:1-8` = `src\/libre\/b\.ts:1-8`\n/);
    assert.match(corps, /## Lignes gagnées — 6\n\n9 lignes retirées, 3 ajoutées, dans 3 fichiers : 6 lignes de moins\./);
    assert.match(corps, /## Laissé faute d'être sûr — 1\n\n- \*\*M2\*\* — export `oublie` of `src\/tenu\/outils\.ts:2` — referenced nowhere\n {2}- lu par convention par le framework de tests\n/);
    const json = /```json\n([\s\S]*?)\n```/.exec(corps)?.[1] ?? "null";
    assert.deepEqual(JSON.parse(json), [{ id: "M2", location: ["src/tenu/outils.ts:2"], reason: "lu par convention par le framework de tests" }]);
  });

  // Rien n'est parti : ni closer, ni lancement gardé, ni branche, ni PR.
  function rienNEstParti({ closer, journal, gh, branchesDeLOrigine }: ReturnType<typeof cuisineFermee>): void {
    assert.deepEqual(closer.lancements(), []);
    assert.deepEqual(journal.tout().filter((e) => e.type === "cook.launched" || e.type === "closing.started"), []);
    assert.deepEqual(gh.prs, []);
    assert.deepEqual(branchesDeLOrigine(), [BASE]);
  }

  // Une passe arrêtée ne livre rien : ni branche poussée, ni PR, et la base n'a pas bougé.
  function rienNEstLivre({ gh, branchesDeLOrigine }: ReturnType<typeof cuisineFermee>): void {
    assert.deepEqual(gh.prs, []);
    assert.deepEqual(branchesDeLOrigine(), [BASE]);
  }

  test("sans la commande du chef ni déclencheur — vingt merges, un seuil franchi —, aucune passe qui écrit ne démarre : pas sur une horloge", async (t) => {
    const cuisine = cuisineFermee(t);
    const { journal, types } = cuisine;
    cuisine.closer.gestes(RETIRER_M1);
    const seuils = { tests: null, testsSeconds: null, gatesSeconds: null, contextKb: null, repoMb: null, merges: 1, growthPercent: null };
    journal.ajouter({ project: "brigade", ticket: null, author: "runtime", type: "drift.configured", payload: { limits: seuils } });
    // Le runtime a laissé passer dix ticks, sans merge ni seuil franchi.
    const vus = types().filter((type) => type === "runtime.ticked").length;
    await jusqua(() => types().filter((type) => type === "runtime.ticked").length >= vus + 10);

    rienNEstParti(cuisine);
    // Le seul fait de la fermeture au journal : ses réglages.
    assert.deepEqual(types().filter((type) => type.startsWith("closing.")), ["closing.configured"]);
  });

  test("demandée avec trop de cooks en vol, la passe attend et dit la condition qui manque et la valeur mesurée ; sous le seuil, elle part seule — sans rien toucher de ce que le cook en vol tient", { skip: posixOnly("runs the closing pass end to end on a real git repository with the fake claude (a bash script) as the closer; the zone and removal checks read the files it changed differently; on the Windows job: + 'zone' - 'delivered'") }, async (t) => {
    const cuisine = cuisineFermee(t, { reglages: { cooksBelow: 2 } });
    const { runtime, demander, dernier, poser, closer, fin, gh, types } = cuisine;
    await poser(7, "src/tenu");
    await poser(8, "docs");
    assert.equal(runtime.rail.prendre(STATION)?.ticket, 7);
    assert.equal(runtime.rail.prendre(STATION)?.ticket, 8);
    closer.gestes(RETIRER_M1);

    const demandee = await demander();
    assert.equal(demandee.code, 0, demandee.sortie);
    assert.match(
      demandee.sortie,
      /^brigade : closing pass requested — it waits: start condition not met: 2 cooks in flight for a threshold of 2 — the pass leaves when there are fewer than the threshold, or when the rail is empty \(it carries 2 unserved tickets\)\n/,
    );
    assert.match(demandee.sortie, /the runtime starts it on its own, once, as soon as nothing holds it back — nothing to watch, nothing to restart/);
    assert.match(demandee.sortie, /to withdraw it before it leaves: `brigade <projet> closing cancel`/);
    // Le runtime l'a relue à dix ticks : elle attend, rien n'est refusé, rien n'est parti.
    const vus = types().filter((type) => type === "runtime.ticked").length;
    await jusqua(() => types().filter((type) => type === "runtime.ticked").length >= vus + 10);
    assert.equal(dernier("closing.refused"), undefined);
    rienNEstParti(cuisine);

    // Un cook de moins : elle part, sans que le chef la redemande.
    runtime.rail.rendre(8, "essai", STATION);
    const passe = await fin();
    assert.deepEqual(types().filter((type) => type === "closing.requested"), ["closing.requested"]);
    assert.equal(passe.outcome, "delivered");
    // Ce que le cook du ticket #7 tient ne lui a pas été proposé : elle tient le
    // reste, et la PR dit ce qu'elle a écarté, et pourquoi.
    const partie = dernier("closing.started");
    assert.deepEqual(partie?.zone, ["src/libre/a.ts", "src/libre/b.ts", "src/libre/outils.ts"]);
    assert.deepEqual(partie?.held, ["src/tenu"]);
    assert.equal(partie?.candidates, 2);
    assert.doesNotMatch(closer.consigne(), /oublie|src\/tenu/);
    assert.deepEqual(passe.files, ["src/libre/outils.ts"]);
    assert.match(gh.prs[0]?.corps ?? "", /## Écarté avant la passe — 1\n\n- \*\*M2\*\* — export `oublie` of `src\/tenu\/outils\.ts:2` — referenced nowhere\n {2}- `src\/tenu\/outils\.ts` is held by ticket #7 \(zone `src\/tenu`\)/);
  });

  test("un cook en vol qui ne déclare aucune zone tient tout : la passe attend qu'il ait fini, en le nommant", { skip: posixOnly("runs the closing pass end to end on a real git repository with the fake claude (a bash script) as the closer; the zone and removal checks read the files it changed differently; on the Windows job: + 'zone' - 'delivered'") }, async (t) => {
    const cuisine = cuisineFermee(t, { reglages: { cooksBelow: 2 } });
    cuisine.closer.gestes(RETIRER_M1);
    await cuisine.poser(9);
    assert.equal(cuisine.runtime.rail.prendre(STATION)?.ticket, 9);

    const { code, sortie } = await cuisine.demander();
    assert.equal(code, 0, sortie);
    assert.match(sortie, /it waits: start condition not met: the cook in flight on #9 declares no zone/);
    const vus = cuisine.types().filter((type) => type === "runtime.ticked").length;
    await jusqua(() => cuisine.types().filter((type) => type === "runtime.ticked").length >= vus + 5);
    rienNEstParti(cuisine);

    cuisine.runtime.rail.rendre(9, "essai", STATION);
    assert.equal((await cuisine.fin()).outcome, "delivered");
  });

  test("la passe ne modifie aucun fichier de la zone d'un cook en vol : un closer qui y écrit quand même ne livre rien", { skip: posixOnly("runs the closing pass end to end on a real git repository with the fake claude (a bash script) as the closer; the zone and removal checks read the files it changed differently; on the Windows job: + '.claude/brigade/gates.sh', 'src/tenu/outils.ts'") }, async (t) => {
    const cuisine = cuisineFermee(t, { reglages: { cooksBelow: 2 } });
    const { runtime, demander, poser, closer, fin, origine, avertissements } = cuisine;
    await poser(7, "src/tenu");
    assert.equal(runtime.rail.prendre(STATION)?.ticket, 7);
    // Il retire M1, qu'on lui a proposé — et M2, dans la zone du ticket #7.
    closer.gestes("effacer inutile src/libre/outils.ts\neffacer oublie src/tenu/outils.ts\ncommiter\n");

    assert.equal((await demander()).code, 0);
    const passe = await fin();
    assert.equal(passe.outcome, "zone");
    assert.deepEqual(passe.files, ["src/tenu/outils.ts"]);
    assert.match(avertissements.join("\n"), /arrêtée à la livraison : elle a écrit hors de ce qu'elle tenait \(`src\/tenu\/outils\.ts`\) ; elle a écrit dans ce qu'un cook tient \(`src\/tenu\/outils\.ts`\) — rien n'est livré/);
    rienNEstLivre(cuisine);
    assert.equal(git(origine, "show", `${BASE}:src/tenu/outils.ts`), "export function garde() { return 3; }\nexport function oublie() { return 4; }");
    // Un closer qui écrit ce qu'il ne tenait pas a échoué : le disjoncteur le compte.
    assert.equal((cuisine.journal.tout().find((e) => e.type === "cook.exited")?.payload as { outcome?: string }).outcome, "failed");
  });

  test("un cook ne peut pas démarrer sur un fichier que la passe tient : son ticket attend qu'elle ait fini, et un ticket d'une autre zone part", { skip: posixOnly("runs the closing pass end to end on a real git repository with the fake claude (a bash script) as the closer; the zone and removal checks read the files it changed differently; on the Windows job: + 'zone' - 'delivered'") }, async (t) => {
    const cuisine = cuisineFermee(t, { station: true });
    const { demander, poser, closer, fin, types, etat } = cuisine;
    closer.gestes(`attendre\n${RETIRER_M1}`);
    assert.equal((await demander()).code, 0);
    await jusqua(() => closer.lancements().length === 1);

    // Le ticket #8, le premier dans l'ordre de service, veut ce que la passe tient.
    await poser(8, "src/libre");
    await poser(9, "src/ailleurs");
    await jusqua(() => etat(9) === "pass");
    assert.equal(etat(8), "waiting");
    assert.ok(!types(8).includes("ticket.taken"));
    assert.ok(!types().includes("closing.ended"));

    // La passe finie, elle ne tient plus rien : le ticket part.
    closer.feu();
    assert.equal((await fin()).outcome, "delivered");
    await jusqua(() => types(8).includes("ticket.taken"));
  });

  test("la passe s'arrête et le dit quand son plafond de tokens est atteint — le sien, par passe, pas celui d'un cook", async (t) => {
    const cuisine = cuisineFermee(t, { reglages: { tokens: 500 } });
    const { demander, closer, fin, journal, avertissements, clone, repertoire } = cuisine;
    closer.gestes("assistant 600\nattendre\n");

    assert.equal((await demander()).code, 0);
    const passe = await fin();
    assert.deepEqual([passe.outcome, passe.observed, passe.limit], ["tokens", 610, 500]);
    const lancement = journal.tout().find((e) => e.type === "cook.launched")?.payload as { limits: { tokens: number; turns: number } };
    assert.deepEqual([lancement.limits.tokens, lancement.limits.turns], [500, PLAFONDS.turns]);
    assert.deepEqual(
      journal.tout().flatMap((e) => (e.type === "guard.tripped" ? [[e.payload.reason, e.payload.limit, e.payload.observed]] : [])),
      [["tokens", 500, 610]],
    );
    assert.match(avertissements.join("\n"), /— arrêtée : plafond de tokens de la passe atteint \(610 pour un plafond de 500\) — rien n'est livré/);
    rienNEstLivre(cuisine);
    // Et le chef le lit là où il observe.
    const appel = appeler(principal, [], { ...ENV_GIT, BRIGADE_REPO_DIR: clone, BRIGADE_BASE_BRANCH: BASE, BRIGADE_STATE_DIR: repertoire });
    assert.equal(await appel.fin, 0, appel.sortie());
    assert.match(appel.sortie(), /\npass {7}fermeture-[0-9a-f]{8}, on 2026-10-08 10:00 — stopped: the closing's token cap reached \(610 for a cap of 500\) — nothing is delivered\n/);
  });

  test("la passe s'arrête et le dit quand son plafond de retraits est atteint, pendant qu'elle range", { skip: posixOnly("runs the closing pass end to end on a real git repository with the fake claude (a bash script) as the closer; the zone and removal checks read the files it changed differently; on the Windows job: 'removals', + 9, - 8,") }, async (t) => {
    const cuisine = cuisineFermee(t, { reglages: { removedLines: 3 } });
    const { demander, closer, fin, journal, avertissements } = cuisine;
    // Huit lignes retirées, pas encore commitées, et il continue.
    closer.gestes("rm src/libre/a.ts\nattendre\n");

    assert.equal((await demander()).code, 0);
    const passe = await fin();
    assert.deepEqual([passe.outcome, passe.observed, passe.limit], ["removals", 8, 3]);
    assert.deepEqual(
      journal.tout().flatMap((e) => (e.type === "guard.tripped" ? [[e.payload.reason, e.payload.limit, e.payload.observed]] : [])),
      [["removals", 3, 8]],
    );
    assert.match(avertissements.join("\n"), /— arrêtée : plafond de retraits de la passe atteint \(8 lignes pour un plafond de 3 lignes\) — rien n'est livré/);
    rienNEstLivre(cuisine);
  });

  test("un closer qui finit en ayant retiré plus que son plafond ne livre rien", { skip: posixOnly("runs the closing pass end to end on a real git repository with the fake claude (a bash script) as the closer; the zone and removal checks read the files it changed differently; on the Windows job: 'removals', + 9, - 8,") }, async (t) => {
    const cuisine = cuisineFermee(t, { reglages: { removedLines: 3 } });
    cuisine.closer.gestes("git rm -q src/libre/a.ts\ncommiter\n");

    assert.equal((await cuisine.demander()).code, 0);
    const passe = await cuisine.fin();
    assert.deepEqual([passe.outcome, passe.observed, passe.limit], ["removals", 8, 3]);
    rienNEstLivre(cuisine);
  });

  test("la passe s'arrête et le dit après l'inactivité : un closer qui se tait est arrêté par la minuterie de tout cook", async (t) => {
    const cuisine = cuisineFermee(t, { plafonds: { idleMs: 300 } });
    cuisine.closer.gestes("attendre\n");

    assert.equal((await cuisine.demander()).code, 0);
    const passe = await cuisine.fin();
    assert.deepEqual([passe.outcome, passe.limit], ["idle", 300]);
    assert.match(cuisine.avertissements.join("\n"), /— arrêtée : inactive \(rien produit depuis [\d.]+ s pour un plafond de 0\.3 s\) — rien n'est livré/);
    rienNEstLivre(cuisine);
  });

  test("la passe s'arrête et le dit sur le « stop » du chef, et aucune ne repart tant que la cuisine est arrêtée", async (t) => {
    const cuisine = cuisineFermee(t);
    const { demander, closer, fin, repertoire, avertissements } = cuisine;
    closer.gestes(`attendre\n${RETIRER_M1}`);
    assert.equal((await demander()).code, 0);
    await jusqua(() => closer.lancements().length === 1);

    chef(repertoire, "kitchen.stopped");
    assert.equal((await fin()).outcome, "stop");
    assert.match(avertissements.join("\n"), /— arrêtée par le « stop » du chef — rien n'est livré/);
    rienNEstLivre(cuisine);

    const { code, sortie } = await demander();
    assert.equal(code, 1);
    assert.match(sortie, /closing pass refused, nothing is started — the kitchen has been stopped by the chef since /);
    assert.equal(closer.lancements().length, 1);
  });

  test("la passe s'arrête et le dit sur disjoncteur : ouvert pendant qu'elle range, il l'arrête ; ouvert, aucune ne part", async (t) => {
    const cuisine = cuisineFermee(t);
    const { demander, closer, fin, repertoire, avertissements } = cuisine;
    closer.gestes(`attendre\n${RETIRER_M1}`);
    assert.equal((await demander()).code, 0);
    await jusqua(() => closer.lancements().length === 1);

    // Trois échecs d'affilée ailleurs dans la cuisine : le disjoncteur s'ouvre.
    const journal = ouvrirJournal(repertoire);
    journal.ajouter({ project: "brigade", ticket: null, author: "runtime", type: "breaker.opened", payload: { failures: 3, threshold: 3 } });
    journal.fermer();
    assert.equal((await fin()).outcome, "breaker");
    assert.match(avertissements.join("\n"), /— arrêtée : le disjoncteur est ouvert — rien n'est livré/);
    rienNEstLivre(cuisine);

    const { code, sortie } = await demander();
    assert.equal(code, 1);
    assert.match(sortie, /closing pass refused, nothing is started — the breaker has been open since /);
    assert.equal(closer.lancements().length, 1);
  });

  test("une seule passe à la fois : demandée pendant qu'une autre range, la commande refuse", { skip: posixOnly("runs the closing pass end to end on a real git repository with the fake claude (a bash script) as the closer; the zone and removal checks read the files it changed differently; on the Windows job: + 'zone' - 'delivered'") }, async (t) => {
    const cuisine = cuisineFermee(t);
    const { demander, closer, fin } = cuisine;
    closer.gestes(`attendre\n${RETIRER_M1}`);
    assert.equal((await demander()).code, 0);
    await jusqua(() => closer.lancements().length === 1);

    const { code, sortie } = await demander();
    assert.equal(code, 1);
    assert.match(sortie, /a closing pass is already tidying up, or is already requested — only one at a time/);
    closer.feu();
    assert.equal((await fin()).outcome, "delivered");
    assert.equal(closer.lancements().length, 1);
  });

  test("un closer qui ne retire rien ne livre rien : aucune PR, et ce qu'il a laissé reste au journal avec son motif", { skip: posixOnly("runs the closing pass end to end on a real git repository with the fake claude (a bash script) as the closer; the zone and removal checks read the files it changed differently; on the Windows job: 'zone' !== 'nothing'") }, async (t) => {
    const cuisine = cuisineFermee(t);
    cuisine.closer.message("<livrable>\nLAISSÉ M1 : appelé par un script de déploiement hors du dépôt\nLAISSÉ M2 : idem\n</livrable>\n");

    assert.equal((await cuisine.demander()).code, 0);
    const passe = await cuisine.fin();
    assert.equal(passe.outcome, "nothing");
    assert.deepEqual(
      passe.kept?.map(({ id, reason }) => [id, reason]),
      [
        ["D1", null],
        ["M1", "appelé par un script de déploiement hors du dépôt"],
        ["M2", "idem"],
      ],
    );
    rienNEstLivre(cuisine);
  });

  test("sans rien à ranger, sans closer réglé ou sans runtime qui tourne, la commande refuse et rien ne part", async (t) => {
    const propre = cuisineFermee(t, { fichiers: { "src/app.ts": "console.log(1);\n" } });
    assert.equal((await propre.demander()).code, 0);
    await jusqua(() => propre.types().includes("closing.refused"));
    assert.equal(propre.dernier("closing.refused")?.reason, "nothing");
    assert.match(propre.avertissements.join("\n"), /passe de fermeture refusée — rien à ranger — l'observation ne repère ni doublon ni code mort sur `v2`/);
    rienNEstParti(propre);

    const sansCloser = cuisineFermee(t, { reglages: { calibration: null } });
    const refusee = await sansCloser.demander();
    assert.equal(refusee.code, 1);
    assert.match(refusee.sortie, /the closer is not set on this project — `brigade <projet> station closer-modele <model>` and `brigade <projet> station closer-effort <effort>`/);
    rienNEstParti(sansCloser);

    const eteinte = cuisineFermee(t);
    eteinte.runtime.arreter("essai");
    const seule = appeler(principal, ["write"], { BRIGADE_STATE_DIR: eteinte.repertoire });
    assert.equal(await seule.fin, 1);
    assert.match(seule.sortie(), /no runtime is running on this project: the closing pass is not requested/);
    const relu = ouvrirJournal(eteinte.repertoire, { lectureSeule: true });
    t.after(() => relu.fermer());
    assert.ok(!relu.tout().some((e) => e.type === "closing.requested"));
  });

  test("une passe ne survit pas au runtime : celle qu'il a laissée en vol est dite interrompue, et une demande d'une autre vie ne lance rien", { skip: posixOnly("runs the closing pass end to end on a real git repository with the fake claude (a bash script) as the closer; the zone and removal checks read the files it changed differently; on the Windows job: the awaited fact never came (condition never met)") }, async (t) => {
    const premiere = cuisineFermee(t);
    premiere.closer.gestes(`attendre\n${RETIRER_M1}`);
    assert.equal((await premiere.demander()).code, 0);
    await jusqua(() => premiere.closer.lancements().length === 1);
    const run = premiere.dernier("closing.started")?.run;
    premiere.runtime.arreter("essai");
    // Le chef redemande pendant que rien ne tourne — à la main, la commande refuserait.
    const journal = ouvrirJournal(premiere.repertoire);
    journal.ajouter({ project: "brigade", ticket: null, author: "chef", type: "closing.requested", payload: {} });
    journal.fermer();

    const seconde = cuisineFermee(t, { lieux: premiere.lieux });
    assert.deepEqual(
      seconde.journal.tout().flatMap((e) => (e.type === "closing.ended" || e.type === "closing.refused" ? [[e.type, e.type === "closing.ended" ? e.payload.run : e.payload.reason, e.type === "closing.ended" ? e.payload.outcome : null]] : [])),
      [
        ["closing.ended", run, "interrupted"],
        ["closing.refused", "restarted", null],
      ],
    );
    const vus = seconde.types().filter((type) => type === "runtime.ticked").length;
    await jusqua(() => seconde.types().filter((type) => type === "runtime.ticked").length >= vus + 5);
    assert.equal(seconde.closer.lancements().length, 1);
    rienNEstLivre(seconde);

    // Redemandée par la commande, elle part.
    seconde.closer.feu();
    assert.equal((await seconde.demander()).code, 0);
    await jusqua(() => seconde.dernier("closing.ended")?.outcome === "delivered");
  });

  test("une PR que GitHub refuse d'ouvrir n'est pas une livraison : la passe le dit, et la base n'a pas bougé", { skip: posixOnly("runs the closing pass end to end on a real git repository with the fake claude (a bash script) as the closer; the zone and removal checks read the files it changed differently; on the Windows job: 'zone' !== 'failed'") }, async (t) => {
    const cuisine = cuisineFermee(t);
    const avant = cuisine.teteDeLaBase();
    cuisine.gh.pannes.pr = true;
    cuisine.closer.gestes(RETIRER_M1);

    assert.equal((await cuisine.demander()).code, 0);
    const passe = await cuisine.fin();
    assert.equal(passe.outcome, "failed");
    assert.match(passe.detail ?? "", /^sa livraison n'est pas partie — /);
    assert.equal(cuisine.teteDeLaBase(), avant);
    assert.deepEqual(cuisine.gh.prs, []);
  });

  test("le calibrage posé par le chef vaut à la passe suivante, sans redémarrage : le refus le nomme, puis la passe part", { skip: posixOnly("runs the closing pass end to end on a real git repository with the fake claude (a bash script) as the closer; the zone and removal checks read the files it changed differently; on the Windows job: + 'zone' - 'delivered'") }, async (t) => {
    let calibration: ReglagesDeFermeture["calibration"] = null;
    const cuisine = cuisineFermee(t, { reglagesAChaud: () => ({ ...REGLAGES_DE_FERMETURE, calibration }) });
    const { demander, dernier, closer, fin, types, journal } = cuisine;
    closer.gestes(RETIRER_M1);

    const refusee = await demander();
    assert.equal(refusee.code, 1);
    assert.match(refusee.sortie, /`brigade <projet> station closer-modele <model>` and `brigade <projet> station closer-effort <effort>`/);
    assert.doesNotMatch(refusee.sortie, /BRIGADE_CLOSING|redémarrer/);

    // Le chef pose le calibrage : le journal change, le runtime se réveille.
    calibration = { model: "sonnet", effort: "medium" };
    journal.ajouter({ project: "brigade", ticket: null, author: "chef", type: "decision.set", payload: { name: "BRIGADE_CLOSING_EFFORT", value: "medium", previous: null } });
    await jusqua(() => types().includes("closing.configured"));
    const demandee = await demander();
    assert.equal(demandee.code, 0, demandee.sortie);
    assert.equal((await fin()).outcome, "delivered");
    assert.ok(dernier("closing.started"));
  });
});
