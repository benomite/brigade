// Le runtime tel que le chef le lance : un vrai process, piloté par ses
// variables d'environnement et par des signaux.
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, utimesSync, writeFileSync } from "node:fs";
import { availableParallelism, hostname } from "node:os";
import { join } from "node:path";
import { after, before } from "node:test";
import { describe, test, type TestContext } from "node:test";
import { ouvrirArbitre, servirArbitre } from "../src/arbitre.ts";
import { signalerLArbre } from "../src/arbre.ts";
import { empreinteDuCode, lireCodeEnService } from "../src/code.ts";
import { ROLES } from "../src/identites.ts";
import { ouvrirJournal } from "../src/journal.ts";
import { lireRail } from "../src/projections/rail.ts";
import { proposerAuRuntime } from "../src/reglages-projet/au-runtime.ts";
import { FICHIER } from "../src/reglages-projet/reglages.ts";
import { fauxGitHubApps, prechaufferLesCles } from "./aides/faux-github-apps.ts";
import { relecteur } from "./aides/opt-B-journal.ts";
import { BASE, CACHE_DE_COMPILATION, DEPOT, depotGit, ENV_ENFANT, ENV_GIT, FAUX_BWRAP, FAUX_CLAUDE, fauxGh, type FauxGh, git, issueGitHub, jusqua, lancementsDuFauxClaude, lancer, repertoireDuFichier, repertoireTemporaire, rienEcritParLeRuntime, temporaireDuFichier } from "./outils.ts";
import { posixOnly } from "./support/plateforme.ts";

const rienNeReste = temporaireDuFichier();
// Les clés des Apps de deux tests, fabriquées hors du fil des tests pendant que
// les premiers runtimes démarrent.
void prechaufferLesCles().catch(() => undefined);

const MAIN = join(import.meta.dirname, "../src/main.ts");
const TIENT_VERROU = join(import.meta.dirname, "aides/tient-verrou.ts");
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
    BRIGADE_STATIONS: "box/claude:30:code",
    BRIGADE_MANAGER_MODEL: "sonnet",
    BRIGADE_MANAGER_EFFORT: "medium",
    BRIGADE_REVIEWER_MODEL: "sonnet",
    BRIGADE_REVIEWER_EFFORT: "medium",
    // La machine du poste ne décide d'aucun test : une suite qui tourne à côté
    // charge le processeur bien au-delà du seuil par défaut.
    BRIGADE_MAX_LOAD_PER_CORE: "1000000",
    BRIGADE_MIN_FREE_MEMORY_MB: "0",
    BRIGADE_MIN_FREE_DISK_MB: "0",
    NODE_COMPILE_CACHE: cacheDeCompilation(),
  };
}

// Le cache de compilation de Node, partagé par tous les process que le fichier
// lance : celui de la suite quand elle en a un (CACHE_DE_COMPILATION), sinon
// un à lui, rangé avec le fichier — un fichier joué seul ne repaie pas la
// lecture de tout le TypeScript du runtime à chacun de ses cinquante démarrages.
let cache: string | undefined;
function cacheDeCompilation(): string {
  if (CACHE_DE_COMPILATION.NODE_COMPILE_CACHE) return CACHE_DE_COMPILATION.NODE_COMPILE_CACHE;
  cache ??= repertoireDuFichier("brigade-test-compilation-", () => void (cache = undefined));
  return cache;
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

// Les attentes sondent le journal toutes les cinq millisecondes : il n'est
// relu que quand le runtime y a écrit. Les connexions gardées se ferment avec
// le fichier.
const lecteur = relecteur();
after(() => lecteur.fermer());

function relire(repertoire: string) {
  // Les décisions du chef sont posées avant le démarrage : elles ne sont pas
  // ce que le runtime écrit.
  return lecteur.lire(repertoire, "tout", (journal) => journal.tout()).filter((e) => e.type !== "decision.set");
}

// Le runtime lancé sur son seul environnement, sans rien de plus : plusieurs
// tests lisent ce qu'il dit et écrit en démarrant, en tournant et en
// s'arrêtant. Un seul process le leur montre — lancé par le premier qui le
// demande, relevé à chaque étape, puis arrêté par SIGTERM — et chacun ne lit
// que ce relevé : aucun ne dépend de l'ordre où les autres se jouent. Les
// lieux sont ceux du premier test, qui attend le relevé entier avant de finir.
type Releve = {
  // Au démarrage : la sortie, le journal, et l'empreinte du code en service.
  sortie: string;
  journal: ReturnType<typeof relire>;
  codeEnService: ReturnType<typeof lireCodeEnService>;
  // Une fois GitHub sondé : sous quels jetons, et si le compte sans identité existe.
  jetons: Array<string | null>;
  sansCompte: boolean;
  // Après SIGTERM : le code de sortie, la sortie et le journal entiers.
  code: number | null;
  sortieFinale: string;
  journalFinal: ReturnType<typeof relire>;
};
let releve: Promise<Releve> | undefined;
function runtimeParDefaut(t: TestContext): Promise<Releve> {
  releve ??= (async () => {
    const repertoire = repertoireTemporaire(t);
    const gh = fauxGh(t);
    gh.issues([]);
    const depuis = Date.now();
    const runtime = lancer(t, MAIN, [], environnement(t, repertoire, gh));
    await runtime.attendre("démarré");
    const sortie = runtime.sortie();
    const journal = relire(repertoire);
    const codeEnService = lireCodeEnService(repertoire);
    await jusqua(() => gh.jetons().length > 0);
    const jetons = gh.jetons();
    const sansCompte = existsSync(join(repertoire, "gh-sans-compte"));
    // Sous Windows, SIGTERM tue le runtime sur-le-champ et laisse vivre ses enfants, qui tiennent encore
    // son répertoire d'état quand le test l'efface (EPERM sur le job) : c'est son arbre qui s'y arrête.
    if (process.platform === "win32") await signalerLArbre(runtime.process.pid ?? 0, "SIGKILL", { depuis });
    else runtime.process.kill("SIGTERM");
    const code = await runtime.fin;
    return { sortie, journal, codeEnService, jetons, sansCompte, code, sortieFinale: runtime.sortie(), journalFinal: relire(repertoire) };
  })();
  return releve;
}

// Chaque test a son état, son dépôt et son GitHub, et écoute sur le port 0 : ils se jouent de front.
describe("le runtime, son process et ses unités", { concurrency: 3 }, () => {
  // Le cache de compilation rempli une fois, avant le premier test : un runtime
  // qui refuse de démarrer, faute d'état, a déjà chargé tout son code.
  before(async () => {
    await new Promise<void>((resoudre) => execFile(process.execPath, [MAIN], { env: { ...ENV_ENFANT, NODE_COMPILE_CACHE: cacheDeCompilation() } }, () => resoudre()));
  });

  test("le runtime démarre, tourne, et s'arrête proprement sur SIGTERM", { skip: posixOnly("reads the shared runtime's record and expects exit code 0, the `arrêté` line and a runtime.stopped fact after SIGTERM; on Windows that shared runtime is stopped by killing its process tree, since SIGTERM would end it before its handler runs, so none of the three can be there") }, async (t) => {
    const runtime = await runtimeParDefaut(t);
    assert.deepEqual(runtime.journal.map((e) => e.type), ["runtime.started", "project.switched-on", "grant.activated", "guard.configured", "station.announced", "drift.configured", "session.observed", "isolation.configured"]);

    // Ce qu'une autre commande lira pour dire s'il tourne sur le code installé.
    assert.equal(runtime.codeEnService, empreinteDuCode());

    // Le relevé a envoyé SIGTERM.
    assert.equal(runtime.code, 0);
    assert.match(runtime.sortieFinale, /arrêté/);
    assert.deepEqual(
      runtime.journalFinal.map((e) => [e.type, e.project, e.author]),
      [
        ["runtime.started", "brigade", "runtime"],
        ["project.switched-on", "brigade", "runtime"],
        ["grant.activated", "brigade", "runtime"],
        ["guard.configured", "brigade", "runtime"],
        ["station.announced", "brigade", "station:box/claude"],
        ["drift.configured", "brigade", "runtime"],
        ["session.observed", "brigade", "runtime"],
        ["isolation.configured", "brigade", "runtime"],
        ["runtime.stopped", "brigade", "runtime"],
      ],
    );
  });

  // Le refus lui-même — le verrou, et le pid lu au journal de celui qui tient —
  // est joué dans le process du test (runtime.test.ts, verrou.test.ts) ; ici, que
  // le point d'entrée en fait un refus de démarrer. Le premier est un process
  // léger qui ne fait que tenir le verrou : un runtime de plus coûterait son
  // démarrage entier.
  test("un second runtime sur le même projet refuse de démarrer et dit pourquoi", async (t) => {
    const repertoire = repertoireTemporaire(t);
    const premier = lancer(t, TIENT_VERROU, [repertoire], { NODE_COMPILE_CACHE: cacheDeCompilation() });
    await premier.attendre("tenu");
    const journal = ouvrirJournal(repertoire);
    journal.ajouter({ project: "brigade", ticket: null, author: "runtime", type: "runtime.started", payload: { pid: premier.process.pid ?? 0, host: hostname(), node: process.version } });
    journal.fermer();

    const second = lancer(t, MAIN, [], environnement(t, repertoire));

    assert.equal(await second.fin, REFUS);
    assert.match(second.sortie(), /refus de démarrer/);
    assert.match(second.sortie(), new RegExp(`pid ${premier.process.pid}`));
    assert.deepEqual(relire(repertoire).map((e) => e.type), ["runtime.started"]);
  });

  test("sur un dossier de configuration vide, le runtime crée app.json et démarre sans qu'on l'édite", async (t) => {
    const repertoire = repertoireTemporaire(t);
    const app = join(repertoireTemporaire(t), "config/app.json");
    const runtime = lancer(t, MAIN, [], { ...environnement(t, repertoire), BRIGADE_APP_CONFIG: app });
    await runtime.attendre("démarré");

    assert.deepEqual(JSON.parse(readFileSync(app, "utf8")), { projets: [] });
    assert.match(runtime.sortie(), /app\.json created with the default settings/);
  });

  test("sans cloison ni porte, le runtime le dit au démarrage et l'écrit : les projets se voient", async (t) => {
    const runtime = await runtimeParDefaut(t);

    assert.match(runtime.sortie, /brigade : cloison — none \(BRIGADE_SANDBOX_BIN is not set\): a cook reads everything the service account reads — the state, the clone, the worktrees and the secrets of the other projects included/);
    assert.match(runtime.sortie, /brigade : réseau — open \(BRIGADE_PROXY_PORT is not set\): a cook reaches everything the machine reaches/);
    assert.deepEqual(runtime.journal.find((e) => e.type === "isolation.configured")?.payload, { sandbox: null, proxy: null });
  });

  test("avec une cloison, le runtime dit ce qu'elle masque, et le journal le garde pour le chef", { skip: posixOnly("starts the runtime under the fake bwrap and checks the sandbox line it prints, its isolation.configured fact and the transcripts it tidies; the expected line is a RegExp built from Windows paths, whose backslashes it reads as escapes, so it never matches there") }, async (t) => {
    // L'état et le clone sous une même racine, que la cloison masque ; le compte à côté.
    const racine = repertoireTemporaire(t);
    const repertoire = join(racine, "etats/brigade");
    const clone = join(racine, "etats/depot");
    mkdirSync(clone, { recursive: true });
    git(clone, "init", "-q");
    const env = { ...environnement(t, repertoire), BRIGADE_REPO_DIR: clone, BRIGADE_SANDBOX_BIN: FAUX_BWRAP, BRIGADE_SANDBOX_HIDDEN: join(racine, "etats"), HOME: join(racine, "compte") };
    // Deux transcripts laissés par une vie précédente, écrits il y a un mois et il y a une heure.
    const transcripts = join(repertoire, "claude/projects/-tmp");
    mkdirSync(transcripts, { recursive: true });
    for (const [nom, age] of [["vieux.jsonl", 30 * 24 * 3_600_000], ["jeune.jsonl", 3_600_000]] as const) {
      writeFileSync(join(transcripts, nom), "{}\n");
      utimesSync(join(transcripts, nom), new Date(Date.now() - age), new Date(Date.now() - age));
    }
    const runtime = lancer(t, MAIN, [], env);
    await runtime.attendre("démarré");

    assert.match(runtime.sortie(), new RegExp(`brigade : cloison — every launch \\(setup, cook, gates, reviewer, judges\\) runs in \`${FAUX_BWRAP}\` — hidden: ${join(racine, "etats")}`));
    assert.deepEqual(relire(repertoire).find((e) => e.type === "isolation.configured")?.payload, {
      sandbox: { bin: FAUX_BWRAP, hidden: [join(racine, "etats")], credentials: join(racine, "compte/.claude/.credentials.json") },
      proxy: null,
    });

    // Et le `~/.claude` du projet est rangé dès le démarrage : sept jours de garde.
    await jusqua(() => relire(repertoire).some((e) => e.type === "transcripts.tidied"));
    assert.deepEqual(readdirSync(join(repertoire, "claude/projects/-tmp")), ["jeune.jsonl"]);
    const [rangement] = relire(repertoire).flatMap((e) => (e.type === "transcripts.tidied" ? [e.payload] : []));
    assert.deepEqual([rangement?.removed, rangement?.kept, rangement?.keepMs], [1, 1, 7 * 24 * 3_600_000]);
  });

  test("le runtime démarre avec ses garde-fous : les plafonds réglés par l'environnement sont au journal", { skip: posixOnly("starts the runtime with BRIGADE_MAX_TOKENS=2000000 and reads the ceilings of its guard.configured fact; on Windows the runtime, killed at the end of the test, leaves its children (Git Bash running the fake gh, git) alive in the test's state directory, whose removal then fails (EPERM)") }, async (t) => {
    const repertoire = repertoireTemporaire(t);
    const runtime = lancer(t, MAIN, [], { ...environnement(t, repertoire), BRIGADE_MAX_TOKENS: "2000000" });
    await runtime.attendre("démarré");

    assert.deepEqual(relire(repertoire).find((e) => e.type === "guard.configured")?.payload, {
      limits: { durationMs: 3_600_000, tokens: 2_000_000, idleMs: 600_000 },
      breakerThreshold: 3,
      judgements: 3,
    });
  });

  test("un plafond illisible est un refus de démarrer, avant d'avoir rien écrit", async (t) => {
    const repertoire = join(repertoireTemporaire(t), "etat");
    const runtime = lancer(t, MAIN, [], { ...environnement(t, repertoire), BRIGADE_MAX_TOKENS: "beaucoup" });

    assert.equal(await runtime.fin, REFUS);
    assert.match(runtime.sortie(), /refus de démarrer.*BRIGADE_MAX_TOKENS/);
    assert.equal(existsSync(repertoire), false);
  });

  for (const [variable, env] of [
    ["BRIGADE_STATE_DIR", { BRIGADE_PROJECT: "brigade" }],
    ["BRIGADE_PROJECT", { BRIGADE_STATE_DIR: "/chemin/jamais/cree" }],
  ] as const) {
    test(`sans ${variable}, le runtime refuse de démarrer et nomme la variable`, async (t) => {
      const runtime = lancer(t, MAIN, [], { ...env, NODE_COMPILE_CACHE: cacheDeCompilation() });

      assert.equal(await runtime.fin, REFUS);
      assert.match(runtime.sortie(), new RegExp(`refus de démarrer[\\s\\S]*${variable} is not set`));
    });
  }

  for (const [cas, variables, motif] of [
    ["sans BRIGADE_GITHUB_REPO", { BRIGADE_GITHUB_REPO: "" }, /BRIGADE_GITHUB_REPO is not set/],
    ["avec un dépôt qui n'est pas <owner>/<repo>", { BRIGADE_GITHUB_REPO: "brigade" }, /BRIGADE_GITHUB_REPO invalid/],
    ["avec un bail qui n'est pas un nombre de secondes", { BRIGADE_LEASE_SECONDS: "dix" }, /BRIGADE_LEASE_SECONDS invalid/],
    ["sans BRIGADE_REPO_DIR", { BRIGADE_REPO_DIR: "" }, /BRIGADE_REPO_DIR is not set: give the folder of the clone/],
    ["avec un clone qui n'est pas un dépôt git", { BRIGADE_REPO_DIR: "/chemin/jamais/cree" }, /BRIGADE_REPO_DIR invalide/],
    ["sans BRIGADE_BASE_BRANCH", { BRIGADE_BASE_BRANCH: "" }, /BRIGADE_BASE_BRANCH n'est pas défini/],
    ["sans BRIGADE_MANAGER_MODEL", { BRIGADE_MANAGER_MODEL: "" }, /BRIGADE_MANAGER_MODEL n'est pas défini/],
    ["sans BRIGADE_MANAGER_EFFORT", { BRIGADE_MANAGER_EFFORT: "" }, /BRIGADE_MANAGER_EFFORT n'est pas défini/],
    ["avec un modèle de manager inconnu", { BRIGADE_MANAGER_MODEL: "gpt" }, /BRIGADE_MANAGER_MODEL invalid/],
    ["sans BRIGADE_REVIEWER_MODEL", { BRIGADE_REVIEWER_MODEL: "" }, /BRIGADE_REVIEWER_MODEL n'est pas défini/],
    ["sans BRIGADE_REVIEWER_EFFORT", { BRIGADE_REVIEWER_EFFORT: "" }, /BRIGADE_REVIEWER_EFFORT n'est pas défini/],
    ["avec un effort de reviewer inconnu", { BRIGADE_REVIEWER_EFFORT: "fort" }, /BRIGADE_REVIEWER_EFFORT invalid/],
    ["avec une roadmap qui n'est pas un numéro d'issue", { BRIGADE_ROADMAP_ISSUE: "roadmap" }, /BRIGADE_ROADMAP_ISSUE invalide/],
    ["avec un nombre d'entrées simultanées nul", { BRIGADE_MAX_SETUPS: "0" }, /invalid BRIGADE_MAX_SETUPS/],
    ["avec une durée de garde des transcripts illisible", { BRIGADE_TRANSCRIPTS_KEEP_DAYS: "toujours" }, /invalid BRIGADE_TRANSCRIPTS_KEEP_DAYS/],
    ["avec un seuil de mémoire illisible", { BRIGADE_MIN_FREE_MEMORY_MB: "un peu" }, /invalid BRIGADE_MIN_FREE_MEMORY_MB/],
    ["avec un plafond de calibrage inconnu", { BRIGADE_CEILING_EFFORT: "extrême" }, /BRIGADE_CEILING_EFFORT invalid: “extrême”/],
    ["avec une clé d'API dans l'environnement", { ANTHROPIC_API_KEY: "sk-ant-jamais" }, /ANTHROPIC_API_KEY est défini.*connexion Max/],
    ["avec un jeton d'API dans l'environnement", { ANTHROPIC_AUTH_TOKEN: "jamais" }, /ANTHROPIC_AUTH_TOKEN est défini.*connexion Max/],
    ["avec un fichier de jeton absent", { BRIGADE_CLAUDE_TOKEN_FILE: "/chemin/jamais/cree" }, /BRIGADE_CLAUDE_TOKEN_FILE invalide : « \/chemin\/jamais\/cree » est illisible ou absent/],
    ["avec une cloison qui ne masque rien", { BRIGADE_SANDBOX_BIN: FAUX_BWRAP, HOME: "/home/jamais" }, /BRIGADE_SANDBOX_BIN is set without BRIGADE_SANDBOX_HIDDEN/],
    ["avec une cloison qui laisse l'état dehors", { BRIGADE_SANDBOX_BIN: FAUX_BWRAP, BRIGADE_SANDBOX_HIDDEN: "/var/lib/jamais", HOME: "/home/jamais" }, /BRIGADE_STATE_DIR \(.*\) is not under any directory of BRIGADE_SANDBOX_HIDDEN/],
    ["avec une station dont le nom n'est pas <machine>/<moteur>", { BRIGADE_STATIONS: "box:2:code" }, /BRIGADE_STATIONS invalid: station no\. 1 \(“box:2:code”\) — name: “box” is not of the form/],
    ["avec une station au plafond nul", { BRIGADE_STATIONS: "box/claude:0:code" }, /BRIGADE_STATIONS invalid: station no\. 1 .* — cap: “0” is not an integer greater than zero/],
    ["avec deux stations du même nom", { BRIGADE_STATIONS: "box/claude:2:code,box/claude:1:code" }, /BRIGADE_STATIONS invalid: station no\. 2 .* — name: `box\/claude` is already declared/],
    ["avec un port de porte illisible", { BRIGADE_PROXY_PORT: "porte" }, /invalid BRIGADE_PROXY_PORT/],
    ["avec un port d'arbitre illisible", { BRIGADE_ARBITER_PORT: "arbitre" }, /invalid BRIGADE_ARBITER_PORT/],
  ] as const) {
    test(`${cas}, le runtime refuse de démarrer, et rien n'est écrit`, async (t) => {
      const repertoire = repertoireTemporaire(t);
      const runtime = lancer(t, MAIN, [], { ...environnement(t, repertoire), ...variables });

      assert.equal(await runtime.fin, REFUS);
      assert.match(runtime.sortie(), /refus de démarrer/);
      assert.match(runtime.sortie(), motif);
      assert.equal(rienEcritParLeRuntime(repertoire), true);
    });
  }

  function lireLeRail(repertoire: string) {
    return lecteur.lire(repertoire, "rail", (journal) => lireRail(journal.base)).slice();
  }

  // Ce que la station distante fait de son prêt — s'annoncer et réclamer par sa
  // demande au journal, renouveler sur preuve, rester 86 absente — se joue dans
  // le process du test (station-distante.test.ts), et le réveil du runtime par
  // ce qu'un autre process écrit au journal aussi (runtime.test.ts) ; ici, que
  // le point d'entrée la déclare avec les autres.
  test("un projet qui déclare deux stations ici et une distante démarre avec les trois : chacune s'annonce, avec son plafond, et le runtime les dit", { skip: posixOnly("starts the runtime with three declared stations and checks each station.announced fact and the stations line, then stops it with SIGTERM expecting exit 0; on Windows SIGTERM kills the runtime before its handler runs, so the exit code is null") }, async (t) => {
    const repertoire = repertoireTemporaire(t);
    const runtime = lancer(t, MAIN, [], { ...environnement(t, repertoire), BRIGADE_STATIONS: "box/claude:3:code+raisonnement,box/playwright:1:navigateur-headless,mac/claude:1:chrome-connecté:distante" });
    await runtime.attendre("démarré");

    assert.deepEqual(
      relire(repertoire).flatMap((e) => (e.type === "station.announced" ? [[e.author, e.payload]] : [])),
      [
        // Les deux d'ici annoncent les cœurs de cette machine ; la distante, elle, n'en dit rien.
        ["station:box/claude", { station: "box/claude", engine: "claude", provides: ["code", "raisonnement"], maxCooks: 3, cores: availableParallelism() }],
        ["station:box/playwright", { station: "box/playwright", engine: "playwright", provides: ["navigateur-headless"], maxCooks: 1, cores: availableParallelism() }],
        ["station:mac/claude", { station: "mac/claude", engine: "claude", provides: ["chrome-connecté"], maxCooks: 1, remote: true }],
      ],
    );
    assert.match(runtime.sortie(), /brigade : stations — box\/claude \(3 cooks at most; provides: code, raisonnement\) ; box\/playwright \(1 cook at most; provides: navigateur-headless\) ; mac\/claude \(1 cook at most; provides: chrome-connecté; remote: it pulls its work, the box never reaches it\)/);
    runtime.process.kill("SIGTERM");
    assert.equal(await runtime.fin, 0);
  });

  test("un projet qui ne déclare aucune station démarre quand même : le runtime le dit, l'écrit, et aucun cook ne part", { skip: posixOnly("starts the runtime with no station declared and checks the ticket stays waiting and the fake claude is never launched, then stops it with SIGTERM expecting exit 0; on Windows SIGTERM kills the runtime before its handler runs, so the exit code is null") }, async (t) => {
    const repertoire = repertoireTemporaire(t);
    const gh = fauxGh(t);
    gh.issues([issueGitHub(15, { labels: ["fire", "model:sonnet", "effort:low"] })]);
    const temoin = join(repertoireTemporaire(t), "temoin");
    mkdirSync(temoin);
    const runtime = lancer(t, MAIN, [], { ...environnement(t, repertoire, gh), BRIGADE_STATIONS: "", FAUX_CLAUDE_TEMOIN: temoin });
    await runtime.attendre("démarré");
    // Qu'aucune prise n'ait lieu ensuite, sans attendre qu'elle ait eu le temps
    // de se faire, se joue dans le process du test (stations.test.ts).
    await jusqua(() => lireLeRail(repertoire).length === 1);

    assert.match(runtime.sortie(), /brigade : stations — none \(BRIGADE_STATIONS is set neither in the environment nor in the log\): no cook will leave, the tickets stay queued on the rail — set them with `brigade brigade station stations box\/claude:30:code\+raisonnement`/);
    const types = relire(repertoire).map((e) => e.type);
    assert.deepEqual(types.slice(0, 8), ["runtime.started", "project.switched-on", "grant.activated", "guard.configured", "stations.undeclared", "drift.configured", "session.observed", "isolation.configured"]);
    assert.deepEqual(types.filter((type) => type.startsWith("station.") || type === "cook.launched" || type === "ticket.taken"), []);
    assert.deepEqual(lireLeRail(repertoire).map((ticket) => [ticket.ticket, ticket.state]), [[15, "waiting"]]);
    assert.deepEqual(lancementsDuFauxClaude(temoin), []);
    runtime.process.kill("SIGTERM");
    assert.equal(await runtime.fin, 0);
  });

  // Un rail retrouvé au redémarrage, GitHub en panne, se joue dans le process du
  // test (runtime.test.ts, alimenter.test.ts) : ici, que le point d'entrée
  // branche le sondage du dépôt sur le rail.
  test("les issues du dépôt arrivent sur le rail, avec leur priorité et leur fiche", { skip: posixOnly("reads the rail the real runtime builds from the fake gh's issues; on Windows the runtime, killed at the end of the test, leaves its children (Git Bash running the fake gh, git) alive in the test's state directory, whose removal then fails (EPERM)") }, async (t) => {
    const repertoire = repertoireTemporaire(t);
    const gh = fauxGh(t);
    gh.commentaires(15, "Un commentaire.", "<!-- brigade:fiche -->\n**Fiche du ticket**\n- attend : #14\n- zone : runtime/src/rail.ts");
    gh.issues([issueGitHub(14, { labels: ["fire", "prio:1"] }), issueGitHub(15)]);
    // Une machine sans session : la station ne prend rien, le rail ne bouge que
    // par GitHub.
    const runtime = lancer(t, MAIN, [], { ...environnement(t, repertoire, gh), FAUX_CLAUDE_SESSION: "absente" });
    await runtime.attendre("démarré");
    await jusqua(() => lireLeRail(repertoire).length === 2);

    const rail = lireLeRail(repertoire);
    assert.deepEqual(rail.map((ticket) => [ticket.ticket, ticket.priority, ticket.state]), [[14, 1, "waiting"], [15, null, "waiting"]]);
    assert.deepEqual(rail.map((ticket) => ticket.card), [null, { waitsFor: [14], zone: ["runtime/src/rail.ts"], problems: [] }]);
  });

  // L'interrupteur du projet (#1406) : posé allumé au premier démarrage, sans geste du chef.
  test("le manager est branché, et suit l'interrupteur du projet : allumé par défaut au premier démarrage, il sonde les issues ouvertes sans geste du chef", { skip: posixOnly("checks the manager, switched on by default, polls the open issues; on Windows the runtime, killed at the end of the test, leaves its children (Git Bash running the fake gh, git) alive in the test's state directory, whose removal then fails (EPERM)") }, async (t) => {
    const repertoire = repertoireTemporaire(t);
    const gh = fauxGh(t);
    gh.issues([]);
    const ouvertes = `repos/${DEPOT}/issues?state=open&per_page=100`;
    gh.repondre(ouvertes, { corps: [{ ...issueGitHub(1, { labels: ["tech"] }), author_association: "OWNER" }] });
    const sondees = () => gh.appels().filter((appel) => appel.at(-1) === ouvertes).length;
    const runtime = lancer(t, MAIN, [], { ...environnement(t, repertoire, gh), BRIGADE_ROADMAP_ISSUE: "1" });
    await runtime.attendre("interrupteur du projet allumé par défaut");

    await jusqua(() => relire(repertoire).some((e) => e.type === "manager.set-aside"));
    assert.deepEqual(relire(repertoire).find((e) => e.type === "manager.set-aside")?.payload, { reason: "roadmap", fired: false });
    assert.ok(sondees() > 0);
    const poses = relire(repertoire).filter((e) => e.type === "project.switched-on" || e.type === "grant.activated");
    assert.deepEqual(poses.map((e) => [e.type, e.author, e.payload]), [
      ["project.switched-on", "runtime", { cause: "default" }],
      ["grant.activated", "runtime", { action: "merge" }],
    ]);

    // Ce que les commandes `manager off` et `switch off` en font se joue dans
    // le process du test (manager-cli.test.ts, interrupteur.test.ts).
  });

  // Un seul cook part sur le vrai process, et le test s'arrête à son lancement :
  // ce que la station, la pass et le grant font ensuite de sa livraison — branche
  // poussée, PR, commentaire, gates, merge du commit jugé — se joue dans le
  // process du test (station.test.ts, cuisson-de-bout-en-bout.test.ts, pass.test.ts).
  test("une issue calibrée posée sur le dépôt part chez un cook, à son calibrage ; avec le jeton à son emplacement, sur une machine sans session, la station se sait connectée et le cook reçoit le jeton dans CLAUDE_CODE_OAUTH_TOKEN", { skip: posixOnly("lets the real runtime launch a cook with the token of BRIGADE_CLAUDE_TOKEN_FILE and expects it in the cook's CLAUDE_CODE_OAUTH_TOKEN; the test writes that file with mode 0o600, which on Windows keeps the ACL inherited from the temporary directory, so the runtime refuses it as readable by others and no cook is launched") }, async (t) => {
    const repertoire = repertoireTemporaire(t);
    const { clone } = depotGit(t);
    const gh = fauxGh(t);
    gh.issues([issueGitHub(15, { labels: ["fire", "model:sonnet", "effort:low"] })]);
    gh.repondre(`repos/${DEPOT}/pulls`, { statut: 201, corps: { html_url: `https://github.com/${DEPOT}/pull/40` } });
    gh.repondre(`repos/${DEPOT}/issues/15/comments`, { statut: 201, corps: { id: 1 } });
    const temoin = join(repertoireTemporaire(t), "temoin");
    mkdirSync(temoin);
    const fichier = join(repertoireTemporaire(t), "jeton-claude");
    writeFileSync(fichier, "sk-ant-oat01-jeton-de-la-machine\n", { mode: 0o600 });
    const runtime = lancer(t, MAIN, [], {
      ...environnement(t, repertoire, gh),
      BRIGADE_REPO_DIR: clone,
      BRIGADE_CLAUDE_TOKEN_FILE: fichier,
      FAUX_CLAUDE: "livre",
      FAUX_CLAUDE_TEMOIN: temoin,
      // Sans le jeton, `claude auth status` dirait la machine déconnectée, et
      // aucun cook ne partirait.
      FAUX_CLAUDE_SESSION: "absente",
    });

    await runtime.attendre("démarré");
    await jusqua(() => lancementsDuFauxClaude(temoin).length === 1);

    const lancement = relire(repertoire).find((e) => e.type === "cook.launched");
    assert.deepEqual([lancement?.ticket, lancement?.payload.model, lancement?.payload.effort], [15, "sonnet", "low"]);
    assert.ok(runtime.sortie().includes(`connection of \`claude\` — long-lived token read from ${fichier}, read again at each launch`), runtime.sortie());
    assert.equal(runtime.sortie().includes("sk-ant-oat01-jeton-de-la-machine"), false);
    const [cook] = lancementsDuFauxClaude(temoin);
    assert.equal(cook?.env.CLAUDE_CODE_OAUTH_TOKEN, "sk-ant-oat01-jeton-de-la-machine");
    assert.equal(cook?.env.BRIGADE_CLAUDE_TOKEN_FILE, undefined);
    assert.equal(relire(repertoire).some((e) => e.type === "station.disconnected"), false);
    runtime.process.kill("SIGTERM");
    assert.equal(await runtime.fin, 0);
  });

  // Une valeur refusée — un secret —, qui rend son erreur sans PR ni rien au
  // journal, se joue dans le process du test (reglages-projet/au-runtime.test.ts).
  test("un réglage du projet demandé au runtime : le vrai process ouvre la PR, qui ne change que le fichier des réglages, la remet à sa pass, et l'appel en rend l'adresse", { skip: posixOnly("has the real runtime open a settings PR for a calibration ceiling, then stops it with SIGTERM expecting exit 0; on Windows SIGTERM kills the runtime before its handler runs, so the exit code is null") }, async (t) => {
    const repertoire = repertoireTemporaire(t);
    const { origine, clone } = depotGit(t);
    const pr = { number: 41, html_url: `https://github.com/${DEPOT}/pull/41`, state: "open", merged: false, mergeable: true, base: { ref: BASE }, head: { sha: "tete" } };
    const gh = fauxGh(t);
    gh.issues([]);
    gh.repondre(`repos/${DEPOT}/pulls`, { statut: 201, corps: pr });
    gh.repondre(`repos/${DEPOT}/pulls?head=acme:cook/*`, { corps: [pr] });
    gh.repondre(`repos/${DEPOT}/pulls/41`, { corps: pr });
    const runtime = lancer(t, MAIN, [], { ...environnement(t, repertoire, gh), BRIGADE_REPO_DIR: clone });
    await runtime.attendre("démarré");
    const appel = { repertoireEtat: repertoire, projet: "brigade" };

    const reponse = await proposerAuRuntime({ calibrationCeiling: { model: "opus", effort: "high" } }, appel);
    assert.ok(reponse.ok, JSON.stringify(reponse));
    assert.equal(reponse.pr, pr.html_url);
    assert.deepEqual(git(origine, "diff", "--name-only", `${BASE}...${reponse.branche}`).split("\n"), [FICHIER]);
    const creations = gh.appels().filter((appel) => appel.at(-1) === `repos/${DEPOT}/pulls`);
    assert.equal(creations.length, 1, "one PR is opened");
    assert.ok(creations[0]?.includes(`head=${reponse.branche}`) && creations[0]?.includes(`base=${BASE}`), JSON.stringify(creations));
    await jusqua(() => relire(repertoire).some((e) => e.type === "pass.entered" && e.ticket === pr.number));
    runtime.process.kill("SIGTERM");
    assert.equal(await runtime.fin, 0);
  });

  test("sans Apps, le runtime dit qu'il tourne sous l'identité unique de la machine", async (t) => {
    const runtime = await runtimeParDefaut(t);

    assert.match(runtime.sortie, /GitHub — identité unique, celle du `gh` de la machine : rien ne réserve le merge à la pass/);
    // Relevés une fois GitHub sondé.
    assert.deepEqual([...new Set(runtime.jetons)], [null]);
    assert.equal(runtime.sansCompte, false);
  });

  // Un second runtime partagé, lancé avec un fichier de secrets et
  // CLAUDE_CODE_OAUTH_TOKEN dans son environnement : deux tests en lisent la
  // sortie, un seul démarrage les leur montre. Lancé par le premier qui le
  // demande, dans ses lieux, et arrêté par SIGTERM avant qu'il ne finisse.
  let avecSecrets: Promise<{ fichier: string; sortie: string; code: number | null }> | undefined;
  function runtimeAvecSecrets(t: TestContext) {
    avecSecrets ??= (async () => {
      const fichier = join(repertoireTemporaire(t), "secrets.env");
      writeFileSync(fichier, "CLE_API=une-valeur-de-dev\n", { mode: 0o600 });
      const runtime = lancer(t, MAIN, [], { ...environnement(t, repertoireTemporaire(t)), BRIGADE_SECRETS_FILE: fichier, CLAUDE_CODE_OAUTH_TOKEN: "sk-ant-oat01-pose-dans-l-environnement" });
      await runtime.attendre("démarré");
      runtime.process.kill("SIGTERM");
      const code = await runtime.fin;
      return { fichier, sortie: runtime.sortie(), code };
    })();
    return avecSecrets;
  }

  test("le runtime dit au démarrage où vivent les secrets du projet, ou qu'il n'en a pas", { skip: posixOnly("checks the startup line that names the secrets file, which the test writes with mode 0o600; on Windows that mode keeps the ACL inherited from the temporary directory, so the runtime refuses the file as readable by others and never starts") }, async (t) => {
    const sans = await runtimeParDefaut(t);
    assert.match(sans.sortie, /secrets du projet — aucun \(BRIGADE_SECRETS_FILE n'est pas défini\)/);

    const avec = await runtimeAvecSecrets(t);
    assert.ok(avec.sortie.includes(`secrets du projet — ${avec.fichier}, relu à chaque lancement`), avec.sortie);
    assert.equal(avec.sortie.includes("une-valeur-de-dev"), false);
  });

  test("avec CLAUDE_CODE_OAUTH_TOKEN seul dans l'environnement, le runtime démarre, et dit qu'il ne le transmet à aucun `claude`", { skip: posixOnly("starts the runtime with CLAUDE_CODE_OAUTH_TOKEN in its environment and a secrets file written with mode 0o600, checks it says it passes the token to no `claude`, then stops it with SIGTERM expecting exit 0; on Windows SIGTERM kills the runtime before its handler runs, so the exit code is null") }, async (t) => {
    const runtime = await runtimeAvecSecrets(t);

    assert.match(runtime.sortie, /connection of `claude` — the account's own \(BRIGADE_CLAUDE_TOKEN_FILE is not set\); CLAUDE_CODE_OAUTH_TOKEN is in the runtime's environment: it is passed to no `claude`/);
    assert.equal(runtime.sortie.includes("sk-ant-oat01-pose-dans-l-environnement"), false);
    assert.equal(runtime.code, 0);
  });

  test("sans jeton, le runtime démarre sur la connexion du compte et le dit", { skip: posixOnly("checks the shared runtime's `the account's own` connection line and its exit code 0 after SIGTERM; on Windows that shared runtime is stopped by killing its process tree, so its exit code is never 0") }, async (t) => {
    const runtime = await runtimeParDefaut(t);

    assert.match(runtime.sortie, /connection of `claude` — the account's own \(BRIGADE_CLAUDE_TOKEN_FILE is not set\)$/m);
    // Le relevé a envoyé SIGTERM.
    assert.equal(runtime.code, 0);
  });

  test("un fichier de jeton rangé dans l'état du runtime fait refuser de démarrer, sans laisser de journal", { skip: posixOnly("writes the claude token file, mode 0o600, inside the state directory and expects the refusal to name its location; on Windows that mode keeps the ACL inherited from the temporary directory, so the runtime refuses the file as readable by others before it looks at where it lies") }, async (t) => {
    const repertoire = repertoireTemporaire(t);
    writeFileSync(join(repertoire, "jeton-claude"), "sk-ant-oat01-range-dans-l-etat\n", { mode: 0o600 });
    const runtime = lancer(t, MAIN, [], { ...environnement(t, repertoire), BRIGADE_CLAUDE_TOKEN_FILE: join(repertoire, "jeton-claude") });

    assert.equal(await runtime.fin, REFUS);
    assert.match(runtime.sortie(), /refus de démarrer — BRIGADE_CLAUDE_TOKEN_FILE invalide.*hors de BRIGADE_STATE_DIR et de BRIGADE_REPO_DIR/);
    assert.equal(runtime.sortie().includes("sk-ant-oat01-range-dans-l-etat"), false);
    assert.equal(rienEcritParLeRuntime(repertoire), true);
  });

  test("un fichier de secrets rangé dans l'état du runtime fait refuser de démarrer, sans laisser de journal", { skip: posixOnly("writes the secrets file, mode 0o600, inside the state directory and expects the refusal to name its location; on Windows that mode keeps the ACL inherited from the temporary directory, so the runtime refuses the secrets as readable by others before it looks at where they lie") }, async (t) => {
    const repertoire = repertoireTemporaire(t);
    writeFileSync(join(repertoire, "secrets.env"), "CLE_API=une-valeur-de-dev\n", { mode: 0o600 });
    const runtime = lancer(t, MAIN, [], { ...environnement(t, repertoire), BRIGADE_SECRETS_FILE: join(repertoire, "secrets.env") });

    assert.equal(await runtime.fin, REFUS);
    assert.match(runtime.sortie(), /refus de démarrer — BRIGADE_SECRETS_FILE invalide.*hors de BRIGADE_STATE_DIR et de BRIGADE_REPO_DIR/);
    assert.equal(rienEcritParLeRuntime(repertoire), true);
  });

  test("un répertoire d'Apps incomplet fait refuser de démarrer, fichier nommé, sans laisser de journal", { skip: posixOnly("removes manager.pem from a GitHub Apps directory and expects the refusal to name it; on Windows the runtime first reads cook.pem's ACL through PowerShell, and that read fails or outlasts the test there, so the refusal never names manager.pem") }, async (t) => {
    const repertoire = repertoireTemporaire(t);
    const apps = await fauxGitHubApps(t);
    rmSync(join(apps.repertoire, "manager.pem"));
    const runtime = lancer(t, MAIN, [], { ...environnement(t, repertoire), BRIGADE_GITHUB_APPS_DIR: apps.repertoire, BRIGADE_GITHUB_API_URL: apps.url });

    assert.equal(await runtime.fin, REFUS);
    assert.ok(runtime.sortie().includes(`refus de démarrer — BRIGADE_GITHUB_APPS_DIR invalide : « ${join(apps.repertoire, "manager.pem")} »`), runtime.sortie());
    assert.equal(rienEcritParLeRuntime(repertoire), true);
  });

  // Chaque geste sous l'identité de son rôle, le push sous le jeton cook, le
  // cook et ses gates sans aucun jeton se jouent dans le process du test
  // (identites.test.ts, depot.test.ts, station.test.ts, pass.test.ts) ; ici, que
  // le point d'entrée ouvre les identités du répertoire d'Apps et les branche.
  test("une identité par rôle, sur le vrai process : le runtime le dit, sonde GitHub sous l'identité du manager — jamais sous le compte de la machine —, prépare aux cooks un `gh` sans compte, et aucun jeton ne s'écrit au journal ni dans sa sortie", { skip: posixOnly("starts the runtime with a GitHub Apps directory and reads under which token the fake gh was called; on Windows the runtime, killed at the end of the test, leaves its children (Git Bash running the fake gh, git) alive in the test's state directory, whose removal then fails (EPERM)") }, async (t) => {
    const repertoire = repertoireTemporaire(t);
    const gh = fauxGh(t);
    gh.issues([]);
    const apps = await fauxGitHubApps(t);
    const runtime = lancer(t, MAIN, [], {
      ...environnement(t, repertoire, gh),
      BRIGADE_GITHUB_APPS_DIR: apps.repertoire,
      BRIGADE_GITHUB_API_URL: apps.url,
      // Le compte du service porte un jeton GitHub : il ne doit atteindre personne.
      GH_TOKEN: "ghp_du_compte",
    });
    await runtime.attendre("démarré");
    const sondage = `repos/${DEPOT}/issues?labels=fire&state=open&per_page=100`;
    await jusqua(() => gh.appels().some((appel) => appel.at(-1) === sondage));

    assert.match(runtime.sortie(), /GitHub — une identité par rôle \(cook, pass, manager\)/);
    const sous = gh.appels().flatMap((appel, i) => (appel.at(-1) === sondage ? [/^ghs_([a-z]+)_/.exec(gh.jetons()[i] ?? "")?.[1] ?? gh.jetons()[i]] : []));
    assert.deepEqual([...new Set(sous)], ["manager"]);
    assert.ok(!gh.jetons().includes(null) && !gh.jetons().includes("ghp_du_compte"), JSON.stringify(gh.jetons()));
    assert.equal(existsSync(join(repertoire, "gh-sans-compte")), true);

    // Ni jeton ni JWT — ceux demandés jusqu'ici — : pas au journal, pas dans la sortie du runtime.
    const secrets = [...ROLES.flatMap((role) => apps.jetons(role)), ...apps.jwts(), "ghp_du_compte"];
    for (const ecrit of [JSON.stringify(relire(repertoire)), runtime.sortie()]) for (const secret of secrets) assert.ok(!ecrit.includes(secret), `un jeton s'est écrit : ${ecrit.slice(0, 200)}`);
  });

  test("un délai de la pass illisible fait refuser de démarrer, sans laisser de journal", async (t) => {
    const repertoire = repertoireTemporaire(t);
    const runtime = lancer(t, MAIN, [], { ...environnement(t, repertoire), BRIGADE_GATES_TIMEOUT_SECONDS: "longtemps" });

    assert.equal(await runtime.fin, REFUS);
    assert.match(runtime.sortie(), /refus de démarrer — BRIGADE_GATES_TIMEOUT_SECONDS invalide/);
    assert.equal(rienEcritParLeRuntime(repertoire), true);
  });

  test("l'unité systemd fournit ce que le point d'entrée exige, et ne relance pas un refus", () => {
    const unite = readFileSync(join(import.meta.dirname, "../deploy/brigade@.service"), "utf8");

    assert.match(unite, /^Environment=BRIGADE_STATE_DIR=\/var\/lib\/brigade\/%i$/m);
    assert.match(unite, /^StateDirectory=brigade\/%i$/m);
    assert.match(unite, /^Environment=BRIGADE_PROJECT=%i$/m);
    assert.match(unite, /^Environment=BRIGADE_REPO_DIR=\/var\/lib\/brigade\/%i\/depot$/m);
    assert.doesNotMatch(unite, /^Environment=.*(BRIGADE_CLAUDE_BIN|ANTHROPIC|TOKEN)/m);
    // Ce que le chef décide ne s'écrit pas dans l'unité : ni stations, ni seuils,
    // ni calibrage — le journal du projet en est le support.
    assert.doesNotMatch(unite, /^#?Environment=BRIGADE_(MANAGER|REVIEWER|STATIONS|DRIFT)/m);
    assert.doesNotMatch(unite, /BRIGADE_(MANAGER|REVIEWER)_(MODEL|EFFORT)|BRIGADE_STATIONS|BRIGADE_DRIFT_/);
    assert.match(unite, /station <geste> <valeur>/);
    assert.match(unite, new RegExp(`^RestartPreventExitStatus=${REFUS}$`, "m"));
    assert.match(unite, /^ExecStart=.* node src\/main\.ts$/m);
    // Son propre /tmp : un `/tmp/claude-<uid>` posé par un autre dans celui de la
    // machine n'arrête aucun cook.
    assert.match(unite, /^PrivateTmp=yes$/m);
  });

  test("la cloison se pose par un drop-in et une porte : l'unité du runtime, elle, ne cloisonne rien d'office", () => {
    const lire = (fichier: string) => readFileSync(join(import.meta.dirname, "../deploy", fichier), "utf8");
    // Sans le drop-in, le runtime tourne comme avant — et le dit.
    assert.doesNotMatch(lire("brigade@.service"), /^(Environment=BRIGADE_(SANDBOX|PROXY)|IPAddressDeny)/m);

    const cloison = lire("cloison.conf");
    assert.match(cloison, /^Environment=BRIGADE_SANDBOX_BIN=\/usr\/bin\/bwrap$/m);
    // Ce que l'unité range sous /var/lib/brigade et la doc sous /etc/brigade est masqué.
    assert.match(cloison, /^Environment=BRIGADE_SANDBOX_HIDDEN=\/var\/lib\/brigade:\/etc\/brigade$/m);
    assert.match(cloison, /^IPAddressDeny=any$/m);
    assert.match(cloison, /^IPAddressAllow=localhost$/m);
    assert.match(cloison, /^Requires=brigade-porte@%i\.service$/m);
    // Le port n'a pas de défaut : il n'est pas posé d'office.
    assert.doesNotMatch(cloison, /^Environment=BRIGADE_PROXY_PORT/m);

    const porte = lire("brigade-porte@.service");
    assert.match(porte, /^ExecStart=.* node src\/tenir-porte\.ts$/m);
    assert.match(porte, /^Environment=BRIGADE_STATE_DIR=\/var\/lib\/brigade\/%i$/m);
    assert.match(porte, /^Environment=BRIGADE_PROJECT=%i$/m);
    // C'est elle qui sort : aucun filtre, et aucun port d'office.
    assert.doesNotMatch(porte, /^(IPAddressDeny|Environment=BRIGADE_PROXY_PORT)/m);
    assert.match(porte, new RegExp(`^RestartPreventExitStatus=${REFUS}$`, "m"));
  });

  // Un arbitre injoignable, ou qui n'a jamais été là, la part rendue à l'arrêt,
  // et le mode dégradé levé sans arbitre désigné se jouent dans le process du
  // test (arbitrage.test.ts) ; ici, que le point d'entrée le joint et le dit.
  test("désigné par BRIGADE_ARBITER_PORT, l'arbitre entend le projet dès le démarrage ; sans lui, rien n'en est dit qu'une ligne", { skip: posixOnly("has the runtime heard by the arbiter of BRIGADE_ARBITER_PORT; on Windows the runtime, killed at the end of the test, leaves its children (Git Bash running the fake gh, git) alive in the test's state directory, whose removal then fails (EPERM)") }, async (t) => {
    const ouvert = ouvrirArbitre({ repertoire: repertoireTemporaire(t), plafond: 10 });
    const serveur = await servirArbitre(ouvert, 0);
    t.after(async () => {
      await serveur.fermer();
      ouvert.fermer();
    });
    const repertoire = repertoireTemporaire(t);
    const runtime = lancer(t, MAIN, [], { ...environnement(t, repertoire), BRIGADE_ARBITER_PORT: String(serveur.port) });
    await runtime.attendre("démarré");
    assert.match(runtime.sortie(), new RegExp(`brigade : arbitre — 127\\.0\\.0\\.1:${serveur.port}, consulté avant chaque lancement ; injoignable, le projet lance quand même, un cook à la fois`));
    await jusqua(() => ouvert.etat().projets.some((projet) => projet.projet === "brigade" && projet.presence === "entendu"));

    assert.equal(relire(repertoire).some((e) => e.type === "station.unarbitrated"), false);

    // Sans arbitre désigné : une ligne au démarrage, lue du runtime partagé, et pas de mode dégradé.
    const seul = await runtimeParDefaut(t);
    assert.match(seul.sortie, /brigade : arbitre — aucun \(BRIGADE_ARBITER_PORT n'est pas défini\) : ce projet se tient pour seul sur la machine et sur le compte/);
    assert.doesNotMatch(seul.sortieFinale, /mode dégradé/);
  });

  test("l'arbitre a son unité, unique sur la machine : ni port ni plafond d'office, et ses réglages là où la cloison les masque", () => {
    const lire = (fichier: string) => readFileSync(join(import.meta.dirname, "../deploy", fichier), "utf8");
    const arbitre = lire("brigade-arbitre.service");
    assert.match(arbitre, /^ExecStart=.* node src\/tenir-arbitre\.ts$/m);
    assert.match(arbitre, /^Environment=BRIGADE_ARBITER_STATE_DIR=\/var\/lib\/brigade\/\.arbitre$/m);
    assert.doesNotMatch(arbitre, /^Environment=BRIGADE_ARBITER_(PORT|MAX_COOKS)/m);
    assert.match(arbitre, new RegExp(`^RestartPreventExitStatus=${REFUS}$`, "m"));
    // Sans arbitre désigné, un runtime tourne comme avant : l'unité du projet n'en pose aucun.
    assert.doesNotMatch(lire("brigade@.service"), /^Environment=BRIGADE_ARBITER/m);
  });
});

test("main.test.ts ne laisse rien dans le répertoire temporaire", rienNeReste);
