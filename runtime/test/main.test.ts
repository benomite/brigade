// Le runtime tel que le chef le lance : un vrai process, piloté par ses
// variables d'environnement et par des signaux.
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { test, type TestContext } from "node:test";
import { ouvrirJournal } from "../src/journal.ts";
import { lireRail } from "../src/projections/rail.ts";
import { BASE, DEPOT, depotGit, ENV_GIT, FAUX_CLAUDE, fauxGh, type FauxGh, git, issueGitHub, jusqua, lancer, repertoireTemporaire } from "./outils.ts";

const MAIN = join(import.meta.dirname, "../src/main.ts");
const REFUS = 2;

// L'environnement d'un runtime complet. Son `gh` est un faux, qui répond un
// dépôt sans ticket : aucun test ne touche le réseau.
function environnement(t: TestContext, repertoire: string, gh?: FauxGh) {
  if (!gh) {
    gh = fauxGh(t);
    gh.issues([]);
  }
  // Le clone de la station : un dépôt git suffit tant qu'aucun cook ne part.
  const clone = repertoireTemporaire(t);
  git(clone, "init", "-q");
  return {
    ...ENV_GIT,
    BRIGADE_STATE_DIR: repertoire,
    BRIGADE_PROJECT: "brigade",
    BRIGADE_GITHUB_REPO: DEPOT,
    BRIGADE_GH_BIN: gh.bin,
    BRIGADE_REPO_DIR: clone,
    BRIGADE_BASE_BRANCH: BASE,
    BRIGADE_CLAUDE_BIN: FAUX_CLAUDE,
  };
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
  assert.deepEqual(relire(repertoire).map((e) => e.type), ["runtime.started", "guard.configured", "station.announced"]);

  runtime.process.kill("SIGTERM");

  assert.equal(await runtime.fin, 0);
  assert.match(runtime.sortie(), /arrêté/);
  assert.deepEqual(
    relire(repertoire).map((e) => [e.type, e.project, e.author]),
    [
      ["runtime.started", "brigade", "runtime"],
      ["guard.configured", "brigade", "runtime"],
      ["station.announced", "brigade", "station:box/claude"],
      ["runtime.stopped", "brigade", "runtime"],
    ],
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
    apres.map((e) => [e.type, e.payload]).slice(3, 4),
    [["runtime.interrupted", { startedSeq: 1 }]],
  );
  assert.deepEqual(apres.map((e) => e.type), ["runtime.started", "guard.configured", "station.announced", "runtime.interrupted", "runtime.started"]);
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
  assert.deepEqual(relire(repertoire).map((e) => e.type), ["runtime.started", "guard.configured", "station.announced"]);
});

test("le runtime démarre avec ses garde-fous : les plafonds réglés par l'environnement sont au journal", async (t) => {
  const repertoire = repertoireTemporaire(t);
  const runtime = lancer(t, MAIN, [], { ...environnement(t, repertoire), BRIGADE_MAX_TURNS: "40" });
  await runtime.attendre("démarré");

  assert.deepEqual(relire(repertoire).find((e) => e.type === "guard.configured")?.payload, {
    limits: { turns: 40, durationMs: 3_600_000, tokens: 2_000_000, idleMs: 600_000 },
    breakerThreshold: 3,
  });
});

test("un plafond illisible est un refus de démarrer, avant d'avoir rien écrit", async (t) => {
  const repertoire = join(repertoireTemporaire(t), "etat");
  const runtime = lancer(t, MAIN, [], { ...environnement(t, repertoire), BRIGADE_MAX_TURNS: "beaucoup" });

  assert.equal(await runtime.fin, REFUS);
  assert.match(runtime.sortie(), /refus de démarrer.*BRIGADE_MAX_TURNS/);
  assert.equal(existsSync(repertoire), false);
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
  ["sans BRIGADE_REPO_DIR", { BRIGADE_REPO_DIR: "" }, /BRIGADE_REPO_DIR n'est pas défini/],
  ["avec un clone qui n'est pas un dépôt git", { BRIGADE_REPO_DIR: "/chemin/jamais/cree" }, /BRIGADE_REPO_DIR invalide/],
  ["sans BRIGADE_BASE_BRANCH", { BRIGADE_BASE_BRANCH: "" }, /BRIGADE_BASE_BRANCH n'est pas défini/],
  ["avec une clé d'API dans l'environnement", { ANTHROPIC_API_KEY: "sk-ant-jamais" }, /ANTHROPIC_API_KEY est défini.*connexion Max/],
  ["avec un jeton extrait dans l'environnement", { CLAUDE_CODE_OAUTH_TOKEN: "jamais" }, /CLAUDE_CODE_OAUTH_TOKEN est défini/],
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
  // Une machine sans session : la station ne prend rien, le rail ne bouge que
  // par GitHub.
  const sansSession = { FAUX_CLAUDE_SESSION: "absente" };
  const premier = lancer(t, MAIN, [], { ...environnement(t, repertoire, gh), ...sansSession });
  await premier.attendre("démarré");
  await jusqua(() => lireLeRail(repertoire).length === 2);
  const avant = lireLeRail(repertoire);
  premier.process.kill("SIGKILL");
  await premier.fin;

  // Un `gh` à qui rien n'a été dicté échoue, comme sans réseau.
  const second = lancer(t, MAIN, [], { ...environnement(t, repertoire, fauxGh(t)), ...sansSession });
  await second.attendre("sondage GitHub en échec");

  assert.deepEqual(lireLeRail(repertoire), avant);
  assert.deepEqual(avant.map((ticket) => [ticket.ticket, ticket.priority, ticket.state]), [[14, 1, "waiting"], [15, null, "waiting"]]);
  second.process.kill("SIGTERM");
  assert.equal(await second.fin, 0);
});

test("de bout en bout : une issue calibrée posée sur le dépôt devient une branche poussée, une PR et un commentaire", async (t) => {
  const repertoire = repertoireTemporaire(t);
  const { origine, clone } = depotGit(t);
  const gh = fauxGh(t);
  gh.issues([issueGitHub(15, { labels: ["fire", "model:sonnet", "effort:low"] })]);
  gh.repondre(`repos/${DEPOT}/pulls`, { statut: 201, corps: { html_url: `https://github.com/${DEPOT}/pull/40` } });
  gh.repondre(`repos/${DEPOT}/issues/15/comments`, { statut: 201, corps: { id: 1 } });
  const runtime = lancer(t, MAIN, [], { ...environnement(t, repertoire, gh), BRIGADE_REPO_DIR: clone, FAUX_CLAUDE: "livre" });

  await jusqua(() => gh.appels().some((appel) => appel.at(-1) === `repos/${DEPOT}/issues/15/comments`), 15_000);

  const journal = relire(repertoire);
  const lancement = journal.find((e) => e.type === "cook.launched")?.payload as { run: string; model: string; effort: string };
  assert.deepEqual([lancement.model, lancement.effort], ["sonnet", "low"]);
  assert.equal(git(origine, "show", `cook/${lancement.run}:travail.txt`), "le travail du cook");
  assert.deepEqual(lireLeRail(repertoire).map((ticket) => [ticket.ticket, ticket.state]), [[15, "pass"]]);
  const pr = gh.appels().find((appel) => appel.at(-1) === `repos/${DEPOT}/pulls`) ?? [];
  assert.equal(pr.includes(`head=cook/${lancement.run}`) && pr.includes(`base=${BASE}`), true);
  assert.equal(git(clone, "status", "--porcelain"), "");
  runtime.process.kill("SIGTERM");
  assert.equal(await runtime.fin, 0);
});

test("l'unité systemd fournit ce que le point d'entrée exige, et ne relance pas un refus", () => {
  const unite = readFileSync(join(import.meta.dirname, "../deploy/brigade@.service"), "utf8");

  assert.match(unite, /^Environment=BRIGADE_STATE_DIR=\/var\/lib\/brigade\/%i$/m);
  assert.match(unite, /^StateDirectory=brigade\/%i$/m);
  assert.match(unite, /^Environment=BRIGADE_PROJECT=%i$/m);
  assert.match(unite, /^Environment=BRIGADE_REPO_DIR=\/var\/lib\/brigade\/%i\/depot$/m);
  assert.doesNotMatch(unite, /^Environment=.*(BRIGADE_CLAUDE_BIN|ANTHROPIC|TOKEN)/m);
  assert.match(unite, new RegExp(`^RestartPreventExitStatus=${REFUS}$`, "m"));
  assert.match(unite, /^ExecStart=.* node src\/main\.ts$/m);
});
