// La commande par laquelle le chef voit et commande les garde-fous :
// `npm run garde-fous -- [stop | reprendre]`, depuis son propre process.
import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { test, type TestContext } from "node:test";
import { brancherGardeFous, type Reglages } from "../src/garde-fous.ts";
import { ouvrirJournal } from "../src/journal.ts";
import { demarrer } from "../src/runtime.ts";
import { ENV_ENFANT, FAUX_CLAUDE, horloge, lancer, repertoireTemporaire } from "./outils.ts";

const CLI = join(import.meta.dirname, "../src/garde-fous-cli.ts");

const REGLAGES: Reglages = {
  plafonds: { turns: 100, durationMs: 60 * 60_000, tokens: 2_000_000, idleMs: 10 * 60_000 },
  seuilDisjoncteur: 3,
  graceMs: 2000,
};

function cuisine(t: TestContext, reglages: Partial<Reglages> = {}) {
  const repertoire = repertoireTemporaire(t);
  const runtime = brancherGardeFous(
    { ...REGLAGES, ...reglages },
    demarrer({ repertoireEtat: repertoire, projet: "brigade", intervalleVeilleMs: 5, maintenant: horloge() }),
  );
  t.after(() => runtime.arreter("test"));
  const cook = (ticket: number, scenario: string) =>
    runtime.lancer({ ticket, commande: FAUX_CLAUDE, args: [], env: { ...ENV_ENFANT, FAUX_CLAUDE: scenario } });
  const commande = async (...args: string[]) => {
    const cli = lancer(t, CLI, args, { BRIGADE_STATE_DIR: repertoire });
    return { code: await cli.fin, sortie: cli.sortie() };
  };
  const commandes = () => runtime.journal.tout().filter((e) => e.type.startsWith("kitchen."));
  return { runtime, repertoire, cook, commande, commandes };
}

test("sans argument, le chef voit les plafonds, la cuisine ouverte, le disjoncteur fermé et aucun cook", async (t) => {
  const { commande } = cuisine(t);

  const { code, sortie } = await commande();

  assert.equal(code, 0);
  assert.match(sortie, /plafonds par ticket\s+100 tours · 60 min · 2\s000\s000 tokens · inactivité 10 min/);
  assert.match(sortie, /cuisine\s+ouverte/);
  assert.match(sortie, /disjoncteur\s+fermé — 0 échec d'affilée, ouverture à 3/);
  assert.match(sortie, /cooks en cours\s+aucun/);
  assert.match(sortie, /derniers arrêts par garde-fou\s+aucun/);
});

test("voir ne modifie pas le journal", async (t) => {
  const { runtime, commande } = cuisine(t);
  const avant = runtime.journal.tout();

  await commande();

  assert.deepEqual(runtime.journal.tout(), avant);
});

test("le chef voit les cooks en cours, avec leur ticket et leur run", async (t) => {
  const { cook, commande } = cuisine(t);
  const lance = cook(7, "muet");

  const { sortie } = await commande();

  assert.match(sortie, new RegExp(`cooks en cours\\s+1\\n\\s+#7\\s+${lance.run}\\s+lancé le 2026-10-08T`));
});

test("un jugement du manager en cours se lit comme tel : il ne tient aucun ticket", async (t) => {
  const { runtime, commande } = cuisine(t);
  const lance = runtime.lancer({ ticket: null, run: "juge-30-abcd", commande: FAUX_CLAUDE, args: [], env: { ...ENV_ENFANT, FAUX_CLAUDE: "muet" } });

  const { sortie } = await commande();

  assert.match(sortie, new RegExp(`cooks en cours\\s+1\\n\\s+manager\\s+${lance.run}\\s+lancé le`));
});

test("un jugement du manager arrêté par un garde-fou se lit comme tel dans les derniers arrêts", async (t) => {
  const { runtime, commande } = cuisine(t, { plafonds: { ...REGLAGES.plafonds, turns: 2 } });
  const lance = runtime.lancer({ ticket: null, run: "juge-30-abcd", commande: FAUX_CLAUDE, args: [], env: { ...ENV_ENFANT, FAUX_CLAUDE: "bavard" } });
  await lance.fin;

  const { sortie } = await commande();

  assert.match(sortie, /derniers arrêts par garde-fou\s*\n\s+\S+\s+manager\s+juge-30-abcd/);
  assert.doesNotMatch(sortie, /#null/);
});

test("« stop » arrête tous les cooks en cours, au nom du chef, et le chef le constate", async (t) => {
  const { runtime, cook, commande, commandes } = cuisine(t);
  const [premier, second] = [cook(7, "bavard"), cook(8, "muet")];

  const stop = await commande("stop");
  assert.equal(stop.code, 0);
  const fins = await Promise.all([premier.fin, second.fin]);

  assert.match(stop.sortie, /cuisine arrêtée/);
  assert.deepEqual(fins.map((fin) => fin.outcome), ["stop", "stop"]);
  assert.deepEqual(commandes().map((e) => [e.type, e.author, e.project, e.ticket]), [["kitchen.stopped", "chef", "brigade", null]]);
  assert.throws(() => cook(9, "fini"), /cuisine arrêtée/);

  const { sortie } = await commande();
  assert.match(sortie, /cuisine\s+ARRÊTÉE par le chef le 2026-10-08T.* — « reprendre » pour relancer/);
  assert.match(sortie, /cooks en cours\s+aucun/);
  assert.match(sortie, new RegExp(`#7\\s+${premier.run}\\s+« stop » du chef`));
  assert.match(sortie, new RegExp(`#8\\s+${second.run}\\s+« stop » du chef`));
  assert.equal(runtime.journal.duTicket(7).at(-1)?.type, "cook.exited");
});

test("« stop » deux fois ne s'écrit qu'une fois ; « reprendre » rouvre la cuisine", async (t) => {
  const { cook, commande, commandes } = cuisine(t);
  await commande("stop");
  const encore = await commande("stop");

  assert.equal(encore.code, 0);
  assert.match(encore.sortie, /déjà arrêtée/);

  const reprise = await commande("reprendre");

  assert.equal(reprise.code, 0);
  assert.match(reprise.sortie, /cuisine rouverte/);
  assert.deepEqual(commandes().map((e) => [e.type, e.author]), [["kitchen.stopped", "chef"], ["kitchen.resumed", "chef"]]);
  assert.equal((await cook(7, "fini").fin).outcome, "ok");
});

test("« reprendre » rétablit une station dont la connexion Max avait expiré", async (t) => {
  const { runtime, commande, commandes } = cuisine(t);
  runtime.journal.ajouter({
    project: "brigade",
    ticket: null,
    author: "station:box/claude",
    type: "station.disconnected",
    payload: { station: "box/claude", reason: "authentication_failed", run: null },
  });

  const { code, sortie } = await commande("reprendre");

  assert.equal(code, 0);
  assert.match(sortie, /connexion Max tenue pour rétablie/);
  assert.deepEqual(commandes().map((e) => e.type), ["kitchen.resumed"]);
});

test("« reprendre » quand rien n'est arrêté ne s'écrit pas", async (t) => {
  const { commande, commandes } = cuisine(t);

  const { code, sortie } = await commande("reprendre");

  assert.equal(code, 0);
  assert.match(sortie, /rien à reprendre/);
  assert.deepEqual(commandes(), []);
});

test("le chef voit le disjoncteur ouvert et pourquoi chaque ticket s'est arrêté ; « reprendre » le referme", async (t) => {
  const { cook, commande } = cuisine(t, { seuilDisjoncteur: 2, plafonds: { ...REGLAGES.plafonds, turns: 3 } });
  const tours = cook(7, "bavard");
  await tours.fin;
  await cook(8, "echec").fin;

  const { sortie } = await commande();

  assert.match(sortie, /disjoncteur\s+OUVERT depuis le 2026-10-08T.* après 2 échecs d'affilée — plus aucun cook n'est lancé ; « reprendre » pour le refermer/);
  assert.match(sortie, new RegExp(`#7\\s+${tours.run}\\s+plafond de tours dépassé : 4 pour 3`));
  assert.throws(() => cook(9, "fini"), /disjoncteur/);

  assert.match((await commande("reprendre")).sortie, /disjoncteur refermé/);
  assert.match((await commande()).sortie, /disjoncteur\s+fermé — 0 échec/);
});

test("un arrêt pour inactivité se lit avec sa durée", async (t) => {
  const { cook, commande } = cuisine(t, { plafonds: { ...REGLAGES.plafonds, idleMs: 100 } });
  await cook(7, "muet").fin;

  const { sortie } = await commande();

  assert.match(sortie, /plafonds par ticket.*inactivité 0,1 s/);
  assert.match(sortie, /#7\s+\S+\s+inactif : rien produit depuis 0,\d s \(seuil 0,1 s\)/);
});

test("« stop » sans runtime qui tourne tient quand même, et le dit", async (t) => {
  const repertoire = repertoireTemporaire(t);
  brancherGardeFous(REGLAGES, demarrer({ repertoireEtat: repertoire, projet: "brigade" })).arreter("SIGTERM");

  const cli = lancer(t, CLI, ["stop"], { BRIGADE_STATE_DIR: repertoire });

  assert.equal(await cli.fin, 0);
  assert.match(cli.sortie(), /aucun runtime ne tourne/);
  const runtime = brancherGardeFous(REGLAGES, demarrer({ repertoireEtat: repertoire, projet: "brigade" }));
  t.after(() => runtime.arreter("test"));
  assert.throws(() => runtime.lancer({ ticket: 7, commande: FAUX_CLAUDE, args: [] }), /cuisine arrêtée/);
});

test("sans journal dans le répertoire d'état, la commande échoue, le dit, et ne crée rien", async (t) => {
  const repertoire = repertoireTemporaire(t);

  for (const args of [[], ["stop"]]) {
    const cli = lancer(t, CLI, args, { BRIGADE_STATE_DIR: repertoire });
    assert.equal(await cli.fin, 1);
    assert.match(cli.sortie(), /aucun journal/);
  }
  assert.equal(existsSync(join(repertoire, "log.db")), false);
});

test("devant un journal d'avant les garde-fous, la commande dit de redémarrer le runtime", async (t) => {
  const repertoire = repertoireTemporaire(t);
  ouvrirJournal(repertoire, { projections: [] }).fermer();

  const cli = lancer(t, CLI, [], { BRIGADE_STATE_DIR: repertoire });

  assert.equal(await cli.fin, 1);
  assert.match(cli.sortie(), /redémarrer le runtime/);
  assert.doesNotMatch(cli.sortie(), /at .*\.ts/);
});

test("sans BRIGADE_STATE_DIR, la commande échoue et nomme la variable", async (t) => {
  const cli = lancer(t, CLI, ["stop"]);

  assert.equal(await cli.fin, 2);
  assert.match(cli.sortie(), /BRIGADE_STATE_DIR/);
});

test("une commande inconnue est refusée avec l'usage, sans rien écrire", async (t) => {
  const { commande, commandes } = cuisine(t);

  const { code, sortie } = await commande("arrete");

  assert.equal(code, 2);
  assert.match(sortie, /usage/);
  assert.deepEqual(commandes(), []);
});
