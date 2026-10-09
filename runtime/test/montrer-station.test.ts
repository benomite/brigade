// La commande par laquelle le chef voit la station : `npm run station`.
import assert from "node:assert/strict";
import { join } from "node:path";
import { test, type TestContext } from "node:test";
import type { Fait } from "../src/evenements.ts";
import { ouvrirJournal } from "../src/journal.ts";
import { horloge, lancer, repertoireTemporaire } from "./outils.ts";

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
  const montrer = async (...args: string[]) => {
    const commande = lancer(t, MONTRER, args, { BRIGADE_STATE_DIR: repertoire });
    return { code: await commande.fin, sortie: commande.sortie() };
  };
  return { repertoire, journal, noter, annoncer, lancerCook, montrer };
}

test("le chef voit la station : son nom, ce qu'elle fournit, son plafond, sa connexion et son quota", async (t) => {
  const { annoncer, montrer } = cuisine(t);
  annoncer();

  const { code, sortie } = await montrer();

  assert.equal(code, 0);
  assert.match(sortie, /station\s+box\/claude — moteur claude, fournit : code/);
  assert.match(sortie, /cooks simultanés\s+1 au plus \(le défaut : le chef n'a rien réglé\) — `station -- cooks <N>` pour le changer, 0 pour aucune limite/);
  assert.match(sortie, /machine\s+tient/);
  assert.match(sortie, /connexion Max\s+tenue pour bonne/);
  assert.match(sortie, /quota\s+disponible/);
  assert.match(sortie, /retenue\s+aucune — tout ticket servable part/);
  assert.match(sortie, /cooks en cours\s+aucun/);
  assert.match(sortie, /derniers cooks\s+aucun/);
  assert.match(sortie, /consommé\s+en cours : rien\n\s+5 h : rien\n\s+24 h : rien/);
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
  assert.match(sortie, /consommé\s+en cours : 1 lancement · 3 tours · 1\s200 tokens\n\s+5 h : /);
  assert.match(sortie, /cooks en cours\s+1\n  #8  8-b  sonnet \/ medium  lancé le 2026-10-08T10:00:04.000Z  cook\/8-b/);
  assert.match(sortie, /2026-10-08T10:00:02.000Z  #7  7-a  opus \/ high  fini  12 tours · 34\s567 tokens · 4,2 min  https:\/\/github.com\/o\/r\/pull\/9/);
});

test("un quota épuisé se lit « 86 » avec l'heure de son retour ; passé cette heure, il est disponible", async (t) => {
  const { annoncer, noter, montrer } = cuisine(t);
  annoncer();
  const epuiser = (until: string) => noter({ type: "station.86", payload: { station: STATION, reason: "quota", until, window: "five_hour" } });

  epuiser("2999-01-01T00:00:00.000Z");
  assert.match((await montrer()).sortie, /quota\s+86 — épuisé, retour à 2999-01-01T00:00:00.000Z/);
  epuiser("2000-01-01T00:00:00.000Z");
  assert.match((await montrer()).sortie, /quota\s+disponible/);
});

test("une connexion Max expirée se voit, avec ce qu'il faut faire", async (t) => {
  const { annoncer, noter, montrer } = cuisine(t);
  annoncer();
  noter({ type: "station.disconnected", payload: { station: STATION, reason: "authentication_failed", run: "7-a" } }, 7);

  const { sortie } = await montrer();

  assert.match(sortie, /connexion Max\s+EXPIRÉE depuis le 2026-10-08T10:00:01.000Z \(authentication_failed\).*claude \/login.*reprendre/);
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

  assert.match(sortie, /cooks en cours\s+30\n/);
  assert.equal(sortie.match(/-vif {2}sonnet/g)?.length, 30);
  assert.equal(sortie.match(/-fini {2}sonnet/g)?.length, 10);
});

test("le chef règle le plafond de cooks : le journal le porte, la station le montre, et rien n'est écrit s'il ne change pas", async (t) => {
  const { journal, annoncer, montrer } = cuisine(t);
  annoncer();

  const reglage = await montrer("cooks", "12");

  assert.equal(reglage.code, 0);
  assert.match(reglage.sortie, /box\/claude : cooks simultanés, 12 au plus \(c'était : 1 au plus\) — aucun cook en cours n'est arrêté/);
  assert.match(reglage.sortie, /aucun runtime ne tourne/);
  const fait = journal.tout().at(-1);
  assert.deepEqual([fait?.type, fait?.author, fait?.payload], ["station.capped", "chef", { station: STATION, maxCooks: 12 }]);
  assert.match((await montrer()).sortie, /cooks simultanés\s+12 au plus \(réglé par le chef\)/);

  assert.match((await montrer("cooks", "12")).sortie, /plafond déjà réglé — 12 au plus/);
  assert.equal(journal.tout().filter((evenement) => evenement.type === "station.capped").length, 1);
});

test("zéro lève la limite", async (t) => {
  const { annoncer, montrer } = cuisine(t);
  annoncer();

  assert.match((await montrer("cooks", "0")).sortie, /cooks simultanés, sans limite \(c'était : 1 au plus\)/);
  assert.match((await montrer()).sortie, /cooks simultanés\s+sans limite \(réglé par le chef\)/);
});

test("une base d'intégration rouge se lit sur la ligne de retenue", async (t) => {
  const { annoncer, noter, montrer } = cuisine(t);
  annoncer();
  noter({ type: "station.held", payload: { station: STATION, reason: "base" } });

  assert.match((await montrer()).sortie, /retenue\s+depuis le 2026-10-08T10:00:01.000Z — base d'intégration rouge : les tickets servables attendent/);
});

test("une machine saturée se voit, avec ce qui manque", async (t) => {
  const { annoncer, noter, montrer } = cuisine(t);
  annoncer();
  noter({ type: "station.saturated", payload: { station: STATION, resource: "disk", observed: 2048, limit: 5120 } });
  noter({ type: "station.held", payload: { station: STATION, reason: "machine" } });

  assert.match((await montrer()).sortie, /retenue\s+depuis le 2026-10-08T10:00:02.000Z — machine saturée : les tickets servables attendent/);
  assert.match((await montrer()).sortie, /machine\s+SATURÉE depuis le 2026-10-08T10:00:01.000Z — 2\s048 Mo de disque libre pour 5\s120 au moins ; plus aucun ticket n'est pris/);
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
  assert.match(sansStation.sortie, /aucune station ne s'est annoncée/);
  assert.equal(journal.tout().some((evenement) => evenement.type === "station.capped"), false);
});

test("une station qui ne s'est jamais annoncée le dit", async (t) => {
  const { montrer } = cuisine(t);

  const { code, sortie } = await montrer();

  assert.equal(code, 0);
  assert.match(sortie, /aucune station ne s'est annoncée/);
});

test("sans répertoire d'état, sans journal, ou avec un argument, la commande échoue en disant pourquoi", async (t) => {
  const sansVariable = lancer(t, MONTRER, []);
  const sansJournal = lancer(t, MONTRER, [], { BRIGADE_STATE_DIR: repertoireTemporaire(t) });
  const avecArgument = lancer(t, MONTRER, ["14"], { BRIGADE_STATE_DIR: repertoireTemporaire(t) });

  assert.equal(await sansVariable.fin, 2);
  assert.match(sansVariable.sortie(), /BRIGADE_STATE_DIR n'est pas défini/);
  assert.equal(await sansJournal.fin, 1);
  assert.match(sansJournal.sortie(), /aucun journal/);
  assert.equal(await avecArgument.fin, 2);
  assert.match(avecArgument.sortie(), /usage/);
});
