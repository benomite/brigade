// La commande par laquelle le chef voit la station : `npm run station`.
import assert from "node:assert/strict";
import { join } from "node:path";
import { test, type TestContext } from "node:test";
import type { Fait } from "../src/evenements.ts";
import { ouvrirJournal } from "../src/journal.ts";
import { principal as montrerStation } from "../src/montrer-station.ts";
import { appeler, horloge, JOUR_HORLOGE, lancer, repertoireTemporaire } from "./outils.ts";

const MONTRER = join(import.meta.dirname, "../src/montrer-station.ts");
const STATION = "box/claude";
const LIMITES = { turns: 100, durationMs: 3_600_000, tokens: 2_000_000, idleMs: 600_000 };

function cuisine(t: TestContext) {
  const repertoire = repertoireTemporaire(t);
  const journal = ouvrirJournal(repertoire, { maintenant: horloge() });
  t.after(() => journal.fermer());
  const noter = (fait: Fait, ticket: number | null = null, author = `station:${STATION}`) =>
    journal.ajouter({ project: "brigade", ticket, author, ...fait });
  const annoncer = () => noter({ type: "station.announced", payload: { station: STATION, engine: "claude", provides: ["code"], maxCooks: 1 } });
  const lancerCook = (run: string, ticket: number, model = "sonnet", effort = "medium") =>
    noter(
      { type: "cook.launched", payload: { run, limits: LIMITES, stream: `runs/${run}.jsonl`, station: STATION, model, effort, branch: `cook/${run}`, worktree: `worktrees/${run}` } },
      ticket,
      "runtime",
    );
  const rendre = async (commande: { fin: Promise<number | null>; sortie: () => string }) => ({ code: await commande.fin, sortie: commande.sortie() });
  const montrer = (...args: string[]) => rendre(appeler(montrerStation, args, { BRIGADE_STATE_DIR: repertoire }));
  // Par son fichier, dans son propre process : comme `npm run` la lance.
  const lancee = (...args: string[]) => rendre(lancer(t, MONTRER, args, { BRIGADE_STATE_DIR: repertoire }));
  return { repertoire, journal, noter, annoncer, lancerCook, montrer, lancee };
}

test("le chef voit la station : son nom, ce qu'elle fournit, son plafond, sa connexion et son quota", async (t) => {
  const { annoncer, lancee } = cuisine(t);
  annoncer();

  const { code, sortie } = await lancee();

  assert.equal(code, 0);
  assert.match(sortie, /station\s+box\/claude — engine claude, provides: code/);
  assert.match(sortie, /simultaneous cooks\s+1 at most — declared — `station -- cooks <N>` to change it, 0 for no limit\n/);
  assert.match(sortie, /machine\s+holds/);
  assert.match(sortie, /Max connection\s+taken as good/);
  assert.match(sortie, /quota\s+available/);
  assert.match(sortie, /withholding\s+none — every servable ticket leaves/);
  assert.match(sortie, /cooks running\s+none/);
  assert.match(sortie, /latest cooks\s+none/);
  assert.match(sortie, /consumed\s+in flight: nothing\n\s+5 h: nothing\n\s+24 h: nothing\n\s+what this project has launched, not the account's consumption: \/usage gives it/);
});

test("le chef voit ce qu'il paie : chaque cook avec son calibrage, sa fin et ce qu'il a consommé", async (t) => {
  const { annoncer, lancerCook, noter, montrer } = cuisine(t);
  annoncer();
  lancerCook("7-a", 7, "opus", "high");
  noter({ type: "cook.exited", payload: { run: "7-a", outcome: "ok", code: 0, signal: null, turns: 12, tokens: 34_567, durationMs: 252_000 } }, 7, "runtime");
  noter({ type: "cook.reported", payload: { run: "7-a", ending: "done", reason: null, summary: "fait", branch: "cook/7-a", pr: "https://github.com/o/r/pull/9" } }, 7);
  lancerCook("8-b", 8);
  noter({ type: "cook.progressed", payload: { run: "8-b", turns: 3, tokens: 1200 } }, 8, "runtime");

  const { sortie } = await montrer();

  // Les fenêtres de 5 h et de 24 h se comptent jusqu'à l'heure de la commande :
  // seul ce qui tourne se lit ici sans dépendre du jour où le test est joué.
  assert.match(sortie, /consumed\s+in flight: 1 launch · 3 turns · 1,200 tokens\n\s+5 h: /);
  assert.match(sortie, new RegExp(String.raw`cooks running\s+1\n  #8  8-b  sonnet \/ medium  launched on ${JOUR_HORLOGE}T10:00:04.000Z  cook\/8-b`));
  assert.match(sortie, new RegExp(String.raw`${JOUR_HORLOGE}T10:00:02.000Z  #7  7-a  opus \/ high  done  12 turns · 34,567 tokens · 4.2 min  https:\/\/github.com\/o\/r\/pull\/9`));
});

test("un quota épuisé se lit « 86 » avec l'heure de son retour ; passé cette heure, il est disponible", async (t) => {
  const { annoncer, noter, montrer } = cuisine(t);
  annoncer();
  const epuiser = (until: string) => noter({ type: "station.86", payload: { station: STATION, reason: "quota", until, window: "five_hour" } });

  epuiser("2999-01-01T00:00:00.000Z");
  assert.match((await montrer()).sortie, /quota\s+86 — exhausted, back at 2999-01-01T00:00:00.000Z/);
  epuiser("2000-01-01T00:00:00.000Z");
  assert.match((await montrer()).sortie, /quota\s+available/);
});

test("une connexion Max expirée se voit, avec ce qu'il faut faire", async (t) => {
  const { annoncer, noter, montrer } = cuisine(t);
  annoncer();
  noter({ type: "station.disconnected", payload: { station: STATION, reason: "authentication_failed", run: "7-a" } }, 7);

  const { sortie } = await montrer();

  assert.match(sortie, new RegExp(String.raw`Max connection\s+EXPIRED since ${JOUR_HORLOGE}T10:00:01.000Z \(authentication_failed\).*claude \/login.*starts again on its own`));
});

test("à trente cooks, la station les montre tous, et ses dix derniers cooks finis", async (t) => {
  const { annoncer, lancerCook, noter, montrer } = cuisine(t);
  annoncer();
  for (let n = 1; n <= 12; n++) {
    lancerCook(`${n}-fini`, n);
    noter({ type: "cook.exited", payload: { run: `${n}-fini`, outcome: "ok", code: 0, signal: null, turns: 1, tokens: 1, durationMs: 1000 } }, n, "runtime");
  }
  for (let n = 101; n <= 130; n++) lancerCook(`${n}-vif`, n);

  const { sortie } = await montrer();

  assert.match(sortie, /cooks running\s+30\n/);
  assert.equal(sortie.match(/-vif {2}sonnet/g)?.length, 30);
  assert.equal(sortie.match(/-fini {2}sonnet/g)?.length, 10);
});

test("le chef règle le plafond de cooks : le journal le porte, la station le montre, et rien n'est écrit s'il ne change pas", async (t) => {
  const { journal, annoncer, montrer } = cuisine(t);
  annoncer();

  const reglage = await montrer("cooks", "12");

  assert.equal(reglage.code, 0);
  assert.match(reglage.sortie, /box\/claude: simultaneous cooks, 12 at most — set by you, replaces 1 \(declared\) — no running cook is stopped/);
  assert.match(reglage.sortie, /no runtime is running/);
  const fait = journal.tout().at(-1);
  assert.deepEqual([fait?.type, fait?.author, fait?.payload], ["station.capped", "chef", { station: STATION, maxCooks: 12 }]);
  assert.match((await montrer()).sortie, /simultaneous cooks\s+12 at most — set by you, replaces 1 \(declared\) — `station -- cooks <N>` to change it, 0 for no limit, `station -- cooks auto` to come back to the default/);

  assert.match((await montrer("cooks", "12")).sortie, /cap already set — 12 at most/);
  assert.equal(journal.tout().filter((evenement) => evenement.type === "station.capped").length, 1);
});

test("zéro lève la limite", async (t) => {
  const { annoncer, montrer } = cuisine(t);
  annoncer();

  assert.match((await montrer("cooks", "0")).sortie, /simultaneous cooks, no limit — set by you, replaces 1 \(declared\) — no running cook/);
  assert.match((await montrer()).sortie, /simultaneous cooks\s+no limit — set by you/);
  // D'un réglage à l'autre, ce qu'il remplaçait de lui-même se lit aussi.
  assert.match((await montrer("cooks", "4")).sortie, /simultaneous cooks, 4 at most — set by you, replaces 1 \(declared\) \(was: no limit, set by you\)/);
});

test("sur huit cœurs, le plafond par défaut est trois ; le chef le règle à cinq, puis le retire par `cooks auto` et les trois reviennent", async (t) => {
  const { journal, noter, montrer } = cuisine(t);
  noter({ type: "station.announced", payload: { station: STATION, engine: "claude", provides: ["code"], maxCooks: 30, cores: 8 } });

  assert.match((await montrer()).sortie, /simultaneous cooks\s+3 at most — 8 cores — `station -- cooks <N>` to change it, 0 for no limit\n/);

  const reglage = await montrer("cooks", "5");
  assert.equal(reglage.code, 0);
  assert.match(reglage.sortie, /box\/claude: simultaneous cooks, 5 at most — set by you, replaces 3 \(8 cores\) — no running cook is stopped/);
  assert.match((await montrer()).sortie, /simultaneous cooks\s+5 at most — set by you, replaces 3 \(8 cores\)/);

  const retrait = await montrer("cooks", "auto");
  assert.equal(retrait.code, 0);
  assert.match(retrait.sortie, /box\/claude: simultaneous cooks, 3 at most — 8 cores \(was: 5 at most, set by you\)/);
  assert.deepEqual(journal.tout().at(-1)?.payload, { station: STATION, maxCooks: null });
  assert.match((await montrer()).sortie, /simultaneous cooks\s+3 at most — 8 cores — /);

  // Rien à retirer : rien n'est écrit.
  assert.match((await montrer("cooks", "auto")).sortie, /no cap set by you, already the default — 3 at most — 8 cores/);
  assert.equal(journal.tout().filter((evenement) => evenement.type === "station.capped").length, 2);
  // Ni un autre mot.
  assert.equal((await montrer("cooks", "defaut")).code, 2);
});

test("une base d'intégration rouge se lit sur la ligne de retenue", async (t) => {
  const { annoncer, noter, montrer } = cuisine(t);
  annoncer();
  noter({ type: "station.held", payload: { station: STATION, reason: "base" } });

  assert.match((await montrer()).sortie, new RegExp(String.raw`withholding\s+since ${JOUR_HORLOGE}T10:00:01.000Z — integration base red: the servable tickets wait`));
});

test("un arbitre injoignable se voit, avec le mode dégradé ; rien n'en est dit tant qu'il répond", async (t) => {
  const { annoncer, noter, montrer } = cuisine(t);
  annoncer();
  assert.doesNotMatch((await montrer()).sortie, /^arbiter/m);
  noter({ type: "station.unarbitrated", payload: { station: STATION, reason: "connexion refusée" } });
  noter({ type: "station.held", payload: { station: STATION, reason: "unarbitrated" } });

  const { sortie } = await montrer();
  assert.match(sortie, new RegExp(String.raw`^arbiter\s+UNREACHABLE since ${JOUR_HORLOGE}T10:00:01.000Z \(connexion refusée\) — degraded mode: one cook at a time, no arbitration, until it returns$`, "m"));
  assert.match(sortie, /withholding\s+since .* — arbiter unreachable, one cook at a time: the servable tickets wait/);
});

test("une machine saturée se voit, avec ce qui manque", async (t) => {
  const { annoncer, noter, montrer } = cuisine(t);
  annoncer();
  noter({ type: "station.saturated", payload: { station: STATION, resource: "disk", observed: 2048, limit: 5120 } });
  noter({ type: "station.held", payload: { station: STATION, reason: "machine" } });

  assert.match((await montrer()).sortie, new RegExp(String.raw`withholding\s+since ${JOUR_HORLOGE}T10:00:02.000Z — machine saturated: the servable tickets wait`));
  assert.match((await montrer()).sortie, new RegExp(String.raw`machine\s+SATURATED since ${JOUR_HORLOGE}T10:00:01.000Z on disk — 2,048 MB of disk free for at least 5,120 MB; no ticket is taken`));
});

test("un plafond qui n'est pas un nombre, ou réglé avant toute station, est refusé sans rien écrire", async (t) => {
  const { journal, noter, montrer } = cuisine(t);
  noter({ type: "runtime.started", payload: { pid: 1, host: "box", node: "v26" } }, null, "runtime");

  for (const args of [["cooks"], ["cooks", "-1"], ["cooks", "beaucoup"], ["cooks", "3", "4"], ["stop"]]) {
    const { code, sortie } = await montrer(...args);
    assert.deepEqual([code, /usage/.test(sortie)], [2, true]);
  }
  const sansStation = await montrer("cooks", "3");
  assert.equal(sansStation.code, 1);
  assert.match(sansStation.sortie, /no station has announced itself/);
  assert.equal(journal.tout().some((evenement) => evenement.type === "station.capped"), false);
});

test("une station qui ne s'est jamais annoncée le dit", async (t) => {
  const { montrer } = cuisine(t);

  const { code, sortie } = await montrer();

  assert.equal(code, 0);
  assert.match(sortie, /no station has announced itself/);
});

test("un projet qui ne déclare aucune station : la commande le dit, avec le geste, et ne règle aucun plafond", async (t) => {
  const { journal, noter, montrer } = cuisine(t);
  noter({ type: "runtime.started", payload: { pid: 1, host: "box", node: "v26" } }, null, "runtime");
  noter({ type: "stations.undeclared", payload: {} }, null, "runtime");

  const vue = await montrer();
  assert.equal(vue.code, 0);
  assert.match(vue.sortie, /no station declared since .* — no cook leaves, the tickets stay queued: set them with `brigade <projet> station stations box\/claude:30:code\+raisonnement`, read at the next wake-up, no restart/);

  const reglage = await montrer("cooks", "3");
  assert.equal(reglage.code, 1);
  assert.match(reglage.sortie, /the project declares no station: there is no cap to set — set them with `brigade <projet> station stations /);
  assert.equal(journal.tout().some((evenement) => evenement.type === "station.capped"), false);
});

test("deux stations déclarées : la commande montre chacune, avec ce qu'elle fournit et son plafond ; une station retirée n'y est plus", async (t) => {
  const { noter, annoncer, montrer } = cuisine(t);
  annoncer();
  const playwright = "box/playwright";
  noter({ type: "station.announced", payload: { station: playwright, engine: "playwright", provides: ["navigateur-headless"], maxCooks: 2 } }, null, `station:${playwright}`);

  const deux = (await montrer()).sortie;
  assert.match(deux, /box\/claude — engine claude, provides: code/);
  assert.match(deux, /box\/playwright — engine playwright, provides: navigateur-headless/);
  assert.match(deux, /2 at most — declared/);

  noter({ type: "station.withdrawn", payload: { station: playwright } }, null, `station:${playwright}`);

  const une = (await montrer()).sortie;
  assert.match(une, /box\/claude — engine claude/);
  assert.doesNotMatch(une, /box\/playwright/);
});

test("sans répertoire d'état, sans journal, ou avec un argument, la commande échoue en disant pourquoi", async (t) => {
  const sansVariable = lancer(t, MONTRER, []);
  const sansJournal = appeler(montrerStation, [], { BRIGADE_STATE_DIR: repertoireTemporaire(t) });
  const avecArgument = appeler(montrerStation, ["14"], { BRIGADE_STATE_DIR: repertoireTemporaire(t) });

  assert.equal(await sansVariable.fin, 2);
  assert.match(sansVariable.sortie(), /BRIGADE_STATE_DIR is not set/);
  assert.equal(await sansJournal.fin, 1);
  assert.match(sansJournal.sortie(), /no log/);
  assert.equal(await avecArgument.fin, 2);
  assert.match(avecArgument.sortie(), /usage/);
});

test("une station distante se lit par sa présence, pas par la machine de la box : absente tant qu'elle ne s'est pas manifestée, présente ensuite, absente de nouveau — sans que ce soit une panne", async (t) => {
  const { noter, annoncer, montrer } = cuisine(t);
  annoncer();
  const MAC = "mac/claude";
  const duMac = (fait: Fait, auteur = `station:${MAC}`) => noter(fait, null, auteur);
  duMac({ type: "station.announced", payload: { station: MAC, engine: "claude", provides: ["chrome-connecté"], maxCooks: 1, remote: true } });

  const jamais = (await montrer()).sortie;
  // La station d'ici garde sa ligne de machine ; la distante n'en a pas.
  assert.equal(jamais.match(/^machine\s/gm)?.length, 1);
  assert.match(jamais, /station\s+mac\/claude — engine claude, provides: chrome-connecté/);
  assert.match(jamais, /presence\s+ABSENT — remote, it pulls its work, and has never shown itself; this is not a failure: the tickets only it can cook wait for its return, the others leave/);

  duMac({ type: "remote.asked", payload: { id: "a", station: MAC, verb: "announce" } });
  duMac({ type: "station.present", payload: { station: MAC } });
  duMac({ type: "remote.asked", payload: { id: "b", station: MAC, verb: "claim" } });
  assert.match((await montrer()).sortie, new RegExp(`presence\\s+present since ${JOUR_HORLOGE}T\\S+ — remote, it pulls its work; last request on ${JOUR_HORLOGE}T`));

  duMac({ type: "station.absent", payload: { station: MAC, lastSeen: `${JOUR_HORLOGE}T10:00:03.000Z`, presenceMs: 120_000 } });
  assert.match((await montrer()).sortie, new RegExp(`presence\\s+ABSENT — remote, it pulls its work, and has not shown itself since ${JOUR_HORLOGE}T`));
  // Une demande faite sous un nom que le projet ne déclare pas ne crée personne.
  duMac({ type: "remote.asked", payload: { id: "c", station: "mac/chrome", verb: "claim" } }, "station:mac/chrome");
  assert.doesNotMatch((await montrer()).sortie, /mac\/chrome/);
});
