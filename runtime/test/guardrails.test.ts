// Les garde-fous branchés sur un runtime : ce qui se lance, ce qui s'arrête,
// et ce que le journal en garde. Les cooks sont des faux `claude`.
import assert from "node:assert/strict";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { test, type TestContext } from "node:test";
import type { Caps } from "../src/events/guardrails.ts";
import { plugGuardrails, LancementRefuse, type Reglages } from "../src/guardrails.ts";
import { openLog } from "../src/log.ts";
import { cooksEnCours, guardrailsState, runningCooksMeasures } from "../src/projections/guardrails.ts";
import { demarrer } from "../src/runtime.ts";
import { aArreter, ENV_ENFANT, faitInconnu, FAUX_CLAUDE, jusqua, mort, repertoireTemporaire, tuerLesRelais, vivant } from "./outils.ts";

// Le cook « bavard » rend un tour toutes les deux millisecondes, de vraie
// horloge : ni les tours (200 s pour 100 000) ni la durée (une heure) ne sont
// atteints pendant un test. Celui qui éprouve un plafond règle le sien.
const CAPS: Caps = { turns: 100_000, durationMs: 3_600_000, tokens: 1_000_000, idleMs: 60_000 };
const REGLAGES: Reglages = { plafonds: CAPS, seuilDisjoncteur: 3, graceMs: 2000 };

function kitchen(t: TestContext, reglages: Partial<Reglages> = {}, repertoire = repertoireTemporaire(t)) {
  const runtime = plugGuardrails(
    { ...REGLAGES, ...reglages },
    demarrer({ repertoireEtat: repertoire, projet: "brigade", intervalleVeilleMs: 5 }),
  );
  t.after(() => runtime.arreter("test"));
  const cook = (ticket: number, scenario: string) =>
    runtime.lancer({ ticket, commande: FAUX_CLAUDE, args: [], env: { ...ENV_ENFANT, FAUX_CLAUDE: scenario } });
  const facts = (ticket?: number) =>
    (ticket === undefined ? runtime.journal.tout() : runtime.journal.duTicket(ticket)).map((e) => e.type);
  return { runtime, repertoire, cook, faits: facts };
}

// Ce que ferait la CLI depuis son propre process : une autre connexion.
function chef(repertoire: string, type: "kitchen.stopped" | "kitchen.resumed") {
  const log = openLog(repertoire);
  log.ajouter({ project: "brigade", ticket: null, author: "chef", type, payload: {} });
  log.fermer();
}

test("au branchement, les réglages en vigueur sont journalisés : le chef peut les lire", (t) => {
  const { runtime } = kitchen(t, { seuilDisjoncteur: 4 });

  assert.deepEqual(
    runtime.journal.tout().map((e) => [e.type, e.author, e.payload]).at(-1),
    ["guard.configured", "runtime", { limits: CAPS, breakerThreshold: 4 }],
  );
});

test("les réglages ne sont réécrits au redémarrage que s'ils ont changé", (t) => {
  const repertoire = repertoireTemporaire(t);
  const reglages = (breakerThreshold: number) => {
    plugGuardrails({ ...REGLAGES, seuilDisjoncteur: breakerThreshold }, demarrer({ repertoireEtat: repertoire, projet: "brigade" })).arreter("test");
  };
  reglages(3);
  reglages(3);
  reglages(5);

  const log = openLog(repertoire, { lectureSeule: true });
  t.after(() => log.fermer());
  assert.deepEqual(
    log.tout().filter((e) => e.type === "guard.configured").map((e) => e.payload.breakerThreshold),
    [3, 5],
  );
});

test("un cook lancé puis fini laisse au journal de son ticket son lancement, ses plafonds et sa fin", async (t) => {
  const { runtime, repertoire, cook } = kitchen(t);

  const lance = cook(7, "fini");
  const fin = await lance.fin;

  assert.equal(fin.outcome, "ok");
  const [lancement, sortie, ...reste] = runtime.journal.duTicket(7);
  assert.deepEqual(reste, []);
  assert.deepEqual(
    [lancement?.type, lancement?.author, lancement?.payload],
    ["cook.launched", "runtime", { run: lance.run, limits: CAPS, stream: `runs/${lance.run}.jsonl` }],
  );
  assert.equal(sortie?.type, "cook.exited");
  assert.deepEqual(
    { ...sortie?.payload, durationMs: 0 },
    { run: lance.run, outcome: "ok", code: 0, signal: null, turns: 2, tokens: 20, durationMs: 0 },
  );
  assert.equal(readFileSync(join(repertoire, "runs", `${lance.run}.jsonl`), "utf8").trimEnd().split("\n").length, 3);
  assert.deepEqual(cooksEnCours(runtime.journal.base), []);
});

test("le lancement porte au journal ce que la station dit du cook : son nom de run, son calibrage, sa branche", async (t) => {
  const { runtime } = kitchen(t);
  const contexte = { station: "box/claude", model: "sonnet", effort: "low", branch: "cook/7-abc", worktree: "worktrees/7-abc" };

  const lance = runtime.lancer({ ticket: 7, run: "7-abc", contexte, commande: FAUX_CLAUDE, args: [], env: { ...ENV_ENFANT, FAUX_CLAUDE: "fini" } });
  await lance.fin;

  assert.equal(lance.run, "7-abc");
  assert.deepEqual(runtime.journal.duTicket(7)[0]?.payload, { run: "7-abc", limits: CAPS, stream: "runs/7-abc.jsonl", ...contexte });
});

test("un cook arrêté par un garde-fou, mais que son lanceur juge livré, est une réussite : le motif reste au journal", async (t) => {
  const { runtime, faits: facts } = kitchen(t, { plafonds: { ...CAPS, turns: 3 } });
  const juges: Array<string | undefined> = [];

  const fin = await runtime.lancer({
    ticket: 7,
    commande: FAUX_CLAUDE,
    args: [],
    env: { ...ENV_ENFANT, FAUX_CLAUDE: "bavard" },
    juger: (resultat) => (juges.push(resultat.arret?.reason), "ok"),
  }).fin;

  assert.equal(fin.outcome, "ok");
  assert.deepEqual(juges, ["turns"]);
  assert.deepEqual(facts(7), ["cook.launched", "guard.tripped", "cook.exited"]);
  assert.equal(guardrailsState(runtime.journal.base).failures, 0);
});

test("un cook arrêté par un garde-fou et que son lanceur ne juge pas livré reste un arrêt par garde-fou", async (t) => {
  const { runtime } = kitchen(t, { plafonds: { ...CAPS, turns: 3 } });

  const fin = await runtime.lancer({
    ticket: 7,
    commande: FAUX_CLAUDE,
    args: [],
    env: { ...ENV_ENFANT, FAUX_CLAUDE: "bavard" },
    juger: () => "neutral",
  }).fin;

  assert.equal(fin.outcome, "guard");
  assert.equal(guardrailsState(runtime.journal.base).failures, 1);
});

test("le « stop » du chef ne se juge pas", async (t) => {
  const { runtime } = kitchen(t);
  let juge = false;
  const lance = runtime.lancer({
    ticket: 7,
    commande: FAUX_CLAUDE,
    args: [],
    env: { ...ENV_ENFANT, FAUX_CLAUDE: "bavard" },
    juger: () => ((juge = true), "ok"),
  });

  lance.arreter();

  assert.equal((await lance.fin).outcome, "stop");
  assert.equal(juge, false);
});

test("celui qui a lancé un cook peut l'arrêter : c'est un « stop », pas un échec", async (t) => {
  const { runtime, cook } = kitchen(t);
  const lance = cook(7, "bavard");

  lance.arreter();

  assert.equal((await lance.fin).outcome, "stop");
  assert.equal(guardrailsState(runtime.journal.base).failures, 0);
});

test("deux cooks d'un même ticket ont deux runs distincts", async (t) => {
  const { cook } = kitchen(t);
  const [premier, second] = [cook(7, "fini"), cook(7, "fini")];
  await Promise.all([premier.fin, second.fin]);

  assert.notEqual(premier.run, second.run);
});

test("un cook qui dépasse son plafond est arrêté, et le motif est au journal de son ticket avant sa fin", async (t) => {
  const { runtime, cook } = kitchen(t, { plafonds: { ...CAPS, turns: 3 } });

  const lance = cook(7, "bavard");
  const fin = await lance.fin;

  assert.equal(fin.outcome, "guard");
  assert.deepEqual(
    runtime.journal.duTicket(7).map((e) => [e.type, e.type === "guard.tripped" ? e.payload : null]),
    [
      ["cook.launched", null],
      ["guard.tripped", { run: lance.run, reason: "turns", limit: 3, observed: 4 }],
      ["cook.exited", null],
    ],
  );
});

test("un cook muet est arrêté pour inactivité, et le journal le dit", async (t) => {
  const { runtime, cook } = kitchen(t, { plafonds: { ...CAPS, idleMs: 100 } });

  await cook(7, "muet").fin;

  const motif = runtime.journal.duTicket(7).find((e) => e.type === "guard.tripped");
  assert.equal(motif?.payload.reason, "idle");
});

test("un cook qui sort en erreur est un échec ; un binaire introuvable aussi, avec sa raison", async (t) => {
  const { runtime, cook } = kitchen(t);

  const echec = await cook(7, "echec").fin;
  const introuvable = await runtime.lancer({ ticket: 8, commande: join(repertoireTemporaire(t), "pas-de-claude"), args: [] }).fin;

  assert.deepEqual([echec.outcome, echec.code], ["failed", 1]);
  assert.equal(introuvable.outcome, "failed");
  const sortie = runtime.journal.duTicket(8).find((e) => e.type === "cook.exited");
  assert.match(sortie?.payload.error ?? "", /ENOENT/);
  assert.equal(guardrailsState(runtime.journal.base).failures, 2);
});

test("un cook qui ne peut même pas être lancé reçoit quand même sa fin au journal : un échec, pas un cook fantôme", async (t) => {
  const { runtime, repertoire, faits: facts } = kitchen(t);
  // Un fichier là où le répertoire des flux devrait se créer.
  writeFileSync(join(repertoire, "runs"), "");

  const fin = await runtime.lancer({ ticket: 7, commande: FAUX_CLAUDE, args: [] }).fin;

  assert.equal(fin.outcome, "failed");
  assert.deepEqual(facts(7), ["cook.launched", "cook.exited"]);
  assert.deepEqual(cooksEnCours(runtime.journal.base), []);
  assert.equal(guardrailsState(runtime.journal.base).failures, 1);
});

test("la station peut dire qu'une fin n'est ni un échec ni une réussite — le 86", async (t) => {
  const { runtime } = kitchen(t);
  const lancer86 = () =>
    runtime.lancer({
      ticket: 7,
      commande: FAUX_CLAUDE,
      args: [],
      env: { ...ENV_ENFANT, FAUX_CLAUDE: "echec" },
      juger: () => "neutral",
    });

  const fin = await lancer86().fin;

  assert.equal(fin.outcome, "neutral");
  assert.equal(guardrailsState(runtime.journal.base).failures, 0);
});

test("après N échecs d'affilée le disjoncteur s'ouvre, le dit au journal, et plus aucun cook n'est lancé", async (t) => {
  const { runtime, cook, faits: facts } = kitchen(t, { seuilDisjoncteur: 2 });
  await cook(7, "echec").fin;
  assert.equal(guardrailsState(runtime.journal.base).breakerOpenedAt, null);
  await cook(8, "echec").fin;

  assert.deepEqual(
    runtime.journal.tout().filter((e) => e.type === "breaker.opened").map((e) => [e.author, e.ticket, e.payload]),
    [["runtime", null, { failures: 2, threshold: 2 }]],
  );
  const avant = facts();
  assert.throws(
    () => cook(9, "fini"),
    (erreur: unknown) => erreur instanceof LancementRefuse && erreur.motif === "breaker" && /disjoncteur/.test(erreur.message),
  );
  assert.deepEqual(facts(), avant);
});

test("à plusieurs cooks, trois qui échouent une fois chacun ouvrent le disjoncteur : la réussite d'un cook parti avant eux n'efface rien", async (t) => {
  const { runtime, cook } = kitchen(t);
  // Parti le premier, il finit bien après deux échecs des suivants : arrêté par
  // un garde-fou, et jugé livré par celui qui l'a lancé.
  const vieux = runtime.lancer({ ticket: 6, commande: FAUX_CLAUDE, args: [], env: { ...ENV_ENFANT, FAUX_CLAUDE: "muet" }, juger: () => "ok" });
  const [a, b] = [cook(7, "echec"), cook(8, "echec")];
  await Promise.all([a.fin, b.fin]);
  vieux.arreter({ reason: "lease", limit: 1, observed: 1 });
  assert.equal((await vieux.fin).outcome, "ok");
  assert.deepEqual([guardrailsState(runtime.journal.base).failures, guardrailsState(runtime.journal.base).breakerOpenedAt], [2, null]);

  await cook(9, "echec").fin;

  assert.deepEqual(runtime.journal.tout().filter((e) => e.type === "breaker.opened").map((e) => e.payload), [{ failures: 3, threshold: 3 }]);
  assert.throws(() => cook(10, "fini"), LancementRefuse);
});

test("une réussite entre deux échecs empêche le disjoncteur de s'ouvrir", async (t) => {
  const { runtime, cook } = kitchen(t, { seuilDisjoncteur: 2 });
  await cook(7, "echec").fin;
  await cook(7, "fini").fin;
  await cook(7, "echec").fin;

  assert.equal(guardrailsState(runtime.journal.base).breakerOpenedAt, null);
  await cook(7, "fini").fin;
});

test("le disjoncteur reste ouvert après un redémarrage, et se referme sur « resume »", async (t) => {
  const repertoire = repertoireTemporaire(t);
  const premiere = plugGuardrails({ ...REGLAGES, seuilDisjoncteur: 1 }, demarrer({ repertoireEtat: repertoire, projet: "brigade" }));
  await premiere.lancer({ ticket: 7, commande: FAUX_CLAUDE, args: [], env: { ...ENV_ENFANT, FAUX_CLAUDE: "echec" } }).fin;
  premiere.arreter("SIGTERM");

  const { cook } = kitchen(t, { seuilDisjoncteur: 1 }, repertoire);
  assert.throws(() => cook(8, "fini"), LancementRefuse);

  chef(repertoire, "kitchen.resumed");

  assert.equal((await cook(8, "fini").fin).outcome, "ok");
});

test("le « stop » écrit par un autre process arrête tous les cooks en cours, avec son motif, sans compter pour un échec", async (t) => {
  const { runtime, repertoire, cook } = kitchen(t);
  const lances = [cook(7, "bavard"), cook(8, "muet"), cook(9, "muet"), cook(10, "bavard")];

  chef(repertoire, "kitchen.stopped");
  const fins = await Promise.all(lances.map((lance) => lance.fin));

  assert.deepEqual(fins.map((fin) => fin.outcome), ["stop", "stop", "stop", "stop"]);
  assert.throws(() => cook(11, "fini"), (erreur: unknown) => erreur instanceof LancementRefuse && erreur.motif === "stopped");
  for (const ticket of [7, 8, 9, 10]) {
    assert.deepEqual(
      runtime.journal.duTicket(ticket).map((e) => [e.type, e.type === "guard.tripped" ? e.payload.reason : null]),
      [["cook.launched", null], ["guard.tripped", "stop"], ["cook.exited", null]],
    );
  }
  assert.equal(guardrailsState(runtime.journal.base).failures, 0);
});

test("un « stop » suivi d'un « resume » avant que le runtime ne se réveille arrête quand même les cooks qui tournaient", async (t) => {
  const { runtime, repertoire, cook } = kitchen(t);
  const avant = cook(7, "bavard");

  chef(repertoire, "kitchen.stopped");
  chef(repertoire, "kitchen.resumed");
  // Lancé après la reprise, avant le réveil : le « stop » ne le concerne pas.
  const apres = cook(8, "muet");

  assert.equal((await avant.fin).outcome, "stop");
  assert.deepEqual(runtime.journal.duTicket(8).map((e) => e.type), ["cook.launched"]);
  assert.equal(vivant(apres.pid), true);
});

test("un « stop » d'avant le démarrage, repris depuis, n'arrête pas les cooks du runtime suivant", async (t) => {
  const repertoire = repertoireTemporaire(t);
  plugGuardrails(REGLAGES, demarrer({ repertoireEtat: repertoire, projet: "brigade" })).arreter("SIGTERM");
  chef(repertoire, "kitchen.stopped");
  chef(repertoire, "kitchen.resumed");

  const { runtime, cook } = kitchen(t, {}, repertoire);
  const lance = cook(7, "muet");
  // Une autre écriture réveille le runtime, qui relit alors son journal.
  const cli = openLog(repertoire);
  cli.ajouter({ project: "brigade", ticket: null, author: "chef", ...faitInconnu("autre.chose") });
  cli.fermer();
  await new Promise((resoudre) => setTimeout(resoudre, 40));

  assert.deepEqual(runtime.journal.duTicket(7).map((e) => e.type), ["cook.launched"]);
  assert.equal(vivant(lance.pid), true);
});

test("après un « stop » rien ne se lance, jusqu'à « resume » — redémarrage compris", async (t) => {
  const repertoire = repertoireTemporaire(t);
  const premiere = plugGuardrails(REGLAGES, demarrer({ repertoireEtat: repertoire, projet: "brigade" }));
  chef(repertoire, "kitchen.stopped");
  assert.throws(
    () => premiere.lancer({ ticket: 7, commande: FAUX_CLAUDE, args: [] }),
    (erreur: unknown) => erreur instanceof LancementRefuse && erreur.motif === "stopped",
  );
  premiere.arreter("SIGTERM");

  const { cook } = kitchen(t, {}, repertoire);
  assert.throws(() => cook(7, "fini"), LancementRefuse);

  chef(repertoire, "kitchen.resumed");

  assert.equal((await cook(7, "fini").fin).outcome, "ok");
});

test("un cook meurt avec le runtime, et le démarrage suivant note son interruption sur son ticket", async (t) => {
  const repertoire = repertoireTemporaire(t);
  const premiere = plugGuardrails(REGLAGES, demarrer({ repertoireEtat: repertoire, projet: "brigade" }));
  const lance = premiere.lancer({ ticket: 7, commande: FAUX_CLAUDE, args: [], env: { ...ENV_ENFANT, FAUX_CLAUDE: "sourd" } });

  premiere.arreter("SIGTERM");
  const fin = await lance.fin;

  assert.equal(fin.outcome, "interrupted");
  assert.equal(vivant(lance.pid), false);

  const { runtime, faits: facts } = kitchen(t, {}, repertoire);
  assert.deepEqual(facts(7), ["cook.launched", "cook.interrupted"]);
  assert.deepEqual(runtime.journal.duTicket(7).at(-1)?.payload, { run: lance.run });
  assert.deepEqual(cooksEnCours(runtime.journal.base), []);
  assert.equal(guardrailsState(runtime.journal.base).failures, 0);
  assert.deepEqual(facts().filter((type) => type.startsWith("runtime.")), ["runtime.started", "runtime.stopped", "runtime.started"]);
});

// --- Le cook relayé : il survit au runtime -----------------------------------

// Un cook qu'un relais porte : il survit au runtime qui l'a lancé. `feu` : le
// fichier que le scénario « commite-puis-attend » guette pour conclure ; il
// commite dans un répertoire à lui.
function relayedKitchen(t: TestContext, repertoire = repertoireTemporaire(t), reglages: Partial<Reglages> = {}) {
  aArreter(t, () => tuerLesRelais(repertoire));
  const lieu = kitchen(t, reglages, repertoire);
  const feu = join(repertoire, "feu");
  const cook = (ticket: number, scenario: string, secrets: Record<string, string> = {}) =>
    lieu.runtime.lancer({ ticket, commande: FAUX_CLAUDE, args: [], cwd: repertoire, env: { ...ENV_ENFANT, FAUX_CLAUDE: scenario, FAUX_CLAUDE_FEU: feu, ...secrets }, survivant: { secrets } });
  const flux = (run: string) => join(repertoire, "runs", `${run}.jsonl`);
  const pidDuCook = (run: string) => Number(readFileSync(join(repertoire, "runs", `${run}.cook.pid`), "utf8"));
  return { ...lieu, cook, feu, flux, pidDuCook };
}

test("un cook relayé survit à l'arrêt du runtime ; le suivant le liste en cours, le reprend sans le relancer, et écrit sa fin", async (t) => {
  const premiere = relayedKitchen(t);
  const lance = premiere.cook(7, "commite-puis-attend");
  await jusqua(() => existsSync(join(premiere.repertoire, "runs", `${lance.run}.cook.pid`)) && existsSync(premiere.flux(lance.run)) && readFileSync(premiere.flux(lance.run), "utf8").includes('"assistant"'));
  const pid = premiere.pidDuCook(lance.run);

  premiere.runtime.arreter("SIGTERM");
  assert.equal((await lance.fin).outcome, "interrupted");
  // Ni le cook ni son relais ne sont touchés.
  assert.equal(vivant(pid), true);
  assert.equal(vivant(lance.pid), true);

  const seconde = relayedKitchen(t, premiere.repertoire);
  assert.deepEqual(seconde.runtime.survivants(), [{ run: lance.run, ticket: 7 }]);
  assert.deepEqual(cooksEnCours(seconde.runtime.journal.base).map((cook) => cook.run), [lance.run]);
  assert.deepEqual(seconde.faits(7), ["cook.launched"]);
  const repris = seconde.runtime.reprendre(lance.run);
  assert.ok(repris);
  assert.equal(repris.pid, lance.pid);
  assert.deepEqual(seconde.runtime.survivants(), []);
  assert.equal(vivant(pid), true);

  writeFileSync(seconde.feu, "");
  const fin = await repris.fin;

  assert.equal(fin.outcome, "ok");
  // Le flux est relu depuis son début : le tour d'avant la reprise compte.
  assert.deepEqual([fin.code, fin.turns, fin.tokens], [0, 1, 10]);
  assert.deepEqual(seconde.faits(7), ["cook.launched", "cook.resumed", "cook.exited"]);
  assert.deepEqual(seconde.runtime.journal.duTicket(7)[1]?.payload, { run: lance.run, pid: lance.pid });
  assert.deepEqual(cooksEnCours(seconde.runtime.journal.base), []);
  await mort(pid);
});

test("un cook relayé qui a fini pendant que personne ne tenait le runtime : sa fin est lue à la reprise", async (t) => {
  const premiere = relayedKitchen(t);
  const lance = premiere.cook(7, "fini");
  premiere.runtime.arreter("SIGTERM");
  await jusqua(() => existsSync(join(premiere.repertoire, "runs", `${lance.run}.fin.json`)));
  await mort(lance.pid ?? 0);

  const seconde = relayedKitchen(t, premiere.repertoire);
  const fin = await seconde.runtime.reprendre(lance.run)?.fin;

  assert.equal(fin?.outcome, "ok");
  assert.deepEqual(seconde.faits(7), ["cook.launched", "cook.resumed", "cook.exited"]);
});

test("un cook relayé que personne ne reprend au démarrage est arrêté, et son interruption notée", async (t) => {
  const premiere = relayedKitchen(t);
  const lance = premiere.cook(7, "commite-puis-attend");
  await jusqua(() => existsSync(join(premiere.repertoire, "runs", `${lance.run}.cook.pid`)));
  const pid = premiere.pidDuCook(lance.run);
  premiere.runtime.arreter("SIGTERM");

  const seconde = relayedKitchen(t, premiere.repertoire);
  await jusqua(() => seconde.faits(7).includes("cook.interrupted"));

  await mort(pid);
  await mort(lance.pid ?? 0);
  assert.deepEqual(seconde.faits(7), ["cook.launched", "cook.interrupted"]);
  assert.equal(seconde.runtime.reprendre(lance.run), null);
});

test("un cook relayé dont le relais est mort sans écrire de fin n'est pas un survivant : il est noté interrompu, et son groupe tué", async (t) => {
  const premiere = relayedKitchen(t);
  const lance = premiere.cook(7, "commite-puis-attend");
  await jusqua(() => existsSync(join(premiere.repertoire, "runs", `${lance.run}.cook.pid`)));
  premiere.runtime.arreter("SIGTERM");
  process.kill(lance.pid ?? 0, "SIGKILL");
  await mort(lance.pid ?? 0);

  const seconde = relayedKitchen(t, premiere.repertoire);

  assert.deepEqual(seconde.runtime.survivants(), []);
  assert.deepEqual(seconde.faits(7), ["cook.launched", "cook.interrupted"]);
});

test("un cook relayé s'arrête au « stop » du chef comme un autre, repris ou non", async (t) => {
  const premiere = relayedKitchen(t);
  const lance = premiere.cook(7, "commite-puis-attend");
  await jusqua(() => existsSync(join(premiere.repertoire, "runs", `${lance.run}.cook.pid`)));
  const pid = premiere.pidDuCook(lance.run);
  premiere.runtime.arreter("SIGTERM");

  const seconde = relayedKitchen(t, premiere.repertoire);
  const repris = seconde.runtime.reprendre(lance.run);
  chef(seconde.repertoire, "kitchen.stopped");
  const fin = await repris?.fin;

  assert.equal(fin?.outcome, "stop", JSON.stringify(fin));
  await mort(pid);
});

test("un cook relayé repris pendant que la cuisine est arrêtée s'arrête aussitôt", async (t) => {
  const premiere = relayedKitchen(t);
  const lance = premiere.cook(7, "commite-puis-attend");
  await jusqua(() => existsSync(join(premiere.repertoire, "runs", `${lance.run}.cook.pid`)));
  premiere.runtime.arreter("SIGTERM");
  chef(premiere.repertoire, "kitchen.stopped");

  const seconde = relayedKitchen(t, premiere.repertoire);
  const fin = await seconde.runtime.reprendre(lance.run)?.fin;

  assert.equal(fin?.outcome, "stop");
});

test("ce qu'un cook relayé dit est masqué avant d'être écrit — les secrets qu'il reçoit et la forme des identifiants de Claude —, et ses plafonds tiennent", async (t) => {
  const { cook, flux, repertoire } = relayedKitchen(t, repertoireTemporaire(t), { plafonds: { ...CAPS, turns: 5 } });
  const CLE_API = "une-valeur-secrete-assez-longue";
  const revele = cook(7, "livre-et-revele", { CLE_API });
  const fin = await revele.fin;
  assert.equal(fin.code, 0);
  assert.doesNotMatch(readFileSync(flux(revele.run), "utf8"), new RegExp(CLE_API));
  assert.match(readFileSync(flux(revele.run), "utf8"), /\[secret:CLE_API\]/);

  const jeton = cook(8, "livre-et-dit-un-jeton");
  const dit = await jeton.fin;
  assert.ok((dit.masques ?? 0) > 0);
  assert.doesNotMatch(readFileSync(flux(jeton.run), "utf8") + readFileSync(`${flux(jeton.run)}.stderr`, "utf8"), /sk-ant-oat01-0{20}/);

  const bavard = cook(9, "bavard");
  const arrete = await bavard.fin;
  assert.deepEqual([arrete.outcome, arrete.arret?.reason], ["guard", "turns"]);
  assert.ok(existsSync(join(repertoire, "runs", `${bavard.run}.fin.json`)));
});

test("à chaque tick, un cook en cours laisse au journal de son ticket ce qu'il a consommé et ce qu'il fait ; fini, il n'en laisse plus", async (t) => {
  const runtime = plugGuardrails(
    { ...REGLAGES, plafonds: { ...CAPS, turns: 40 } },
    demarrer({ repertoireEtat: repertoireTemporaire(t), projet: "brigade", intervalleVeilleMs: 60_000, intervalleTickMs: 5 }),
  );
  t.after(() => runtime.arreter("test"));

  const lance = runtime.lancer({ ticket: 7, commande: FAUX_CLAUDE, args: [], env: { ...ENV_ENFANT, FAUX_CLAUDE: "bavard" } });
  await lance.fin;
  await new Promise((resoudre) => setTimeout(resoudre, 20));

  const facts = runtime.journal.duTicket(7);
  const releves = facts.flatMap((e) => (e.type === "cook.progressed" ? [e.payload] : []));
  assert.notEqual(releves.length, 0);
  assert.equal(facts.at(-1)?.type, "cook.exited");
  for (const releve of releves) assert.equal(releve.run, lance.run);
  // Ce qu'il fait y est aussi : nul, ce faux cook ne dit rien qui se lise.
  for (const releve of releves) assert.equal(releve.activity, null);
  const turns = releves.map((releve) => releve.turns);
  assert.deepEqual(turns, [...turns].sort((a, b) => a - b));
  assert.equal(releves.at(-1)?.tokens, (releves.at(-1)?.turns ?? 0) * 10);
  assert.deepEqual(runningCooksMeasures(runtime.journal.base), []);
});

test("un runtime arrêté ne lance plus rien", (t) => {
  const repertoire = repertoireTemporaire(t);
  const runtime = plugGuardrails(REGLAGES, demarrer({ repertoireEtat: repertoire, projet: "brigade" }));
  runtime.arreter("SIGTERM");

  assert.throws(() => runtime.lancer({ ticket: 7, commande: FAUX_CLAUDE, args: [] }), /arrêté/);
});

test("une relance du manager jugée rouge compte au disjoncteur, et l'ouvre au seuil : plus aucun cook n'est lancé", async (t) => {
  const { runtime, cook, faits: facts } = kitchen(t, { seuilDisjoncteur: 2 });
  const relance = (scenario: string) =>
    runtime.lancer({ ticket: 17, contexte: { relaunch: true }, commande: FAUX_CLAUDE, args: [], env: { ...ENV_ENFANT, FAUX_CLAUDE: scenario } });

  for (let i = 0; i < 2; i++) {
    // Le cook livre : sa fin ne dit rien, c'est la pass qui juge.
    const lance = relance("fini");
    assert.equal((await lance.fin).outcome, "ok");
    runtime.jugerRelance(17, lance.run, "red");
  }

  assert.equal(guardrailsState(runtime.journal.base).failures, 2);
  assert.deepEqual(facts().filter((type) => type === "breaker.opened"), ["breaker.opened"]);
  assert.throws(() => cook(18, "fini"), LancementRefuse);
});

// Un cook signalé de l'extérieur (SIGTERM, 143) pendant que brigade demandait
// l'arrêt — « stop » du chef ou mise à jour — n'est pas un échec du cook.
function troisSignales(t: TestContext, ecrireLaCause: (repertoire: string) => void) {
  const { runtime, repertoire, cook } = kitchen(t, { seuilDisjoncteur: 3 });
  const feu = join(repertoire, "feu");
  const lances = [7, 8, 9].map((ticket) =>
    runtime.lancer({ ticket, commande: FAUX_CLAUDE, args: [], env: { ...ENV_ENFANT, FAUX_CLAUDE: "meurt-sigterm", FAUX_CLAUDE_FEU: feu } }),
  );
  void cook;
  ecrireLaCause(repertoire);
  writeFileSync(feu, "");
  return { runtime, lances };
}

test("trois cooks signalés pendant un « stop » du chef : ni échec compté, ni disjoncteur, la cause est au journal", async (t) => {
  const { runtime, lances } = troisSignales(t, () => {});
  // Le « stop » est au journal avant que le runtime ne le lise : la sortie 143
  // arrive la première.
  const log = openLog(runtime.journal.base.lire<{ file: string }>("PRAGMA database_list")[0]!.file.replace(/\/[^/]+$/, ""));
  log.ajouter({ project: "brigade", ticket: null, author: "chef", type: "kitchen.stopped", payload: {} });
  log.fermer();
  const fins = await Promise.all(lances.map((lance) => lance.fin));

  assert.deepEqual(fins.map((fin) => fin.outcome), ["stop", "stop", "stop"]);
  assert.equal(guardrailsState(runtime.journal.base).failures, 0);
  assert.equal(runtime.journal.tout().some((e) => e.type === "breaker.opened"), false);
  for (const e of runtime.journal.tout().filter((e) => e.type === "cook.exited")) assert.equal((e.payload as { cause?: string }).cause, "stop");
});

test("trois cooks signalés sans que brigade ait rien demandé comptent, et ouvrent le disjoncteur au seuil", async (t) => {
  const { runtime, lances } = troisSignales(t, () => {});
  const fins = await Promise.all(lances.map((lance) => lance.fin));

  assert.deepEqual(fins.map((fin) => fin.outcome), ["failed", "failed", "failed"]);
  assert.equal(guardrailsState(runtime.journal.base).failures, 3);
  assert.equal(runtime.journal.tout().filter((e) => e.type === "breaker.opened").length, 1);
});
