// Le runtime tel que le chef le lance : un vrai process, piloté par ses
// variables d'environnement et par des signaux.
import assert from "node:assert/strict";
import { chmodSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { describe, test, type TestContext } from "node:test";
import { ROLES } from "../src/identites.ts";
import { ouvrirJournal } from "../src/journal.ts";
import { lireRail } from "../src/projections/rail.ts";
import { fauxGitHubApps } from "./aides/faux-github-apps.ts";
import { BASE, DEPOT, depotGit, ecrireSuite, ENV_GIT, FAUX_BWRAP, FAUX_CLAUDE, fauxGh, type FauxGh, git, issueGitHub, jusqua, lancementsDuFauxClaude, lancer, repertoireDuFichier, repertoireTemporaire, temporaireDuFichier } from "./outils.ts";

const rienNeReste = temporaireDuFichier();

const MAIN = join(import.meta.dirname, "../src/main.ts");
const REFUS = 2;

// L'environnement d'un runtime complet. Son `gh` est un faux, qui répond un
// dépôt sans ticket : aucun test ne touche le réseau.
function environnement(t: TestContext, repertoire: string, gh?: FauxGh) {
  if (!gh) {
    gh = fauxGh(t);
    gh.issues([]);
  }
  return {
    ...ENV_GIT,
    BRIGADE_STATE_DIR: repertoire,
    BRIGADE_PROJECT: "brigade",
    BRIGADE_GITHUB_REPO: DEPOT,
    BRIGADE_GH_BIN: gh.bin,
    BRIGADE_REPO_DIR: cloneInerte(),
    BRIGADE_BASE_BRANCH: BASE,
    BRIGADE_CLAUDE_BIN: FAUX_CLAUDE,
    BRIGADE_MANAGER_MODEL: "sonnet",
    BRIGADE_MANAGER_EFFORT: "medium",
    BRIGADE_REVIEWER_MODEL: "sonnet",
    BRIGADE_REVIEWER_EFFORT: "medium",
    // La machine du poste ne décide d'aucun test : une suite qui tourne à côté
    // charge le processeur bien au-delà du seuil par défaut.
    BRIGADE_MAX_LOAD_PER_CORE: "1000000",
    BRIGADE_MIN_FREE_MEMORY_MB: "0",
    BRIGADE_MIN_FREE_DISK_MB: "0",
  };
}

// Le clone de la station, pour les tests où aucun cook ne part : un dépôt git
// vide suffit, et il n'est jamais modifié — tous le partagent.
let inerte: string | undefined;
function cloneInerte(): string {
  if (inerte === undefined) {
    inerte = repertoireDuFichier("brigade-test-clone-", () => void (inerte = undefined));
    git(inerte, "init", "-q");
  }
  return inerte;
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
  assert.deepEqual(relire(repertoire).map((e) => e.type), ["runtime.started", "guard.configured", "station.announced", "isolation.configured"]);

  runtime.process.kill("SIGTERM");

  assert.equal(await runtime.fin, 0);
  assert.match(runtime.sortie(), /arrêté/);
  assert.deepEqual(
    relire(repertoire).map((e) => [e.type, e.project, e.author]),
    [
      ["runtime.started", "brigade", "runtime"],
      ["guard.configured", "brigade", "runtime"],
      ["station.announced", "brigade", "station:box/claude"],
      ["isolation.configured", "brigade", "runtime"],
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
    apres.map((e) => [e.type, e.payload]).slice(4, 5),
    [["runtime.interrupted", { startedSeq: 1 }]],
  );
  assert.deepEqual(apres.map((e) => e.type), ["runtime.started", "guard.configured", "station.announced", "isolation.configured", "runtime.interrupted", "runtime.started"]);
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
  assert.deepEqual(relire(repertoire).map((e) => e.type), ["runtime.started", "guard.configured", "station.announced", "isolation.configured"]);
});

test("sans cloison ni porte, le runtime le dit au démarrage et l'écrit : les projets se voient", async (t) => {
  const repertoire = repertoireTemporaire(t);
  const runtime = lancer(t, MAIN, [], environnement(t, repertoire));
  await runtime.attendre("démarré");

  assert.match(runtime.sortie(), /brigade : cloison — aucune \(BRIGADE_SANDBOX_BIN n'est pas défini\) : un cook lit tout ce que lit le compte du service — l'état, le clone, les worktrees et les secrets des autres projets compris/);
  assert.match(runtime.sortie(), /brigade : réseau — ouvert \(BRIGADE_PROXY_PORT n'est pas défini\) : un cook joint tout ce que joint la machine/);
  assert.deepEqual(relire(repertoire).find((e) => e.type === "isolation.configured")?.payload, { sandbox: null, proxy: null });
});

test("avec une cloison, le runtime dit ce qu'elle masque, et le journal le garde pour le chef", async (t) => {
  // L'état et le clone sous une même racine, que la cloison masque ; le compte à côté.
  const racine = repertoireTemporaire(t);
  const repertoire = join(racine, "etats/brigade");
  const clone = join(racine, "etats/depot");
  mkdirSync(clone, { recursive: true });
  git(clone, "init", "-q");
  const env = { ...environnement(t, repertoire), BRIGADE_REPO_DIR: clone, BRIGADE_SANDBOX_BIN: FAUX_BWRAP, BRIGADE_SANDBOX_HIDDEN: join(racine, "etats"), HOME: join(racine, "compte") };
  const runtime = lancer(t, MAIN, [], env);
  await runtime.attendre("démarré");

  assert.match(runtime.sortie(), new RegExp(`brigade : cloison — chaque lancement \\(setup, cook, gates, reviewer, juges\\) part dans \`${FAUX_BWRAP}\` — masqués : ${join(racine, "etats")}`));
  assert.deepEqual(relire(repertoire).find((e) => e.type === "isolation.configured")?.payload, {
    sandbox: { bin: FAUX_BWRAP, hidden: [join(racine, "etats")], credentials: join(racine, "compte/.claude/.credentials.json") },
    proxy: null,
  });
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
  ["sans BRIGADE_MANAGER_MODEL", { BRIGADE_MANAGER_MODEL: "" }, /BRIGADE_MANAGER_MODEL n'est pas défini/],
  ["sans BRIGADE_MANAGER_EFFORT", { BRIGADE_MANAGER_EFFORT: "" }, /BRIGADE_MANAGER_EFFORT n'est pas défini/],
  ["avec un modèle de manager inconnu", { BRIGADE_MANAGER_MODEL: "gpt" }, /BRIGADE_MANAGER_MODEL invalide/],
  ["sans BRIGADE_REVIEWER_MODEL", { BRIGADE_REVIEWER_MODEL: "" }, /BRIGADE_REVIEWER_MODEL n'est pas défini/],
  ["sans BRIGADE_REVIEWER_EFFORT", { BRIGADE_REVIEWER_EFFORT: "" }, /BRIGADE_REVIEWER_EFFORT n'est pas défini/],
  ["avec un effort de reviewer inconnu", { BRIGADE_REVIEWER_EFFORT: "fort" }, /BRIGADE_REVIEWER_EFFORT invalide/],
  ["avec une roadmap qui n'est pas un numéro d'issue", { BRIGADE_ROADMAP_ISSUE: "roadmap" }, /BRIGADE_ROADMAP_ISSUE invalide/],
  ["avec un nombre d'entrées simultanées nul", { BRIGADE_MAX_SETUPS: "0" }, /BRIGADE_MAX_SETUPS invalide/],
  ["avec un seuil de mémoire illisible", { BRIGADE_MIN_FREE_MEMORY_MB: "un peu" }, /BRIGADE_MIN_FREE_MEMORY_MB invalide/],
  ["avec un plafond de calibrage inconnu", { BRIGADE_CEILING_EFFORT: "extrême" }, /BRIGADE_CEILING_EFFORT invalide/],
  ["avec une clé d'API dans l'environnement", { ANTHROPIC_API_KEY: "sk-ant-jamais" }, /ANTHROPIC_API_KEY est défini.*connexion Max/],
  ["avec un jeton extrait dans l'environnement", { CLAUDE_CODE_OAUTH_TOKEN: "jamais" }, /CLAUDE_CODE_OAUTH_TOKEN est défini/],
  ["avec une cloison qui ne masque rien", { BRIGADE_SANDBOX_BIN: FAUX_BWRAP, HOME: "/home/jamais" }, /BRIGADE_SANDBOX_BIN est défini sans BRIGADE_SANDBOX_HIDDEN/],
  ["avec une cloison qui laisse l'état dehors", { BRIGADE_SANDBOX_BIN: FAUX_BWRAP, BRIGADE_SANDBOX_HIDDEN: "/var/lib/jamais", HOME: "/home/jamais" }, /BRIGADE_STATE_DIR \(.*\) n'est sous aucun répertoire de BRIGADE_SANDBOX_HIDDEN/],
  ["avec un port de porte illisible", { BRIGADE_PROXY_PORT: "porte" }, /BRIGADE_PROXY_PORT invalide/],
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
  gh.commentaires(15, "Un commentaire.", "<!-- brigade:fiche -->\n**Fiche du ticket**\n- attend : #14\n- zone : runtime/src/rail.ts");
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
  assert.deepEqual(avant.map((ticket) => ticket.card), [null, { waitsFor: [14], zone: ["runtime/src/rail.ts"], problems: [] }]);
  second.process.kill("SIGTERM");
  assert.equal(await second.fin, 0);
});

test("le manager est branché, et éteint : il ne sonde les issues ouvertes qu'une fois allumé par le chef", async (t) => {
  const repertoire = repertoireTemporaire(t);
  const gh = fauxGh(t);
  gh.issues([]);
  const ouvertes = `repos/${DEPOT}/issues?state=open&per_page=100`;
  gh.repondre(ouvertes, { corps: [{ ...issueGitHub(1, { labels: ["tech"] }), author_association: "OWNER" }] });
  const sondees = () => gh.appels().filter((appel) => appel.at(-1) === ouvertes).length;
  const runtime = lancer(t, MAIN, [], { ...environnement(t, repertoire, gh), BRIGADE_ROADMAP_ISSUE: "1" });
  await runtime.attendre("démarré");
  await jusqua(() => gh.appels().length > 0);
  assert.equal(sondees(), 0);

  const allumer = lancer(t, join(import.meta.dirname, "../src/manager-cli.ts"), ["allumer"], { BRIGADE_STATE_DIR: repertoire });
  assert.equal(await allumer.fin, 0);

  await jusqua(() => relire(repertoire).some((e) => e.type === "manager.set-aside"));
  assert.deepEqual(relire(repertoire).find((e) => e.type === "manager.set-aside")?.payload, { reason: "roadmap", fired: false });
  assert.ok(sondees() > 0);
  runtime.process.kill("SIGTERM");
  assert.equal(await runtime.fin, 0);
});

// Deux cuisines complètes, chacune avec son dépôt et son `gh` : elles se jouent de front.
describe("de bout en bout", { concurrency: 2 }, () => {
  test("une issue calibrée posée sur le dépôt devient une branche poussée, une PR et un commentaire", async (t) => {
    const repertoire = repertoireTemporaire(t);
    const { origine, clone } = depotGit(t);
    const gh = fauxGh(t);
    gh.issues([issueGitHub(15, { labels: ["fire", "model:sonnet", "effort:low"] })]);
    gh.repondre(`repos/${DEPOT}/pulls`, { statut: 201, corps: { html_url: `https://github.com/${DEPOT}/pull/40` } });
    gh.repondre(`repos/${DEPOT}/issues/15/comments`, { statut: 201, corps: { id: 1 } });
    const runtime = lancer(t, MAIN, [], { ...environnement(t, repertoire, gh), BRIGADE_REPO_DIR: clone, FAUX_CLAUDE: "livre" });

    await jusqua(() => gh.appels().some((appel) => appel.at(-1) === `repos/${DEPOT}/issues/15/comments`));

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

  test("sous grant, la livraison d'un cook est jugée par les gates du projet, mergée sur le commit jugé, et son issue fermée", async (t) => {
    const repertoire = repertoireTemporaire(t);
    const { origine, clone } = depotGit(t);
    // Le projet a des gates : elles sont sur la base, donc dans le worktree du cook.
    mkdirSync(join(clone, ".claude/brigade"), { recursive: true });
    writeFileSync(join(clone, ".claude/brigade/gates.sh"), '#!/usr/bin/env bash\ntest -f "$1/travail.txt" && echo "gates : VERT"\n');
    chmodSync(join(clone, ".claude/brigade/gates.sh"), 0o755);
    git(clone, "add", ".");
    git(clone, "commit", "-q", "-m", "les gates du projet");
    git(clone, "push", "-q", "origin", BASE);
    const pr = { number: 40, html_url: `https://github.com/${DEPOT}/pull/40`, state: "open", merged: false, mergeable: true, base: { ref: BASE }, head: { sha: "tete" } };
    const gh = fauxGh(t);
    gh.issues([issueGitHub(15, { labels: ["fire", "model:sonnet", "effort:low"] })]);
    gh.repondre(`repos/${DEPOT}/pulls`, { statut: 201, corps: pr });
    gh.repondre(`repos/${DEPOT}/issues/15/comments`, { statut: 201, corps: { id: 1 } });
    gh.repondre(`repos/${DEPOT}/pulls?head=benomite:cook/*`, { corps: [pr] });
    gh.repondre(`repos/${DEPOT}/pulls/40`, { corps: pr });
    gh.repondre(`repos/${DEPOT}/commits/*/check-runs?per_page=100`, { corps: { check_runs: [] } });
    gh.repondre(`repos/${DEPOT}/commits/*/status?per_page=100`, { corps: { statuses: [] } });
    gh.repondre(`repos/${DEPOT}/pulls/40/merge`, { corps: { merged: true } });
    // Le chef a donné le grant avant que le runtime ne démarre.
    const avant = ouvrirJournal(repertoire);
    avant.ajouter({ project: "brigade", ticket: null, author: "chef", type: "grant.activated", payload: { action: "merge" } });
    avant.fermer();
    // Le cook et le reviewer sont le même binaire : le premier lancé livre, le second relit.
    const suite = join(repertoire, "suite.txt");
    ecrireSuite(suite, ["livre"]);
    const runtime = lancer(t, MAIN, [], { ...environnement(t, repertoire, gh), BRIGADE_REPO_DIR: clone, FAUX_CLAUDE: "relit-vert", FAUX_CLAUDE_SUITE: suite });

    await jusqua(() => gh.appels().some((appel) => appel.includes("PATCH")));

    const journal = relire(repertoire);
    const lancement = journal.find((e) => e.type === "cook.launched")?.payload as { run: string };
    const juge = git(origine, "rev-parse", `cook/${lancement.run}`);
    const verdict = journal.find((e) => e.type === "pass.judged")?.payload as { verdict: string; sha: string; gates: { tail: string }; ci: { outcome: string } };
    assert.deepEqual([verdict.verdict, verdict.sha, verdict.gates.tail, verdict.ci.outcome], ["green", juge, "gates : VERT", "none"]);
    assert.deepEqual(
      gh.appels().find((appel) => appel.includes("PUT")),
      ["api", "-i", "-X", "PUT", "-f", `sha=${juge}`, "-f", "merge_method=merge", `repos/${DEPOT}/pulls/40/merge`],
    );
    assert.deepEqual(gh.appels().find((appel) => appel.includes("PATCH"))?.at(-1), `repos/${DEPOT}/issues/15`);
    assert.deepEqual(
      journal.map((e) => e.type).filter((type) => /^(pass|grant|merge)\.|^ticket\.served/.test(type)),
      ["grant.activated", "pass.started", "pass.reviewed", "pass.judged", "grant.used", "merge.done", "ticket.served"],
    );
    // La relecture est au journal comme un cook : son calibrage, hors ticket.
    const relecture = journal.filter((e) => e.type === "cook.launched").at(-1);
    assert.deepEqual([relecture?.ticket, relecture?.payload.station, relecture?.payload.model, relecture?.payload.effort], [null, "reviewer", "sonnet", "medium"]);
    assert.deepEqual(lireLeRail(repertoire).map((ticket) => [ticket.ticket, ticket.state]), [[15, "served"]]);
    runtime.process.kill("SIGTERM");
    assert.equal(await runtime.fin, 0);
  });
});

test("sans Apps, le runtime dit qu'il tourne sous l'identité unique de la machine", async (t) => {
  const repertoire = repertoireTemporaire(t);
  const gh = fauxGh(t);
  gh.issues([]);
  const runtime = lancer(t, MAIN, [], environnement(t, repertoire, gh));
  await runtime.attendre("démarré");

  assert.match(runtime.sortie(), /GitHub — identité unique, celle du `gh` de la machine : rien ne réserve le merge à la pass/);
  await jusqua(() => gh.jetons().length > 0);
  assert.deepEqual([...new Set(gh.jetons())], [null]);
  assert.equal(existsSync(join(repertoire, "gh-sans-compte")), false);
});

test("le runtime dit au démarrage où vivent les secrets du projet, ou qu'il n'en a pas", async (t) => {
  const sans = lancer(t, MAIN, [], environnement(t, repertoireTemporaire(t)));
  await sans.attendre("démarré");
  assert.match(sans.sortie(), /secrets du projet — aucun \(BRIGADE_SECRETS_FILE n'est pas défini\)/);

  const fichier = join(repertoireTemporaire(t), "secrets.env");
  writeFileSync(fichier, "CLE_API=une-valeur-de-dev\n", { mode: 0o600 });
  const avec = lancer(t, MAIN, [], { ...environnement(t, repertoireTemporaire(t)), BRIGADE_SECRETS_FILE: fichier });
  await avec.attendre("démarré");
  assert.ok(avec.sortie().includes(`secrets du projet — ${fichier}, relu à chaque lancement`), avec.sortie());
  assert.equal(avec.sortie().includes("une-valeur-de-dev"), false);
});

test("un fichier de secrets rangé dans l'état du runtime fait refuser de démarrer, sans laisser de journal", async (t) => {
  const repertoire = repertoireTemporaire(t);
  writeFileSync(join(repertoire, "secrets.env"), "CLE_API=une-valeur-de-dev\n", { mode: 0o600 });
  const runtime = lancer(t, MAIN, [], { ...environnement(t, repertoire), BRIGADE_SECRETS_FILE: join(repertoire, "secrets.env") });

  assert.equal(await runtime.fin, REFUS);
  assert.match(runtime.sortie(), /refus de démarrer — BRIGADE_SECRETS_FILE invalide.*hors de BRIGADE_STATE_DIR et de BRIGADE_REPO_DIR/);
  assert.equal(existsSync(join(repertoire, "log.db")), false);
});

test("un répertoire d'Apps incomplet fait refuser de démarrer, fichier nommé, sans laisser de journal", async (t) => {
  const repertoire = repertoireTemporaire(t);
  const apps = await fauxGitHubApps(t);
  rmSync(join(apps.repertoire, "manager.pem"));
  const runtime = lancer(t, MAIN, [], { ...environnement(t, repertoire), BRIGADE_GITHUB_APPS_DIR: apps.repertoire, BRIGADE_GITHUB_API_URL: apps.url });

  assert.equal(await runtime.fin, REFUS);
  assert.ok(runtime.sortie().includes(`refus de démarrer — BRIGADE_GITHUB_APPS_DIR invalide : « ${join(apps.repertoire, "manager.pem")} »`), runtime.sortie());
  assert.equal(existsSync(join(repertoire, "log.db")), false);
});

test("une identité par rôle, de bout en bout : le cook livre sans aucun jeton, la station pousse et ouvre la PR sous l'identité cook, la pass merge sous la sienne, et aucun jeton ne s'écrit nulle part", async (t) => {
  const repertoire = repertoireTemporaire(t);
  const { origine, clone } = depotGit(t);
  mkdirSync(join(clone, ".claude/brigade"), { recursive: true });
  writeFileSync(join(clone, ".claude/brigade/gates.sh"), '#!/usr/bin/env bash\ntest -f "$1/travail.txt" && echo "gates : VERT"\n');
  chmodSync(join(clone, ".claude/brigade/gates.sh"), 0o755);
  git(clone, "add", ".");
  git(clone, "commit", "-q", "-m", "les gates du projet");
  git(clone, "push", "-q", "origin", BASE);
  // Le crochet tourne dans le process de `git push` : il en voit l'environnement.
  const pousse = join(repertoire, "env-du-push");
  mkdirSync(join(clone, ".git/hooks"), { recursive: true });
  writeFileSync(join(clone, ".git/hooks/pre-push"), `#!/bin/sh\nenv | grep '^GIT_CONFIG_VALUE_' > '${pousse}'\n`);
  chmodSync(join(clone, ".git/hooks/pre-push"), 0o755);
  const pr = { number: 40, html_url: `https://github.com/${DEPOT}/pull/40`, state: "open", merged: false, mergeable: true, base: { ref: BASE }, head: { sha: "tete" } };
  const gh = fauxGh(t);
  gh.issues([{ ...issueGitHub(15, { labels: ["fire", "model:sonnet", "effort:low"] }), body: "Le corps du ticket privé." } as ReturnType<typeof issueGitHub>]);
  gh.repondre(`repos/${DEPOT}/pulls`, { statut: 201, corps: pr });
  gh.repondre(`repos/${DEPOT}/issues/15/comments`, { statut: 201, corps: { id: 1 } });
  gh.repondre(`repos/${DEPOT}/pulls?head=benomite:cook/*`, { corps: [pr] });
  gh.repondre(`repos/${DEPOT}/pulls/40`, { corps: pr });
  gh.repondre(`repos/${DEPOT}/commits/*/check-runs?per_page=100`, { corps: { check_runs: [] } });
  gh.repondre(`repos/${DEPOT}/commits/*/status?per_page=100`, { corps: { statuses: [] } });
  gh.repondre(`repos/${DEPOT}/pulls/40/merge`, { corps: { merged: true } });
  const apps = await fauxGitHubApps(t);
  const avant = ouvrirJournal(repertoire);
  avant.ajouter({ project: "brigade", ticket: null, author: "chef", type: "grant.activated", payload: { action: "merge" } });
  avant.fermer();
  const suite = join(repertoire, "suite.txt");
  ecrireSuite(suite, ["livre"]);
  const temoin = join(repertoire, "temoin");
  mkdirSync(temoin);
  const runtime = lancer(t, MAIN, [], {
    ...environnement(t, repertoire, gh),
    BRIGADE_REPO_DIR: clone,
    BRIGADE_GITHUB_APPS_DIR: apps.repertoire,
    BRIGADE_GITHUB_API_URL: apps.url,
    // Le compte du service porte un jeton GitHub : il ne doit atteindre personne.
    GH_TOKEN: "ghp_du_compte",
    FAUX_CLAUDE: "relit-vert",
    FAUX_CLAUDE_SUITE: suite,
    FAUX_CLAUDE_TEMOIN: temoin,
  });

  // Le dernier geste de la pass : son commentaire, une fois l'issue fermée.
  await jusqua(() => gh.appels().some((appel) => appel.some((arg) => arg.startsWith("body=**Pass"))));
  await runtime.attendre("démarré");

  assert.match(runtime.sortie(), /GitHub — une identité par rôle \(cook, pass, manager\)/);
  // Chaque geste est parti sous l'identité de son rôle, jamais sous le compte de la machine.
  const sous = (trouver: (appel: string[]) => boolean) => [...new Set(gh.appels().flatMap((appel, i) => (trouver(appel) ? [/^ghs_([a-z]+)_/.exec(gh.jetons()[i] ?? "")?.[1] ?? gh.jetons()[i]] : [])))];
  assert.deepEqual(sous((appel) => appel.at(-1) === `repos/${DEPOT}/issues?labels=fire&state=open&per_page=100`), ["manager"]);
  assert.deepEqual(sous((appel) => appel.at(-1) === `repos/${DEPOT}/pulls`), ["cook"]);
  assert.deepEqual(sous((appel) => appel.includes("PUT")), ["pass"]);
  assert.deepEqual(sous((appel) => appel.includes("PATCH")), ["pass"]);
  // Sur l'issue : la station raconte le cook sous l'identité du manager ; la
  // pass publie son verdict et la relecture du reviewer — qui n'a aucun geste
  // GitHub — sous la sienne.
  const commentaire = (debut: string) => (appel: string[]) => appel.at(-1) === `repos/${DEPOT}/issues/15/comments` && appel.some((arg) => arg.startsWith(`body=**${debut}`));
  assert.deepEqual(sous(commentaire("Cook")), ["manager"]);
  assert.deepEqual(sous(commentaire("Reviewer")), ["pass"]);
  assert.deepEqual(sous(commentaire("Pass")), ["pass"]);
  assert.ok(!gh.jetons().includes(null) && !gh.jetons().includes("ghp_du_compte"));
  // La branche est partie avec le jeton de l'identité cook.
  const journal = relire(repertoire);
  const lancement = journal.find((e) => e.type === "cook.launched")?.payload as { run: string };
  assert.equal(git(origine, "show", `cook/${lancement.run}:travail.txt`), "le travail du cook");
  const entete = `Authorization: Basic ${Buffer.from(`x-access-token:${apps.jetons("cook").at(-1)}`).toString("base64")}`;
  assert.ok(readFileSync(pousse, "utf8").includes(entete));

  // Le cook, les gates et le reviewer : aucun jeton, aucun compte, et le ticket en fichier.
  const lances = lancementsDuFauxClaude(temoin);
  assert.equal(lances.length, 2);
  for (const lance of lances) {
    assert.deepEqual(Object.keys(lance.env).filter((nom) => /TOKEN|BRIGADE_|GIT_CONFIG_(COUNT|KEY|VALUE)/.test(nom)), []);
    assert.equal(lance.env.GH_CONFIG_DIR, join(repertoire, "gh-sans-compte"));
    assert.ok(!JSON.stringify(lance).includes("ghs_"));
  }
  const fichier = join(repertoire, "runs", `${lancement.run}.ticket.md`);
  assert.ok(lances[0]?.args[1]?.includes(`le fichier \`${fichier}\``));
  assert.match(readFileSync(fichier, "utf8"), /Le corps du ticket privé\./);

  // Le merge dit sous quelle identité il a été fait.
  const merge = journal.find((e) => e.type === "merge.done")?.payload;
  assert.deepEqual([merge?.by, merge?.actor], ["pass", "brigade-pass[bot]"]);

  runtime.process.kill("SIGTERM");
  assert.equal(await runtime.fin, 0);
  // Ni jeton ni JWT : pas au journal, pas dans un flux, pas dans la sortie du runtime, pas dans le clone.
  const secrets = [...ROLES.flatMap((role) => apps.jetons(role)), ...apps.jwts(), "ghp_du_compte"];
  assert.ok(apps.jetons("cook").length > 0 && apps.jetons("pass").length > 0 && apps.jetons("manager").length > 0);
  const ecrits = [
    JSON.stringify(relire(repertoire)),
    runtime.sortie(),
    readFileSync(join(clone, ".git/config"), "utf8"),
    ...readdirSync(join(repertoire, "runs")).map((nom) => readFileSync(join(repertoire, "runs", nom), "utf8")),
  ];
  for (const ecrit of ecrits) for (const secret of secrets) assert.ok(!ecrit.includes(secret), `un jeton s'est écrit : ${ecrit.slice(0, 200)}`);
});

test("un délai de la pass illisible fait refuser de démarrer, sans laisser de journal", async (t) => {
  const repertoire = repertoireTemporaire(t);
  const runtime = lancer(t, MAIN, [], { ...environnement(t, repertoire), BRIGADE_GATES_TIMEOUT_SECONDS: "longtemps" });

  assert.equal(await runtime.fin, REFUS);
  assert.match(runtime.sortie(), /refus de démarrer — BRIGADE_GATES_TIMEOUT_SECONDS invalide/);
  assert.equal(existsSync(join(repertoire, "log.db")), false);
});

test("l'unité systemd fournit ce que le point d'entrée exige, et ne relance pas un refus", () => {
  const unite = readFileSync(join(import.meta.dirname, "../deploy/brigade@.service"), "utf8");

  assert.match(unite, /^Environment=BRIGADE_STATE_DIR=\/var\/lib\/brigade\/%i$/m);
  assert.match(unite, /^StateDirectory=brigade\/%i$/m);
  assert.match(unite, /^Environment=BRIGADE_PROJECT=%i$/m);
  assert.match(unite, /^Environment=BRIGADE_REPO_DIR=\/var\/lib\/brigade\/%i\/depot$/m);
  assert.doesNotMatch(unite, /^Environment=.*(BRIGADE_CLAUDE_BIN|ANTHROPIC|TOKEN)/m);
  // Le calibrage du manager n'a pas de défaut : l'unité ne lui en donne pas.
  assert.doesNotMatch(unite, /^Environment=BRIGADE_MANAGER/m);
  assert.match(unite, /BRIGADE_MANAGER_MODEL/);
  // Celui du reviewer non plus.
  assert.doesNotMatch(unite, /^Environment=BRIGADE_REVIEWER/m);
  assert.match(unite, /BRIGADE_REVIEWER_MODEL/);
  assert.match(unite, new RegExp(`^RestartPreventExitStatus=${REFUS}$`, "m"));
  assert.match(unite, /^ExecStart=.* node src\/main\.ts$/m);
});

test("main.test.ts ne laisse rien dans le répertoire temporaire", rienNeReste);
