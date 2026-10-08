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
  const montrer = async () => {
    const commande = lancer(t, MONTRER, [], { BRIGADE_STATE_DIR: repertoire });
    return { code: await commande.fin, sortie: commande.sortie() };
  };
  return { repertoire, noter, annoncer, lancerCook, montrer };
}

test("le chef voit la station : son nom, ce qu'elle fournit, son plafond, sa connexion et son quota", async (t) => {
  const { annoncer, montrer } = cuisine(t);
  annoncer();

  const { code, sortie } = await montrer();

  assert.equal(code, 0);
  assert.match(sortie, /station\s+box\/claude — moteur claude, fournit : code/);
  assert.match(sortie, /cooks simultanés\s+1 au plus/);
  assert.match(sortie, /connexion Max\s+tenue pour bonne/);
  assert.match(sortie, /quota\s+disponible/);
  assert.match(sortie, /cook en cours\s+aucun/);
  assert.match(sortie, /derniers cooks\s+aucun/);
});

test("le chef voit ce qu'il paie : chaque cook avec son calibrage, sa fin et ce qu'il a consommé", async (t) => {
  const { annoncer, lancerCook, noter, montrer } = cuisine(t);
  annoncer();
  lancerCook("7-a", 7, "opus", "high");
  noter({ type: "cook.exited", payload: { run: "7-a", outcome: "ok", code: 0, signal: null, turns: 12, tokens: 34_567, durationMs: 252_000 } }, 7, "runtime");
  noter({ type: "cook.reported", payload: { run: "7-a", ending: "done", reason: null, summary: "fait", branch: "cook/7-a", pr: "https://github.com/o/r/pull/9" } }, 7);
  lancerCook("8-b", 8);

  const { sortie } = await montrer();

  assert.match(sortie, /cook en cours\s+#8  8-b  sonnet \/ medium  lancé le 2026-10-08T10:00:04.000Z  cook\/8-b/);
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
