// Le runtime tel que le chef le lance : un vrai process, piloté par ses
// variables d'environnement et par des signaux.
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { test, type TestContext } from "node:test";
import { ouvrirJournal } from "../src/journal.ts";
import { lireRail } from "../src/projections/rail.ts";
import { DEPOT, fauxGh, type FauxGh, issueGitHub, jusqua, lancer, repertoireTemporaire } from "./outils.ts";

const MAIN = join(import.meta.dirname, "../src/main.ts");
const REFUS = 2;

// L'environnement d'un runtime complet. Son `gh` est un faux, qui répond un
// dépôt sans ticket : aucun test ne touche le réseau.
function environnement(t: TestContext, repertoire: string, gh?: FauxGh) {
  if (!gh) {
    gh = fauxGh(t);
    gh.issues([]);
  }
  return { BRIGADE_STATE_DIR: repertoire, BRIGADE_PROJECT: "brigade", BRIGADE_GITHUB_REPO: DEPOT, BRIGADE_GH_BIN: gh.bin };
}

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
  const runtime = lancer(t, MAIN, [], environnement(t, repertoire));
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
  const env = environnement(t, repertoire);
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
  const env = environnement(t, repertoire);
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

for (const [cas, variables, motif] of [
  ["sans BRIGADE_GITHUB_REPO", { BRIGADE_GITHUB_REPO: "" }, /BRIGADE_GITHUB_REPO n'est pas défini/],
  ["avec un dépôt qui n'est pas <owner>/<repo>", { BRIGADE_GITHUB_REPO: "brigade" }, /BRIGADE_GITHUB_REPO invalide/],
  ["avec un bail qui n'est pas un nombre de secondes", { BRIGADE_LEASE_SECONDS: "dix" }, /BRIGADE_LEASE_SECONDS invalide/],
] as const) {
  test(`${cas}, le runtime refuse de démarrer, et rien n'est écrit`, async (t) => {
    const repertoire = repertoireTemporaire(t);
    const runtime = lancer(t, MAIN, [], { ...environnement(t, repertoire), ...variables });

    assert.equal(await runtime.fin, REFUS);
    assert.match(runtime.sortie(), /refus de démarrer/);
    assert.match(runtime.sortie(), motif);
    assert.equal(existsSync(join(repertoire, "log.db")), false);
  });
}

function lireLeRail(repertoire: string) {
  const journal = ouvrirJournal(repertoire, { lectureSeule: true });
  try {
    return lireRail(journal.base);
  } finally {
    journal.fermer();
  }
}

test("les issues du dépôt arrivent sur le rail ; tué puis relancé sans GitHub, le runtime retrouve le même rail", async (t) => {
  const repertoire = repertoireTemporaire(t);
  const gh = fauxGh(t);
  gh.issues([issueGitHub(14, { labels: ["fire", "prio:1"] }), issueGitHub(15)]);
  const premier = lancer(t, MAIN, [], environnement(t, repertoire, gh));
  await premier.attendre("démarré");
  await jusqua(() => lireLeRail(repertoire).length === 2);
  const avant = lireLeRail(repertoire);
  premier.process.kill("SIGKILL");
  await premier.fin;

  // Un `gh` à qui rien n'a été dicté échoue, comme sans réseau.
  const second = lancer(t, MAIN, [], environnement(t, repertoire, fauxGh(t)));
  await second.attendre("sondage GitHub en échec");

  assert.deepEqual(lireLeRail(repertoire), avant);
  assert.deepEqual(avant.map((ticket) => [ticket.ticket, ticket.priority, ticket.state]), [[14, 1, "waiting"], [15, null, "waiting"]]);
  second.process.kill("SIGTERM");
  assert.equal(await second.fin, 0);
});

test("l'unité systemd fournit ce que le point d'entrée exige, et ne relance pas un refus", () => {
  const unite = readFileSync(join(import.meta.dirname, "../deploy/brigade@.service"), "utf8");

  assert.match(unite, /^Environment=BRIGADE_STATE_DIR=\/var\/lib\/brigade\/%i$/m);
  assert.match(unite, /^StateDirectory=brigade\/%i$/m);
  assert.match(unite, /^Environment=BRIGADE_PROJECT=%i$/m);
  assert.match(unite, new RegExp(`^RestartPreventExitStatus=${REFUS}$`, "m"));
  assert.match(unite, /^ExecStart=.* node src\/main\.ts$/m);
});
