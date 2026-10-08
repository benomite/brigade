// Le runtime tel que le chef le lance : un vrai process, piloté par ses
// variables d'environnement et par des signaux.
import assert from "node:assert/strict";
import { join } from "node:path";
import { test } from "node:test";
import { ouvrirJournal } from "../src/journal.ts";
import { lancer, repertoireTemporaire } from "./outils.ts";

const MAIN = join(import.meta.dirname, "../src/main.ts");
const REFUS = 2;

function relire(repertoire: string) {
  const journal = ouvrirJournal(repertoire, { lectureSeule: true });
  try {
    return journal.tout();
  } finally {
    journal.fermer();
  }
}

test("le runtime démarre, tourne, et s'arrête proprement sur SIGTERM", async (t) => {
  const repertoire = repertoireTemporaire(t);
  const runtime = lancer(t, MAIN, [], { BRIGADE_STATE_DIR: repertoire, BRIGADE_PROJECT: "brigade" });
  await runtime.attendre("démarré");
  assert.deepEqual(relire(repertoire).map((e) => e.type), ["runtime.started"]);

  runtime.process.kill("SIGTERM");

  assert.equal(await runtime.fin, 0);
  assert.match(runtime.sortie(), /arrêté/);
  assert.deepEqual(
    relire(repertoire).map((e) => [e.type, e.project, e.author]),
    [["runtime.started", "brigade", "runtime"], ["runtime.stopped", "brigade", "runtime"]],
  );
});

test("tué sans préavis puis relancé, le runtime retrouve son journal et y note l'interruption", async (t) => {
  const repertoire = repertoireTemporaire(t);
  const env = { BRIGADE_STATE_DIR: repertoire, BRIGADE_PROJECT: "brigade" };
  const premier = lancer(t, MAIN, [], env);
  await premier.attendre("démarré");
  const avant = relire(repertoire);
  premier.process.kill("SIGKILL");
  await premier.fin;

  const second = lancer(t, MAIN, [], env);
  await second.attendre("démarré");

  const apres = relire(repertoire);
  assert.deepEqual(apres.slice(0, avant.length), avant);
  assert.deepEqual(
    apres.map((e) => [e.type, e.payload]).slice(1, 2),
    [["runtime.interrupted", { startedSeq: 1 }]],
  );
  assert.deepEqual(apres.map((e) => e.type), ["runtime.started", "runtime.interrupted", "runtime.started"]);
});

test("un second runtime sur le même projet refuse de démarrer et dit pourquoi", async (t) => {
  const repertoire = repertoireTemporaire(t);
  const env = { BRIGADE_STATE_DIR: repertoire, BRIGADE_PROJECT: "brigade" };
  const premier = lancer(t, MAIN, [], env);
  await premier.attendre("démarré");

  const second = lancer(t, MAIN, [], env);

  assert.equal(await second.fin, REFUS);
  assert.match(second.sortie(), /refus de démarrer/);
  assert.match(second.sortie(), new RegExp(`pid ${premier.process.pid}`));
  assert.deepEqual(relire(repertoire).map((e) => e.type), ["runtime.started"]);
});

for (const [variable, env] of [
  ["BRIGADE_STATE_DIR", { BRIGADE_PROJECT: "brigade" }],
  ["BRIGADE_PROJECT", { BRIGADE_STATE_DIR: "/chemin/jamais/cree" }],
] as const) {
  test(`sans ${variable}, le runtime refuse de démarrer et nomme la variable`, async (t) => {
    const runtime = lancer(t, MAIN, [], env);

    assert.equal(await runtime.fin, REFUS);
    assert.match(runtime.sortie(), new RegExp(`refus de démarrer.*${variable}`));
  });
}
