// La pass branchée sur un runtime complet : la station livre, la pass juge —
// de fausses gates, un GitHub de test — puis décide sous le grant `merge`.
import assert from "node:assert/strict";
import { join } from "node:path";
import { describe, test, type TestContext } from "node:test";
import { Base } from "../src/base.ts";
import { configPass, consigneDeRenvoi } from "../src/pass.ts";
import { etatDuGrant, passDuTicket, usagesDuGrant } from "../src/projections/pass.ts";
import { ConfigInvalide } from "../src/runtime.ts";
import { chef, cuisine, issue, type Options } from "./aides/cuisine.ts";
import { BASE, DEPOT, jusqua } from "./outils.ts";

const PR = `https://github.com/${DEPOT}/pull/101`;
const charge = (evenement: { payload: unknown }) => evenement.payload as Record<string, unknown>;

// Une cuisine avec sa pass, et un ticket calibré sur le rail.
function service(t: TestContext, options: Options & { grant?: boolean; gates?: "vert" | "rouge" | "lent" } = {}) {
  const lieu = cuisine(t, { pass: true, issues: [issue(17)], ...options });
  if (options.gates) lieu.gates.regler(options.gates);
  if (options.grant) chef(lieu.repertoire, "grant.activated");
  const { journal } = lieu;
  // L'histoire du ticket vue par la pass, sans le bruit des baux et des relevés.
  const histoire = () =>
    journal
      .duTicket(17)
      .map((e) => e.type)
      .filter((type) => /^(pass|grant|merge)\.|^ticket\.(served|released|86|left)$/.test(type));
  const compter = (type: string) => journal.tout().filter((e) => e.type === type).length;
  const jusquAu = (type: string, combien = 1) => jusqua(() => compter(type) >= combien);
  // Laisse passer quelques ticks : de quoi voir ce que la pass ne fait pas.
  const laisserTourner = () => jusquAu("runtime.ticked", compter("runtime.ticked") + 3);
  return { ...lieu, histoire, compter, jusquAu, laisserTourner, pass: () => passDuTicket(journal.base, 17) };
}

// Chaque test a ses lieux — répertoire d'état, GitHub, gates : ils se jouent de front.
describe("la pass", { concurrency: 8 }, () => {
  test("un cook qui livre est jugé sans personne : les gates sont jouées dans son worktree, la CI est lue, le verdict dit ce qui l'a produit", async (t) => {
    const { repertoire, gates, dernier, jusquAu, lancements } = service(t);
    await jusquAu("pass.held");

    const run = String(dernier("cook.launched", 17)?.run);
    assert.deepEqual(gates.appels(), [join(repertoire, "worktrees", run)]);
    const verdict = dernier("pass.judged", 17);
    assert.deepEqual(verdict, {
      run,
      pr: PR,
      number: 101,
      sha: verdict?.sha,
      verdict: "green",
      gates: { outcome: "green", code: 0, failures: [], tail: "ok    tests du projet\ngates : VERT" },
      // Aucun check : un cas nommé, ni vert ni rouge.
      ci: { outcome: "none", checks: [] },
      findings: [],
      judgeModified: false,
    });
    assert.deepEqual(dernier("pass.started", 17), { run, pr: PR, number: 101, sha: verdict?.sha });
    // La pass ne lance aucun modèle : le seul `claude` parti est le cook.
    assert.equal(lancements().length, 1);
  });

  test("verte sans grant : la PR reste ouverte, la pass s'arrête là et le dit", async (t) => {
    const { gh, etat, histoire, pass, jusquAu, journal } = service(t);
    await jusquAu("pass.held");
    await jusqua(() => gh.commentaires.length === 2);

    assert.deepEqual(histoire(), ["pass.started", "pass.judged", "pass.held"]);
    assert.deepEqual(journal.duTicket(17).at(-1)?.payload, { reason: "no-grant" });
    assert.equal(etat(17), "pass");
    assert.deepEqual([pass()?.phase, pass()?.reason, pass()?.returns], ["held", "no-grant", 0]);
    assert.deepEqual(gh.merges, []);
    assert.equal(gh.ouvertes.get(String(pass()?.branch))?.state, "open");
    assert.match(gh.commentaires[1]?.[1] ?? "", /verte, non mergée \(`no-grant`\)[\s\S]*grant `merge` n'est pas actif/);
  });

  test("verte sous grant : le runtime merge lui-même le commit jugé, le ticket est servi, son issue fermée", async (t) => {
    const { gh, etat, histoire, dernier, jusquAu, journal } = service(t, { grant: true });
    await jusquAu("ticket.served");
    await jusqua(() => gh.fermetures.length === 1);

    const verdict = journal.duTicket(17).find((e) => e.type === "pass.judged");
    assert.deepEqual(histoire().slice(0, 5), ["pass.started", "pass.judged", "grant.used", "merge.done", "ticket.served"]);
    assert.deepEqual(gh.merges, [[101, verdict?.payload.sha]]);
    // L'usage du grant dit quel ticket, quelle PR, quel verdict, quand.
    const usage = journal.duTicket(17).find((e) => e.type === "grant.used");
    assert.deepEqual([usage?.ticket, usage?.author, usage?.at], [17, "pass", "2026-10-08T10:00:00.000Z"]);
    assert.deepEqual(usage?.payload, { action: "merge", pr: PR, number: 101, sha: verdict?.payload.sha, base: BASE, verdict: verdict?.seq });
    assert.deepEqual(dernier("merge.done", 17), { pr: PR, sha: verdict?.payload.sha, by: "pass", reconciled: false });
    assert.deepEqual(gh.fermetures, [17]);
    assert.deepEqual(usagesDuGrant(journal.base, 10).map((u) => [u.ticket, u.pr, u.verdict, u.outcome]), [[17, PR, verdict?.seq, "done"]]);
    // L'issue fermée, le sondage sort le ticket du rail.
    await jusqua(() => etat(17) === undefined);
    await jusqua(() => gh.commentaires.some(([, corps]) => /mergée sur `v2` sous le grant `merge`/.test(corps)));
  });

  test("le grant se consulte à chaque décision : révoqué entre deux livraisons, la seconde n'est pas mergée", async (t) => {
    const { repertoire, gh, journal, jusquAu } = service(t, { grant: true });
    await jusquAu("merge.done");

    chef(repertoire, "grant.revoked");
    gh.poser(issue(18));
    await jusquAu("pass.held");

    assert.deepEqual(gh.merges.length, 1);
    assert.deepEqual(journal.duTicket(18).filter((e) => e.type.startsWith("pass.") || e.type.startsWith("grant.")).map((e) => e.type), [
      "pass.started",
      "pass.judged",
      "pass.held",
    ]);
    assert.deepEqual([etatDuGrant(journal.base, "merge")?.active, etatDuGrant(journal.base, "merge")?.by], [false, "chef"]);
  });

  test("le grant n'est pas rétroactif : activé après coup, une livraison déjà arrêtée n'est pas mergée", async (t) => {
    const { repertoire, gh, pass, jusquAu, laisserTourner } = service(t);
    await jusquAu("pass.held");

    chef(repertoire, "grant.activated");
    await laisserTourner();

    assert.deepEqual(gh.merges, []);
    assert.equal(pass()?.phase, "held");
  });

  test("une PR arrêtée que le chef merge à la main : la pass le voit, sert le ticket et ferme l'issue", async (t) => {
    const { gh, dernier, histoire, jusquAu } = service(t);
    await jusquAu("pass.held");

    gh.mergerPR(101);
    await jusqua(() => gh.fermetures.length === 1);

    assert.deepEqual(histoire().slice(0, 5), ["pass.started", "pass.judged", "pass.held", "merge.done", "ticket.served"]);
    assert.deepEqual([dernier("merge.done", 17)?.by, dernier("merge.done", 17)?.reconciled], ["outside", false]);
    assert.deepEqual(gh.merges, []);
  });

  test("gates rouges : rien n'est mergé, les findings repartent à un cook dans le même worktree, sur la même PR", async (t) => {
    const { gh, gates, etat, dernier, lancements, jusquAu, journal } = service(t, { grant: true, gates: "rouge" });
    await jusquAu("pass.returned");
    const premier = dernier("pass.judged", 17);
    gates.regler("vert");
    await jusquAu("merge.done");

    assert.equal(premier?.verdict, "red");
    assert.deepEqual(premier?.gates, {
      outcome: "red",
      code: 1,
      failures: ["FAIL  tests du projet en échec"],
      tail: "ok    JSON valide\nFAIL  tests du projet en échec\ngates : ROUGE",
    });
    assert.deepEqual(premier?.ci, { outcome: "skipped", checks: [] });
    const renvoi = journal.duTicket(17).find((e) => e.type === "pass.returned")?.payload;
    assert.equal(renvoi?.n, 1);
    assert.match(String((renvoi?.findings as string[])[0]), /^Gates rouges : `.claude\/brigade\/gates.sh` est sorti en 1\.\nFAIL {2}tests du projet en échec/);
    // Le ticket est repassé par le rail, et la station l'a repris.
    assert.deepEqual(
      journal.duTicket(17).filter((e) => e.type === "ticket.released").map((e) => [e.author, e.payload.reason]),
      [["runtime", "pass-red"]],
    );
    const [cook, repris] = lancements();
    assert.equal(lancements().length, 2);
    assert.equal(repris?.cwd, cook?.cwd);
    const consigne = repris?.args[(repris?.args.indexOf("-p") ?? 0) + 1] ?? "";
    assert.match(consigne, /renvoi 1 sur 2/);
    assert.match(consigne, /FAIL {2}tests du projet en échec/);
    const lances = journal.duTicket(17).filter((e) => e.type === "cook.launched").map((e) => e.payload);
    assert.deepEqual([lances[1]?.branch, lances[1]?.worktree], [lances[0]?.branch, lances[0]?.worktree]);
    assert.notEqual(lances[1]?.run, lances[0]?.run);
    // Une seule PR, mergée sur le second commit jugé.
    assert.equal(gh.prs.length, 1);
    assert.deepEqual(gh.merges, [[101, dernier("pass.judged", 17)?.sha]]);
    assert.notEqual(dernier("pass.judged", 17)?.sha, premier?.sha);
    assert.match(gh.commentaires.map(([, corps]) => corps).join("\n---\n"), /rouge, renvoi 1\/2[\s\S]*Renvoi 1\/2 de la pass/);
    await jusqua(() => etat(17) === undefined);
  });

  test("au deuxième renvoi resté rouge, la pass cesse de renvoyer et remonte au chef : rien n'est mergé", async (t) => {
    const { gh, etat, histoire, lancements, pass, avertissements, runtime, jusquAu } = service(t, { grant: true, gates: "rouge" });
    await jusquAu("pass.escalated");

    assert.deepEqual(histoire(), [
      "pass.started",
      "pass.judged",
      "pass.returned",
      "ticket.released",
      "pass.started",
      "pass.judged",
      "pass.returned",
      "ticket.released",
      "pass.started",
      "pass.judged",
      "pass.escalated",
      "ticket.86",
    ]);
    assert.equal(lancements().length, 3);
    assert.deepEqual(gh.merges, []);
    assert.deepEqual([pass()?.phase, pass()?.reason, pass()?.returns], ["escalated", "returns-exhausted", 2]);
    const ticket = runtime.rail.tickets().find((x) => x.ticket === 17);
    assert.deepEqual([etat(17), ticket?.reason, ticket?.until], ["86", "pass:returns-exhausted", null]);
    await jusqua(() => gh.commentaires.some(([, corps]) => /rouge après 2 renvois : remontée au chef/.test(corps)));
    assert.equal(avertissements.filter((ligne) => /pass rouge sur le ticket #17/.test(ligne)).length, 3);
  });

  test("un cook de renvoi qui échoue sans rien commiter ne consomme pas de renvoi", async (t) => {
    const { gates, journal, lancements, pass, jusquAu } = service(t, { gates: "rouge", suite: ["livre", "echec", "livre"] });
    await jusquAu("pass.returned");
    gates.regler("vert");
    await jusquAu("pass.held");

    assert.equal(lancements().length, 3);
    assert.deepEqual(journal.duTicket(17).filter((e) => e.type === "cook.exited").map((e) => e.payload.outcome), ["ok", "failed", "ok"]);
    assert.equal(journal.duTicket(17).filter((e) => e.type === "pass.returned").length, 1);
    assert.deepEqual([pass()?.phase, pass()?.returns], ["held", 1]);
    // Le cook relancé après l'échec est encore un renvoi, dans le même worktree.
    assert.equal(lancements()[2]?.cwd, lancements()[0]?.cwd);
  });

  test("un job de CI en échec rend la pass rouge, et le verdict dit lequel", async (t) => {
    // Un seul cook livre ; le renvoi, lui, bavarde : le test s'arrête au premier verdict.
    const { gh, dernier, jusquAu } = service(t, { grant: true, suite: ["livre"], scenario: "bavard" });
    gh.ci.checks = [
      { name: "tests", outcome: "green", conclusion: "success", url: "https://ci/1" },
      { name: "lint", outcome: "red", conclusion: "failure", url: "https://ci/2" },
    ];
    await jusquAu("pass.returned");

    const verdict = dernier("pass.judged", 17);
    assert.equal(verdict?.verdict, "red");
    assert.equal((verdict?.gates as { outcome: string }).outcome, "green");
    assert.deepEqual(verdict?.ci, { outcome: "red", checks: gh.ci.checks });
    assert.deepEqual(verdict?.findings, ["CI rouge — job « lint » : failure (https://ci/2)."]);
    assert.deepEqual(gh.merges, []);
  });

  test("une CI en cours ne donne pas de verdict : elle est relue, les gates ne sont pas rejouées", async (t) => {
    const { gh, gates, compter, dernier, pass, jusquAu, laisserTourner } = service(t, { grant: true });
    gh.ci.checks = [{ name: "tests", outcome: "pending", conclusion: "in_progress", url: null }];
    await jusquAu("pass.started");
    await laisserTourner();

    assert.equal(compter("pass.judged"), 0);
    assert.equal(pass()?.phase, "judging");

    gh.ci.checks = [{ name: "tests", outcome: "green", conclusion: "success", url: null }];
    await jusquAu("merge.done");

    assert.equal(gates.appels().length, 1);
    assert.equal(compter("pass.started"), 1);
    assert.deepEqual(dernier("pass.judged", 17)?.ci, { outcome: "green", checks: gh.ci.checks });
  });

  test("une CI qui ne conclut jamais remonte au chef passé le délai, sans renvoi", async (t) => {
    const { gh, heure, compter, dernier, etat, jusquAu } = service(t, { grant: true, pass: { attenteCiMs: 60_000 } });
    gh.ci.checks = [{ name: "tests", outcome: "pending", conclusion: "queued", url: null }];
    await jusquAu("pass.started");

    heure.avancer(61_000);
    await jusquAu("pass.escalated");

    assert.deepEqual(dernier("pass.escalated", 17), { reason: "ci-silent" });
    assert.equal(compter("pass.judged") + compter("pass.returned"), 0);
    assert.equal(etat(17), "86");
    assert.deepEqual(gh.merges, []);
  });

  test("une PR qui ne vise pas la base est refusée : ni gates, ni merge, ni renvoi", async (t) => {
    const { gh, gates, histoire, etat, jusquAu } = service(t, { grant: true });
    // Quelqu'un a retourné la PR vers `main` avant que la pass ne la lise.
    const lecture = gh.github.prDeBranche;
    gh.github.prDeBranche = async (branche) => {
      const pr = await lecture(branche);
      return pr && { ...pr, base: "main" };
    };
    await jusquAu("pass.escalated");

    assert.deepEqual(histoire(), ["pass.escalated", "ticket.86"]);
    assert.deepEqual(gates.appels(), []);
    assert.deepEqual(gh.merges, []);
    assert.equal(etat(17), "86");
    await jusqua(() => gh.commentaires.some(([, corps]) => /remontée au chef \(`wrong-base`\)[\s\S]*vise `main`/.test(corps)));
  });

  test("un projet sans gates n'est pas jugé vert : la pass remonte au chef", async (t) => {
    const { gh, histoire, dernier, jusquAu } = service(t, { grant: true, sansGates: true });
    await jusquAu("pass.escalated");

    assert.deepEqual(histoire(), ["pass.escalated", "ticket.86"]);
    assert.deepEqual(dernier("pass.escalated", 17), { reason: "no-gates" });
    assert.deepEqual(gh.merges, []);
  });

  test("un ticket remonté que le chef merge à la main : la pass le voit et ferme l'issue", async (t) => {
    const { gh, dernier, etat, jusquAu } = service(t, { sansGates: true });
    await jusquAu("pass.escalated");

    gh.mergerPR(101);
    await jusqua(() => gh.fermetures.length === 1);

    assert.deepEqual([dernier("merge.done", 17)?.by, gh.merges.length], ["outside", 0]);
    await jusqua(() => etat(17) === undefined);
  });

  test("une livraison qui touche à ses propres juges n'est jamais mergée par la pass, même sous grant", async (t) => {
    const { gh, dernier, pass, jusquAu } = service(t, {
      grant: true,
      depot: (depot) => ({ ...depot, changes: () => [".claude/brigade/gates.sh", "travail.txt"] }),
    });
    await jusquAu("pass.held");

    assert.equal(dernier("pass.judged", 17)?.judgeModified, true);
    assert.equal(dernier("pass.judged", 17)?.verdict, "green");
    assert.deepEqual([pass()?.phase, pass()?.reason], ["held", "judge-modified"]);
    assert.deepEqual(gh.merges, []);
    await jusqua(() => gh.commentaires.some(([, corps]) => /touche à ce qui la juge/.test(corps)));
  });

  test("un worktree qui porte autre chose que ce qui est commité est rouge, sans jouer les gates", async (t) => {
    const { gates, dernier, jusquAu } = service(t, { scenario: "bavard", suite: ["livre"], depot: (depot) => ({ ...depot, propre: () => false }) });
    await jusquAu("pass.returned");

    assert.deepEqual(gates.appels(), []);
    assert.equal((dernier("pass.judged", 17)?.gates as { outcome: string }).outcome, "skipped");
    assert.match(String((dernier("pass.judged", 17)?.findings as string[])[0]), /modifications non commitées/);
  });

  test("des gates qui dépassent leur plafond sont arrêtées, et c'est rouge", async (t) => {
    const { dernier, jusquAu } = service(t, { gates: "lent", pass: { delaiGatesMs: 150 }, scenario: "bavard", suite: ["livre"] });
    await jusquAu("pass.returned");

    assert.equal((dernier("pass.judged", 17)?.gates as { outcome: string }).outcome, "timeout");
    assert.match(String((dernier("pass.judged", 17)?.findings as string[])[0]), /^Gates arrêtées : .* a dépassé son plafond de 0 min\./);
  });

  test("un conflit avec la base est un finding : rouge, avec la marche à suivre", async (t) => {
    const { gh, dernier, jusquAu } = service(t, { grant: true, scenario: "bavard", suite: ["livre"] });
    const lecture = gh.github.prDeBranche;
    gh.github.prDeBranche = async (branche) => {
      const pr = await lecture(branche);
      return pr && { ...pr, mergeable: false };
    };
    await jusquAu("pass.returned");

    assert.match(String((dernier("pass.judged", 17)?.findings as string[])[0]), /^Conflit avec `v2`[\s\S]*git fetch origin v2/);
    assert.deepEqual(gh.merges, []);
  });

  test("un merge que GitHub refuse n'est pas retenté : la pass s'arrête et dit pourquoi", async (t) => {
    const { gh, journal, etat, jusquAu, laisserTourner } = service(t, { grant: true });
    gh.merge.mode = { refus: "HTTP 405 — Pull Request is not mergeable" };
    await jusquAu("pass.held");
    await laisserTourner();

    assert.deepEqual(
      journal.duTicket(17).filter((e) => /^(grant|merge)\.|^pass\.held/.test(e.type)).map((e) => [e.type, charge(e).reason]),
      [
        ["grant.used", undefined],
        ["merge.failed", "HTTP 405 — Pull Request is not mergeable"],
        ["pass.held", "merge-refused: HTTP 405 — Pull Request is not mergeable"],
      ],
    );
    assert.equal(gh.merges.length, 1);
    assert.equal(etat(17), "pass");
    assert.deepEqual(usagesDuGrant(journal.base, 10).map((u) => u.outcome), ["failed"]);
  });

  test("un merge sans réponse se réconcilie sur GitHub : la PR est mergée, le résultat est écrit, jamais un second merge", async (t) => {
    const { gh, journal, avertissements } = service(t, { grant: true });
    gh.merge.mode = "panne-apres-merge";
    await jusqua(() => gh.fermetures.length === 1);

    assert.deepEqual(
      journal.duTicket(17).filter((e) => /^(grant|merge)\.|^ticket\.served/.test(e.type)).map((e) => e.type),
      ["grant.used", "merge.done", "ticket.served"],
    );
    const fait = journal.duTicket(17).find((e) => e.type === "merge.done")?.payload;
    assert.deepEqual([fait?.by, fait?.reconciled], ["pass", true]);
    assert.equal(gh.merges.length, 1);
    assert.match(avertissements.join("\n"), /merge du ticket #17 sans réponse/);
  });

  test("un runtime mort entre l'intention et le résultat : au redémarrage, un merge qui n'a pas eu lieu est repris, sous un grant relu", async (t) => {
    const premiere = service(t, { grant: true });
    premiere.gh.merge.mode = "panne";
    await jusqua(() => premiere.avertissements.some((ligne) => /sans réponse/.test(ligne)));
    premiere.runtime.arreter("test");
    assert.equal(phaseSurDisque(premiere.repertoire), "merging");

    premiere.gh.merge.mode = "ok";
    const { gh, journal } = cuisine(t, { lieux: premiere.lieux, pass: true });
    await jusqua(() => gh.fermetures.length === 1);

    const suite = journal.duTicket(17).filter((e) => /^(grant|merge)\./.test(e.type)).map((e) => [e.type, charge(e).reason, charge(e).reconciled]);
    assert.deepEqual(suite.slice(-3), [
      ["merge.failed", "interrupted", undefined],
      ["grant.used", undefined, undefined],
      ["merge.done", undefined, false],
    ]);
  });

  test("GitHub injoignable : rien n'est jugé ni écrit, et la pass y revient", async (t) => {
    const { gh, compter, avertissements, jusquAu } = service(t);
    gh.pannes.lecture = true;
    await jusqua(() => avertissements.some((ligne) => /la pass a buté sur le ticket #17 — gh api : HTTP 502/.test(ligne)));

    assert.equal(compter("pass.started") + compter("pass.judged"), 0);

    gh.pannes.lecture = false;
    await jusquAu("pass.held");
  });

  test("une PR que la station n'avait pas pu ouvrir est ouverte par la pass", async (t) => {
    const { gh, dernier, jusquAu } = service(t);
    gh.pannes.pr = true;
    await jusquAu("cook.reported");
    assert.equal(dernier("cook.reported", 17)?.pr, null);

    gh.pannes.pr = false;
    await jusquAu("pass.held");

    assert.deepEqual(gh.prs.map((pr) => [pr.base, pr.titre]), [[BASE, "#17 — Ticket 17"]]);
    assert.equal(dernier("pass.judged", 17)?.pr, PR);
  });

  test("un runtime arrêté pendant les gates ne laisse pas de verdict : au redémarrage, la livraison est jugée", async (t) => {
    const premiere = service(t, { gates: "lent" });
    await jusqua(() => premiere.gates.appels().length === 1);
    premiere.runtime.arreter("test");

    premiere.gates.regler("vert");
    const { journal, gates } = cuisine(t, { lieux: premiere.lieux, pass: true });
    await jusqua(() => journal.tout().some((e) => e.type === "pass.held"));

    assert.equal(journal.tout().filter((e) => e.type === "pass.judged").length, 1);
    assert.equal(gates.appels().length, 2);
  });
});

// La phase du ticket 17 telle qu'un runtime arrêté l'a laissée sur le disque.
function phaseSurDisque(repertoire: string) {
  const base = new Base(join(repertoire, "log.db"), { lectureSeule: true });
  try {
    return passDuTicket(base, 17)?.phase;
  } finally {
    base.fermer();
  }
}

test("la consigne de renvoi porte les findings, la branche, et les interdits du cook", () => {
  const consigne = consigneDeRenvoi({ ticket: 17, titre: "La pass", depot: DEPOT, base: "v2", branche: "cook/17-abc", n: 2, findings: ["Gates rouges.", "CI rouge."] });

  assert.match(consigne, /ticket #17 du dépôt benomite\/brigade — « La pass »/);
  assert.match(consigne, /branche `cook\/17-abc`, partie de `v2`/);
  assert.match(consigne, /renvoi 2 sur 2/);
  assert.match(consigne, /Gates rouges\.\n\nCI rouge\./);
  assert.match(consigne, /Tu ne pousses rien, tu n'ouvres pas de PR, tu ne merges jamais/);
});

test("les deux délais de la pass ont un défaut de trente minutes, et se règlent en secondes", () => {
  assert.deepEqual(configPass({}), { delaiGatesMs: 1_800_000, attenteCiMs: 1_800_000 });
  assert.deepEqual(configPass({ BRIGADE_GATES_TIMEOUT_SECONDS: "60", BRIGADE_CI_WAIT_SECONDS: "90" }), { delaiGatesMs: 60_000, attenteCiMs: 90_000 });
  assert.throws(() => configPass({ BRIGADE_CI_WAIT_SECONDS: "bientôt" }), ConfigInvalide);
});
