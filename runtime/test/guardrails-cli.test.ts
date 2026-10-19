// La commande par laquelle le chef voit et commande les garde-fous :
// `npm run guardrails -- [stop | resume]`. Elle se joue dans le process du
// test ; depuis le sien, là où c'est lui qu'on regarde — un `stop` qui arrête
// les cooks d'un runtime qui tourne ailleurs, un refus rendu par son code.
import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { test, type TestContext } from "node:test";
import { plugGuardrails, type Reglages } from "../src/guardrails.ts";
import { principal as guardrails } from "../src/guardrails-cli.ts";
import { openLog } from "../src/log.ts";
import { demarrer } from "../src/runtime.ts";
import { sansMotFrancais } from "./aides/glossaire.ts";
import { appeler, ENV_ENFANT, FAUX_CLAUDE, horloge, JOUR_HORLOGE, lancer, repertoireTemporaire } from "./outils.ts";

const CLI = join(import.meta.dirname, "../src/guardrails-cli.ts");

// Le cook « bavard » rend un tour toutes les deux millisecondes, de vraie
// horloge : le plafond de tours n'est atteint qu'après 200 s. Celui qui
// éprouve un plafond règle le sien.
const REGLAGES: Reglages = {
  plafonds: { turns: 100_000, durationMs: 60 * 60_000, tokens: 2_000_000, idleMs: 10 * 60_000 },
  seuilDisjoncteur: 3,
  graceMs: 2000,
};

function kitchen(t: TestContext, reglages: Partial<Reglages> = {}) {
  const repertoire = repertoireTemporaire(t);
  const runtime = plugGuardrails(
    { ...REGLAGES, ...reglages },
    demarrer({ repertoireEtat: repertoire, projet: "brigade", intervalleVeilleMs: 5, maintenant: horloge() }),
  );
  t.after(() => runtime.arreter("test"));
  const cook = (ticket: number, scenario: string) =>
    runtime.lancer({ ticket, commande: FAUX_CLAUDE, args: [], env: { ...ENV_ENFANT, FAUX_CLAUDE: scenario } });
  const rendre = async (cli: { fin: Promise<number | null>; sortie: () => string }) => ({ code: await cli.fin, sortie: cli.sortie() });
  const commande = (...args: string[]) => rendre(appeler(guardrails, args, { BRIGADE_STATE_DIR: repertoire }));
  // Par son fichier, dans son propre process : comme `npm run` la lance.
  const lancee = (...args: string[]) => rendre(lancer(t, CLI, args, { BRIGADE_STATE_DIR: repertoire }));
  const commandes = () => runtime.journal.tout().filter((e) => e.type.startsWith("kitchen."));
  return { runtime, repertoire, cook, commande, lancee, commandes };
}

test("sans argument, le chef voit les plafonds, la cuisine ouverte, le disjoncteur fermé et aucun cook", async (t) => {
  const { commande } = kitchen(t);

  const { code, sortie } = await commande();

  assert.equal(code, 0);
  assert.match(sortie, /caps per ticket\s+100,000 turns · 60 min · 2,000,000 tokens · idle 10 min/);
  assert.match(sortie, /kitchen\s+open/);
  assert.match(sortie, /breaker\s+closed — 0 failure in a row, opens at 3/);
  assert.match(sortie, /cooks running\s+none/);
  assert.match(sortie, /latest guardrail stops\s+none/);
});

test("voir ne modifie pas le journal", async (t) => {
  const { runtime, commande } = kitchen(t);
  const avant = runtime.journal.tout();

  await commande();

  assert.deepEqual(runtime.journal.tout(), avant);
});

test("le chef voit les cooks en cours, avec leur ticket et leur run", async (t) => {
  const { cook, commande } = kitchen(t);
  const lance = cook(7, "muet");

  const { sortie } = await commande();

  assert.match(sortie, new RegExp(`cooks running\\s+1\\n\\s+#7\\s+${lance.run}\\s+launched ${JOUR_HORLOGE}T`));
});

test("un jugement du manager en cours se lit comme tel : il ne tient aucun ticket", async (t) => {
  const { runtime, commande } = kitchen(t);
  const lance = runtime.lancer({ ticket: null, run: "juge-30-abcd", commande: FAUX_CLAUDE, args: [], env: { ...ENV_ENFANT, FAUX_CLAUDE: "muet" } });

  const { sortie } = await commande();

  assert.match(sortie, new RegExp(`cooks running\\s+1\\n\\s+manager\\s+${lance.run}\\s+launched `));
});

test("un jugement du manager arrêté par un garde-fou se lit comme tel dans les derniers arrêts", async (t) => {
  const { runtime, commande } = kitchen(t, { plafonds: { ...REGLAGES.plafonds, turns: 2 } });
  const lance = runtime.lancer({ ticket: null, run: "juge-30-abcd", commande: FAUX_CLAUDE, args: [], env: { ...ENV_ENFANT, FAUX_CLAUDE: "bavard" } });
  await lance.fin;

  const { sortie } = await commande();

  assert.match(sortie, /latest guardrail stops\s*\n\s+\S+\s+manager\s+juge-30-abcd/);
  assert.doesNotMatch(sortie, /#null/);
});

test("« stop » arrête tous les cooks en cours, au nom du chef, et le chef le constate", async (t) => {
  const { runtime, cook, lancee, commandes } = kitchen(t);
  const [premier, second] = [cook(7, "bavard"), cook(8, "muet")];

  const stop = await lancee("stop");
  assert.equal(stop.code, 0);
  const fins = await Promise.all([premier.fin, second.fin]);

  assert.match(stop.sortie, /kitchen stopped/);
  assert.deepEqual(fins.map((fin) => fin.outcome), ["stop", "stop"]);
  assert.deepEqual(commandes().map((e) => [e.type, e.author, e.project, e.ticket]), [["kitchen.stopped", "chef", "brigade", null]]);
  assert.throws(() => cook(9, "fini"), /cuisine arrêtée/);

  const { sortie } = await lancee();
  assert.match(sortie, /kitchen\s+STOPPED by the chef on \d{4}-\d{2}-\d{2}T.* — `resume` to restart/);
  assert.match(sortie, /cooks running\s+none/);
  assert.match(sortie, new RegExp(`#7\\s+${premier.run}\\s+the chef's \`stop\``));
  assert.match(sortie, new RegExp(`#8\\s+${second.run}\\s+the chef's \`stop\``));
  assert.equal(runtime.journal.duTicket(7).at(-1)?.type, "cook.exited");
});

test("« stop » deux fois ne s'écrit qu'une fois ; « resume » rouvre la cuisine", async (t) => {
  const { cook, commande, commandes } = kitchen(t);
  await commande("stop");
  const encore = await commande("stop");

  assert.equal(encore.code, 0);
  assert.match(encore.sortie, /already stopped/);

  const reprise = await commande("resume");

  assert.equal(reprise.code, 0);
  assert.match(reprise.sortie, /kitchen reopened/);
  assert.deepEqual(commandes().map((e) => [e.type, e.author]), [["kitchen.stopped", "chef"], ["kitchen.resumed", "chef"]]);
  assert.equal((await cook(7, "fini").fin).outcome, "ok");
});

test("« resume » rétablit une station dont la connexion Max avait expiré", async (t) => {
  const { runtime, commande, commandes } = kitchen(t);
  runtime.journal.ajouter({
    project: "brigade",
    ticket: null,
    author: "station:box/claude",
    type: "station.disconnected",
    payload: { station: "box/claude", reason: "authentication_failed", run: null },
  });

  const { code, sortie } = await commande("resume");

  assert.equal(code, 0);
  assert.match(sortie, /Max connection taken as restored/);
  assert.deepEqual(commandes().map((e) => e.type), ["kitchen.resumed"]);
});

test("« resume » quand rien n'est arrêté ne s'écrit pas", async (t) => {
  const { commande, commandes } = kitchen(t);

  const { code, sortie } = await commande("resume");

  assert.equal(code, 0);
  assert.match(sortie, /nothing to resume/);
  assert.deepEqual(commandes(), []);
});

test("le chef voit le disjoncteur ouvert et pourquoi chaque ticket s'est arrêté ; « resume » le referme", async (t) => {
  const { cook, commande } = kitchen(t, { seuilDisjoncteur: 2, plafonds: { ...REGLAGES.plafonds, turns: 3 } });
  const turns = cook(7, "bavard");
  await turns.fin;
  await cook(8, "echec").fin;

  const { sortie } = await commande();

  assert.match(sortie, new RegExp(`breaker\\s+OPEN since ${JOUR_HORLOGE}T.* after 2 failures in a row — no more cooks are launched; \`resume\` to close it`));
  assert.match(sortie, new RegExp(`#7\\s+${turns.run}\\s+turns cap exceeded: 4 for 3`));
  assert.throws(() => cook(9, "fini"), /disjoncteur/);

  assert.match((await commande("resume")).sortie, /breaker closed/);
  assert.match((await commande()).sortie, /breaker\s+closed — 0 failure/);
});

test("un arrêt pour inactivité se lit avec sa durée", async (t) => {
  const { cook, commande } = kitchen(t, { plafonds: { ...REGLAGES.plafonds, idleMs: 100 } });
  await cook(7, "muet").fin;

  const { sortie } = await commande();

  assert.match(sortie, /caps per ticket.*idle 0\.1 s/);
  // La durée relevée est celle d'un vrai minuteur : sur une machine chargée, il sonne en retard.
  assert.match(sortie, /#7\s+\S+\s+idle: nothing produced for \d+\.\d s \(threshold 0\.1 s\)/);
});

test("« stop » sans runtime qui tourne tient quand même, et le dit", async (t) => {
  const repertoire = repertoireTemporaire(t);
  plugGuardrails(REGLAGES, demarrer({ repertoireEtat: repertoire, projet: "brigade" })).arreter("SIGTERM");

  const cli = appeler(guardrails, ["stop"], { BRIGADE_STATE_DIR: repertoire });

  assert.equal(await cli.fin, 0);
  assert.match(cli.sortie(), /no runtime is running/);
  const runtime = plugGuardrails(REGLAGES, demarrer({ repertoireEtat: repertoire, projet: "brigade" }));
  t.after(() => runtime.arreter("test"));
  assert.throws(() => runtime.lancer({ ticket: 7, commande: FAUX_CLAUDE, args: [] }), /cuisine arrêtée/);
});

test("sans journal dans le répertoire d'état, la commande échoue, le dit, et ne crée rien", async (t) => {
  const repertoire = repertoireTemporaire(t);

  for (const args of [[], ["stop"]]) {
    const cli = appeler(guardrails, args, { BRIGADE_STATE_DIR: repertoire });
    assert.equal(await cli.fin, 1);
    assert.match(cli.sortie(), /no log/);
  }
  assert.equal(existsSync(join(repertoire, "log.db")), false);
});

test("devant un journal d'avant les garde-fous, la commande dit de redémarrer le runtime", async (t) => {
  const repertoire = repertoireTemporaire(t);
  openLog(repertoire, { projections: [] }).fermer();

  const cli = appeler(guardrails, [], { BRIGADE_STATE_DIR: repertoire });

  assert.equal(await cli.fin, 1);
  assert.match(cli.sortie(), /restart the runtime/);
  assert.doesNotMatch(cli.sortie(), /at .*\.ts/);
});

test("sans BRIGADE_STATE_DIR, la commande échoue et nomme la variable", async (t) => {
  const cli = lancer(t, CLI, ["stop"]);

  assert.equal(await cli.fin, 2);
  assert.match(cli.sortie(), /BRIGADE_STATE_DIR/);
});

test("une commande inconnue est refusée avec l'usage, sans rien écrire", async (t) => {
  const { commande, commandes } = kitchen(t);

  const { code, sortie } = await commande("arrete");

  assert.equal(code, 2);
  assert.match(sortie, /usage:/);
  assert.deepEqual(commandes(), []);
});

test("`stop`, `resume`, l'état et chacun de leurs refus ne portent aucun mot français du glossaire", async (t) => {
  const { cook, commande } = kitchen(t, { seuilDisjoncteur: 2, plafonds: { ...REGLAGES.plafonds, turns: 3 } });
  const lignes = async (...args: string[]) => (await commande(...args)).sortie.trimEnd().split("\n");

  sansMotFrancais(await lignes("resume"));
  const turns = cook(7, "bavard");
  await turns.fin;
  await cook(8, "echec").fin;
  // Le disjoncteur ouvert et les arrêts par plafond, puis `resume`, qui le referme.
  sansMotFrancais(await lignes());
  sansMotFrancais(await lignes("resume"));
  const stop = await lignes("stop");
  assert.match(stop.join("\n"), /kitchen stopped/);
  sansMotFrancais(stop);
  sansMotFrancais(await lignes());
  sansMotFrancais(await lignes("stop"));
  sansMotFrancais(await lignes("resume"));

  for (const args of [["arrete"], ["stop", "resume"]]) {
    const refus = await commande(...args);
    assert.equal(refus.code, 2);
    sansMotFrancais(refus.sortie.trimEnd().split("\n"));
  }
});

test("les refus de la commande, sans état, sans journal ou devant un journal d'avant, ne portent aucun mot français", async (t) => {
  const repertoire = repertoireTemporaire(t);
  const sansEtat = await appeler(guardrails, ["stop"], {});
  assert.equal(await sansEtat.fin, 2);
  sansMotFrancais(sansEtat.sortie().trimEnd().split("\n"));
  const withoutLog = appeler(guardrails, [], { BRIGADE_STATE_DIR: repertoire });
  assert.equal(await withoutLog.fin, 1);
  sansMotFrancais(withoutLog.sortie().trimEnd().split("\n"));
  openLog(repertoire, { projections: [] }).fermer();
  const ancien = appeler(guardrails, [], { BRIGADE_STATE_DIR: repertoire });
  assert.equal(await ancien.fin, 1);
  sansMotFrancais(ancien.sortie().trimEnd().split("\n"));
});

test("un arrêt posé avant le ticket est toujours montré, et `resume` le lève, sans rien éditer à la main", async (t) => {
  const { runtime, commande } = kitchen(t);
  // L'événement tel qu'une version d'avant l'écrivait : rien n'y est de la langue de la commande.
  runtime.journal.ajouter({ project: "brigade", ticket: null, author: "chef", type: "kitchen.stopped", payload: {} });

  const montre = await commande();
  assert.match(montre.sortie, /^kitchen\s+STOPPED by the chef on /m);
  assert.throws(() => runtime.lancer({ ticket: 7, commande: FAUX_CLAUDE, args: [] }), /cuisine arrêtée/);

  assert.match((await commande("resume")).sortie, /kitchen reopened/);
  assert.match((await commande()).sortie, /^kitchen\s+open$/m);
});
