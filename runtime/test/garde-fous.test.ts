// Les garde-fous branchés sur un runtime : ce qui se lance, ce qui s'arrête,
// et ce que le journal en garde. Les cooks sont des faux `claude`.
import assert from "node:assert/strict";
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { test, type TestContext } from "node:test";
import type { Plafonds } from "../src/evenements/garde-fous.ts";
import { brancherGardeFous, LancementRefuse, type Reglages } from "../src/garde-fous.ts";
import { ouvrirJournal } from "../src/journal.ts";
import { cooksEnCours, etatDesGardeFous } from "../src/projections/garde-fous.ts";
import { demarrer } from "../src/runtime.ts";
import { FAUX_CLAUDE, faitInconnu, repertoireTemporaire } from "./outils.ts";

const PLAFONDS: Plafonds = { turns: 1000, durationMs: 60_000, tokens: 1_000_000, idleMs: 60_000 };
const REGLAGES: Reglages = { plafonds: PLAFONDS, seuilDisjoncteur: 3, graceMs: 2000 };

function cuisine(t: TestContext, reglages: Partial<Reglages> = {}, repertoire = repertoireTemporaire(t)) {
  const runtime = brancherGardeFous(
    { ...REGLAGES, ...reglages },
    demarrer({ repertoireEtat: repertoire, projet: "brigade", intervalleVeilleMs: 5 }),
  );
  t.after(() => runtime.arreter("test"));
  const cook = (ticket: number, scenario: string) =>
    runtime.lancer({ ticket, commande: FAUX_CLAUDE, args: [], env: { PATH: process.env.PATH ?? "", FAUX_CLAUDE: scenario } });
  const faits = (ticket?: number) =>
    (ticket === undefined ? runtime.journal.tout() : runtime.journal.duTicket(ticket)).map((e) => e.type);
  return { runtime, repertoire, cook, faits };
}

// Ce que ferait la CLI depuis son propre process : une autre connexion.
function chef(repertoire: string, type: "kitchen.stopped" | "kitchen.resumed") {
  const journal = ouvrirJournal(repertoire);
  journal.ajouter({ project: "brigade", ticket: null, author: "chef", type, payload: {} });
  journal.fermer();
}

const vivant = (pid: number) => {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
};

test("au branchement, les réglages en vigueur sont journalisés : le chef peut les lire", (t) => {
  const { runtime } = cuisine(t, { seuilDisjoncteur: 4 });

  assert.deepEqual(
    runtime.journal.tout().map((e) => [e.type, e.author, e.payload]).at(-1),
    ["guard.configured", "runtime", { limits: PLAFONDS, breakerThreshold: 4 }],
  );
});

test("les réglages ne sont réécrits au redémarrage que s'ils ont changé", (t) => {
  const repertoire = repertoireTemporaire(t);
  const reglages = (seuilDisjoncteur: number) => {
    brancherGardeFous({ ...REGLAGES, seuilDisjoncteur }, demarrer({ repertoireEtat: repertoire, projet: "brigade" })).arreter("test");
  };
  reglages(3);
  reglages(3);
  reglages(5);

  const journal = ouvrirJournal(repertoire, { lectureSeule: true });
  t.after(() => journal.fermer());
  assert.deepEqual(
    journal.tout().filter((e) => e.type === "guard.configured").map((e) => e.payload.breakerThreshold),
    [3, 5],
  );
});

test("un cook lancé puis fini laisse au journal de son ticket son lancement, ses plafonds et sa fin", async (t) => {
  const { runtime, repertoire, cook } = cuisine(t);

  const lance = cook(7, "fini");
  const fin = await lance.fin;

  assert.equal(fin.outcome, "ok");
  const [lancement, sortie, ...reste] = runtime.journal.duTicket(7);
  assert.deepEqual(reste, []);
  assert.deepEqual(
    [lancement?.type, lancement?.author, lancement?.payload],
    ["cook.launched", "runtime", { run: lance.run, limits: PLAFONDS, stream: `runs/${lance.run}.jsonl` }],
  );
  assert.equal(sortie?.type, "cook.exited");
  assert.deepEqual(
    { ...sortie?.payload, durationMs: 0 },
    { run: lance.run, outcome: "ok", code: 0, signal: null, turns: 2, tokens: 20, durationMs: 0 },
  );
  assert.equal(readFileSync(join(repertoire, "runs", `${lance.run}.jsonl`), "utf8").trimEnd().split("\n").length, 3);
  assert.deepEqual(cooksEnCours(runtime.journal.base), []);
});

test("deux cooks d'un même ticket ont deux runs distincts", async (t) => {
  const { cook } = cuisine(t);
  const [premier, second] = [cook(7, "fini"), cook(7, "fini")];
  await Promise.all([premier.fin, second.fin]);

  assert.notEqual(premier.run, second.run);
});

test("un cook qui dépasse son plafond est arrêté, et le motif est au journal de son ticket avant sa fin", async (t) => {
  const { runtime, cook } = cuisine(t, { plafonds: { ...PLAFONDS, turns: 3 } });

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
  const { runtime, cook } = cuisine(t, { plafonds: { ...PLAFONDS, idleMs: 100 } });

  await cook(7, "muet").fin;

  const motif = runtime.journal.duTicket(7).find((e) => e.type === "guard.tripped");
  assert.equal(motif?.payload.reason, "idle");
});

test("un cook qui sort en erreur est un échec ; un binaire introuvable aussi, avec sa raison", async (t) => {
  const { runtime, cook } = cuisine(t);

  const echec = await cook(7, "echec").fin;
  const introuvable = await runtime.lancer({ ticket: 8, commande: join(repertoireTemporaire(t), "pas-de-claude"), args: [] }).fin;

  assert.deepEqual([echec.outcome, echec.code], ["failed", 1]);
  assert.equal(introuvable.outcome, "failed");
  const sortie = runtime.journal.duTicket(8).find((e) => e.type === "cook.exited");
  assert.match(sortie?.payload.error ?? "", /ENOENT/);
  assert.equal(etatDesGardeFous(runtime.journal.base).failures, 2);
});

test("un cook qui ne peut même pas être lancé reçoit quand même sa fin au journal : un échec, pas un cook fantôme", async (t) => {
  const { runtime, repertoire, faits } = cuisine(t);
  // Un fichier là où le répertoire des flux devrait se créer.
  writeFileSync(join(repertoire, "runs"), "");

  const fin = await runtime.lancer({ ticket: 7, commande: FAUX_CLAUDE, args: [] }).fin;

  assert.equal(fin.outcome, "failed");
  assert.deepEqual(faits(7), ["cook.launched", "cook.exited"]);
  assert.deepEqual(cooksEnCours(runtime.journal.base), []);
  assert.equal(etatDesGardeFous(runtime.journal.base).failures, 1);
});

test("la station peut dire qu'une fin n'est ni un échec ni une réussite — le 86", async (t) => {
  const { runtime } = cuisine(t);
  const lancer86 = () =>
    runtime.lancer({
      ticket: 7,
      commande: FAUX_CLAUDE,
      args: [],
      env: { PATH: process.env.PATH ?? "", FAUX_CLAUDE: "echec" },
      juger: () => "neutral",
    });

  const fin = await lancer86().fin;

  assert.equal(fin.outcome, "neutral");
  assert.equal(etatDesGardeFous(runtime.journal.base).failures, 0);
});

test("après N échecs d'affilée le disjoncteur s'ouvre, le dit au journal, et plus aucun cook n'est lancé", async (t) => {
  const { runtime, cook, faits } = cuisine(t, { seuilDisjoncteur: 2 });
  await cook(7, "echec").fin;
  assert.equal(etatDesGardeFous(runtime.journal.base).breakerOpenedAt, null);
  await cook(8, "echec").fin;

  assert.deepEqual(
    runtime.journal.tout().filter((e) => e.type === "breaker.opened").map((e) => [e.author, e.ticket, e.payload]),
    [["runtime", null, { failures: 2, threshold: 2 }]],
  );
  const avant = faits();
  assert.throws(
    () => cook(9, "fini"),
    (erreur: unknown) => erreur instanceof LancementRefuse && erreur.motif === "breaker" && /disjoncteur/.test(erreur.message),
  );
  assert.deepEqual(faits(), avant);
});

test("une réussite entre deux échecs empêche le disjoncteur de s'ouvrir", async (t) => {
  const { runtime, cook } = cuisine(t, { seuilDisjoncteur: 2 });
  await cook(7, "echec").fin;
  await cook(7, "fini").fin;
  await cook(7, "echec").fin;

  assert.equal(etatDesGardeFous(runtime.journal.base).breakerOpenedAt, null);
  await cook(7, "fini").fin;
});

test("le disjoncteur reste ouvert après un redémarrage, et se referme sur « reprendre »", async (t) => {
  const repertoire = repertoireTemporaire(t);
  const premiere = brancherGardeFous({ ...REGLAGES, seuilDisjoncteur: 1 }, demarrer({ repertoireEtat: repertoire, projet: "brigade" }));
  await premiere.lancer({ ticket: 7, commande: FAUX_CLAUDE, args: [], env: { PATH: process.env.PATH ?? "", FAUX_CLAUDE: "echec" } }).fin;
  premiere.arreter("SIGTERM");

  const { cook } = cuisine(t, { seuilDisjoncteur: 1 }, repertoire);
  assert.throws(() => cook(8, "fini"), LancementRefuse);

  chef(repertoire, "kitchen.resumed");

  assert.equal((await cook(8, "fini").fin).outcome, "ok");
});

test("le « stop » écrit par un autre process arrête tous les cooks en cours, avec son motif, sans compter pour un échec", async (t) => {
  const { runtime, repertoire, cook } = cuisine(t);
  const [premier, second] = [cook(7, "bavard"), cook(8, "muet")];

  chef(repertoire, "kitchen.stopped");
  const fins = await Promise.all([premier.fin, second.fin]);

  assert.deepEqual(fins.map((fin) => fin.outcome), ["stop", "stop"]);
  for (const ticket of [7, 8]) {
    assert.deepEqual(
      runtime.journal.duTicket(ticket).map((e) => [e.type, e.type === "guard.tripped" ? e.payload.reason : null]),
      [["cook.launched", null], ["guard.tripped", "stop"], ["cook.exited", null]],
    );
  }
  assert.equal(etatDesGardeFous(runtime.journal.base).failures, 0);
});

test("un « stop » suivi d'un « reprendre » avant que le runtime ne se réveille arrête quand même les cooks qui tournaient", async (t) => {
  const { runtime, repertoire, cook } = cuisine(t);
  const avant = cook(7, "bavard");

  chef(repertoire, "kitchen.stopped");
  chef(repertoire, "kitchen.resumed");
  // Lancé après la reprise, avant le réveil : le « stop » ne le concerne pas.
  const apres = cook(8, "muet");

  assert.equal((await avant.fin).outcome, "stop");
  assert.deepEqual(runtime.journal.duTicket(8).map((e) => e.type), ["cook.launched"]);
  assert.equal(vivant(apres.pid ?? 0), true);
});

test("un « stop » d'avant le démarrage, repris depuis, n'arrête pas les cooks du runtime suivant", async (t) => {
  const repertoire = repertoireTemporaire(t);
  brancherGardeFous(REGLAGES, demarrer({ repertoireEtat: repertoire, projet: "brigade" })).arreter("SIGTERM");
  chef(repertoire, "kitchen.stopped");
  chef(repertoire, "kitchen.resumed");

  const { runtime, cook } = cuisine(t, {}, repertoire);
  const lance = cook(7, "muet");
  // Une autre écriture réveille le runtime, qui relit alors son journal.
  const cli = ouvrirJournal(repertoire);
  cli.ajouter({ project: "brigade", ticket: null, author: "github", ...faitInconnu("ticket.arrived") });
  cli.fermer();
  await new Promise((resoudre) => setTimeout(resoudre, 40));

  assert.deepEqual(runtime.journal.duTicket(7).map((e) => e.type), ["cook.launched"]);
  assert.equal(vivant(lance.pid ?? 0), true);
});

test("après un « stop » rien ne se lance, jusqu'à « reprendre » — redémarrage compris", async (t) => {
  const repertoire = repertoireTemporaire(t);
  const premiere = brancherGardeFous(REGLAGES, demarrer({ repertoireEtat: repertoire, projet: "brigade" }));
  chef(repertoire, "kitchen.stopped");
  assert.throws(
    () => premiere.lancer({ ticket: 7, commande: FAUX_CLAUDE, args: [] }),
    (erreur: unknown) => erreur instanceof LancementRefuse && erreur.motif === "stopped",
  );
  premiere.arreter("SIGTERM");

  const { cook } = cuisine(t, {}, repertoire);
  assert.throws(() => cook(7, "fini"), LancementRefuse);

  chef(repertoire, "kitchen.resumed");

  assert.equal((await cook(7, "fini").fin).outcome, "ok");
});

test("un cook meurt avec le runtime, et le démarrage suivant note son interruption sur son ticket", async (t) => {
  const repertoire = repertoireTemporaire(t);
  const premiere = brancherGardeFous(REGLAGES, demarrer({ repertoireEtat: repertoire, projet: "brigade" }));
  const lance = premiere.lancer({ ticket: 7, commande: FAUX_CLAUDE, args: [], env: { PATH: process.env.PATH ?? "", FAUX_CLAUDE: "sourd" } });

  premiere.arreter("SIGTERM");
  const fin = await lance.fin;

  assert.equal(fin.outcome, "interrupted");
  assert.equal(vivant(lance.pid ?? 0), false);

  const { runtime, faits } = cuisine(t, {}, repertoire);
  assert.deepEqual(faits(7), ["cook.launched", "cook.interrupted"]);
  assert.deepEqual(runtime.journal.duTicket(7).at(-1)?.payload, { run: lance.run });
  assert.deepEqual(cooksEnCours(runtime.journal.base), []);
  assert.equal(etatDesGardeFous(runtime.journal.base).failures, 0);
  assert.deepEqual(faits().filter((type) => type.startsWith("runtime.")), ["runtime.started", "runtime.stopped", "runtime.started"]);
});

test("un runtime arrêté ne lance plus rien", (t) => {
  const repertoire = repertoireTemporaire(t);
  const runtime = brancherGardeFous(REGLAGES, demarrer({ repertoireEtat: repertoire, projet: "brigade" }));
  runtime.arreter("SIGTERM");

  assert.throws(() => runtime.lancer({ ticket: 7, commande: FAUX_CLAUDE, args: [] }), /arrêté/);
});
