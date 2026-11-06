// Le runtime tel que le chef le lance : un vrai process, piloté par ses
// variables d'environnement et par des signaux.
import assert from "node:assert/strict";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { generateKeyPairSync } from "node:crypto";
import { join } from "node:path";
import { after } from "node:test";
import { describe, test, type TestContext } from "node:test";
import { signalerLArbre } from "../src/arbre.ts";
import { empreinteDuCode, lireCodeEnService } from "../src/code.ts";
import { ecrireSecret } from "../src/droits.ts";
import { ROLES } from "../src/identites.ts";
import { principal as interrupteur } from "../src/interrupteur-cli.ts";
import { principal as manager } from "../src/manager-cli.ts";
import { relecteur } from "./aides/opt-B-journal.ts";
import { appeler, BASE, decisionsAuJournal, DEPOT, ENV_ENFANT, ENV_GIT, FAUX_BWRAP, FAUX_CLAUDE, fauxGh, type FauxGh, git, issueGitHub, jusqua, lancementsDuFauxClaude, lancer, repertoireDuFichier, repertoireTemporaire, rienEcritParLeRuntime, temporaireDuFichier } from "./outils.ts";
import { posixOnly } from "./support/plateforme.ts";

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
  // Au démarrage : le journal et l'empreinte du code en service ; la sortie,
  // relue une fois le runtime arrêté — ses lignes d'erreur (stderr) arrivent par
  // un autre tube que « démarré », et peuvent n'être pas encore lues quand il arrive.
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
    return { sortie: runtime.sortie(), journal, codeEnService, jetons, sansCompte, code, sortieFinale: runtime.sortie(), journalFinal: relire(repertoire) };
  })();
  return releve;
}

// Un second runtime partagé, réglé cette fois : un fichier d'app à créer, une
// cloison, un plafond de jetons, un fichier de secrets et un jeton OAuth dans
// l'environnement — des réglages qui ne se croisent pas. Les tests qui lisent
// chacun ce qu'un de ces réglages fait dire ou écrire au démarrage le lisent
// de ce relevé, comme ceux du runtime par défaut ; il est arrêté par SIGTERM.
// Sous Windows, ni cloison ni secrets : les tests qui les lisent y sont sautés,
// et un fichier de secrets y ferait refuser le démarrage.
type ReleveRegle = {
  sortie: string;
  journal: ReturnType<typeof relire>;
  // Les lieux, pour les lignes qui les nomment.
  racine: string;
  secrets: string;
  // Le fichier de l'app, lu une fois le runtime démarré.
  app: unknown;
  code: number | null;
};
let releveRegle: Promise<ReleveRegle> | undefined;
function runtimeRegle(t: TestContext): Promise<ReleveRegle> {
  releveRegle ??= (async () => {
    const posix = process.platform !== "win32";
    // L'état et le clone sous une même racine, que la cloison masque ; le compte à côté.
    const racine = repertoireTemporaire(t);
    const repertoire = join(racine, "etats/brigade");
    const clone = join(racine, "etats/depot");
    // L'état existe avant le démarrage : les décisions du chef y sont posées.
    mkdirSync(repertoire, { recursive: true });
    mkdirSync(clone, { recursive: true });
    git(clone, "init", "-q");
    const app = join(repertoireTemporaire(t), "config/app.json");
    // Les secrets sous ce que la cloison masque, hors de l'état et du clone.
    const secrets = join(racine, "etats/secrets.env");
    if (posix) writeFileSync(secrets, "CLE_API=une-valeur-de-dev\n", { mode: 0o600 });
    const env = {
      ...environnement(t, repertoire),
      BRIGADE_REPO_DIR: clone,
      BRIGADE_APP_CONFIG: app,
      BRIGADE_MAX_TOKENS: "2000000",
      CLAUDE_CODE_OAUTH_TOKEN: "sk-ant-oat01-pose-dans-l-environnement",
      ...(posix ? { BRIGADE_SANDBOX_BIN: FAUX_BWRAP, BRIGADE_SANDBOX_HIDDEN: join(racine, "etats"), HOME: join(racine, "compte"), BRIGADE_SECRETS_FILE: secrets } : {}),
    };
    const depuis = Date.now();
    const runtime = lancer(t, MAIN, [], env);
    await runtime.attendre("démarré");
    const releve = { journal: relire(repertoire), racine, secrets, app: JSON.parse(readFileSync(app, "utf8")) as unknown };
    if (process.platform === "win32") await signalerLArbre(runtime.process.pid ?? 0, "SIGKILL", { depuis });
    else runtime.process.kill("SIGTERM");
    // La sortie entière, comme celle du runtime par défaut : stderr compris.
    const code = await runtime.fin;
    return { ...releve, sortie: runtime.sortie(), code };
  })();
  return releveRegle;
}

// Les refus de démarrer, joués tous dans un seul process (aides/refus-de-main.ts) :
// main.ts y est réévalué pour chaque cas, sur son environnement, et ses modules
// ne se chargent qu'une fois — un Node par refus en coûtait trente. Chaque test
// déclare son cas, l'environnement préparé sur les lieux qu'il se donne, et ne
// lit que son relevé : le premier qui le demande les joue tous, et attend le
// relevé entier avant de finir — les lieux sont les siens. Qu'un refus sorte
// par le vrai `process.exit` d'un vrai process, code et message, le test
// « sans BRIGADE_STATE_DIR » et celui du second runtime le prouvent.
const REFUS_DE_MAIN = join(import.meta.dirname, "aides/refus-de-main.ts");
type Refus = { code: number | null; sortie: string; rienEcrit: boolean; etatCree: boolean };
type CasDeRefus = (t: TestContext, gh: FauxGh) => { env: Record<string, string>; repertoire: string };
const casDeRefus = new Map<string, CasDeRefus>();
let refusJoues: Promise<Map<string, Refus>> | undefined;
// Déclare un cas, au moment où son test se déclare ; un test sauté n'en déclare aucun.
function refusDe(nom: string, cas: CasDeRefus, saute: string | false = false): (t: TestContext) => Promise<Refus> {
  if (saute === false) casDeRefus.set(nom, cas);
  return async (t) => {
    refusJoues ??= (async () => {
      // Aucun cas n'atteint GitHub : un seul faux `gh` pour tous.
      const gh = fauxGh(t);
      gh.issues([]);
      const joues = [...casDeRefus].map(([cle, preparer]) => {
        const { env, repertoire } = preparer(t, gh);
        // Ce que `lancer` donne à main.ts : les décisions du chef posées au journal.
        return { cle, repertoire, env: { ...ENV_ENFANT, ...decisionsAuJournal(MAIN, env) } };
      });
      // En deux process de front : chacun charge les modules une fois, et le
      // relevé prend la moitié du temps.
      const lieux = repertoireTemporaire(t);
      const moitie = Math.ceil(joues.length / 2);
      const parts = await Promise.all(
        [joues.slice(0, moitie), joues.slice(moitie)].map(async (part, rang) => {
          const fichier = join(lieux, `cas-${rang}.json`);
          writeFileSync(fichier, JSON.stringify(part.map((cas) => cas.env)));
          const jeu = lancer(t, REFUS_DE_MAIN, [fichier]);
          assert.equal(await jeu.fin, 0, jeu.sortie());
          const releves = JSON.parse(jeu.sortie()) as Array<{ code: number | null; sortie: string }>;
          return part.map((_, i) => releves[i]);
        }),
      );
      const releves = parts.flat();
      return new Map(
        joues.map(({ cle, repertoire }, rang) => [
          cle,
          { ...(releves[rang] ?? { code: null, sortie: "non joué : un cas d'avant a démarré le runtime" }), rienEcrit: rienEcritParLeRuntime(repertoire), etatCree: existsSync(repertoire) },
        ]),
      );
    })();
    const releve = (await refusJoues).get(nom);
    assert.ok(releve, `cas non déclaré : ${nom}`);
    return releve;
  };
}

// Chaque test a son état, son dépôt et son GitHub, et écoute sur le port 0 : ils se jouent de front.
describe("le runtime, son process et ses unités", { concurrency: 8 }, () => {
  test("le runtime démarre, tourne, et s'arrête proprement sur SIGTERM", { skip: posixOnly("reads the shared runtime's record and expects exit code 0, the `arrêté` line and a runtime.stopped fact after SIGTERM; on Windows that shared runtime is stopped by killing its process tree, since SIGTERM would end it before its handler runs, so none of the three can be there") }, async (t) => {
    const runtime = await runtimeParDefaut(t);
    assert.deepEqual(runtime.journal.map((e) => e.type), ["runtime.started", "project.switched-on", "grant.activated", "guard.configured", "drift.configured", "session.observed", "isolation.configured"]);

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
        ["drift.configured", "brigade", "runtime"],
        ["session.observed", "brigade", "runtime"],
        ["isolation.configured", "brigade", "runtime"],
        ["runtime.stopped", "brigade", "runtime"],
      ],
    );
  });

  test("tué sans préavis puis relancé, le runtime retrouve son journal et y note l'interruption", { skip: posixOnly("kills the runtime with SIGKILL, restarts it and expects runtime.interrupted in its log; on Windows a killed runtime leaves the children it had launched (Git Bash running the fake gh, git) alive, and they still hold one of the test's temporary directories when it is removed (EPERM)") }, async (t) => {
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
      apres.map((e) => [e.type, e.payload]).slice(7, 8),
      [["runtime.interrupted", { startedSeq: apres.find((e) => e.type === "runtime.started")?.seq }]],
    );
    assert.deepEqual(apres.map((e) => e.type), ["runtime.started", "project.switched-on", "grant.activated", "guard.configured", "drift.configured", "session.observed", "isolation.configured", "runtime.interrupted", "runtime.started"]);
  });

  test("un second runtime sur le même projet refuse de démarrer et dit pourquoi", { skip: posixOnly("starts a second runtime on a project the first one holds and expects it refused, naming the first one's pid; on Windows the first runtime, killed at the end of the test, leaves its children (Git Bash running the fake gh, git) alive in the test's temporary directories, whose removal then fails (EPERM)") }, async (t) => {
    const repertoire = repertoireTemporaire(t);
    const env = environnement(t, repertoire);
    const premier = lancer(t, MAIN, [], env);
    await premier.attendre("démarré");

    const second = lancer(t, MAIN, [], env);

    assert.equal(await second.fin, REFUS);
    assert.match(second.sortie(), /refus de démarrer/);
    assert.match(second.sortie(), new RegExp(`pid ${premier.process.pid}`));
    assert.deepEqual(relire(repertoire).map((e) => e.type), ["runtime.started", "project.switched-on", "grant.activated", "guard.configured", "drift.configured", "session.observed", "isolation.configured"]);
  });

  test("sur un dossier de configuration vide, le runtime crée app.json et démarre sans qu'on l'édite", async (t) => {
    const runtime = await runtimeRegle(t);

    assert.deepEqual(runtime.app, { projets: [] });
    assert.match(runtime.sortie, /app\.json created with the default settings/);
  });

  test("sans cloison ni porte, le runtime le dit au démarrage et l'écrit : les projets se voient", async (t) => {
    const runtime = await runtimeParDefaut(t);

    assert.match(runtime.sortie, /brigade : cloison — none \(BRIGADE_SANDBOX_BIN is not set\): a cook reads everything the service account reads — the state, the clone, the worktrees and the secrets of the other projects included/);
    assert.match(runtime.sortie, /brigade : réseau — open \(BRIGADE_PROXY_PORT is not set\): a cook reaches everything the machine reaches/);
    assert.deepEqual(runtime.journal.find((e) => e.type === "isolation.configured")?.payload, { sandbox: null, proxy: null });
  });

  test("avec une cloison, le runtime dit ce qu'elle masque, et le journal le garde pour le chef", { skip: posixOnly("starts the runtime under the fake bwrap and checks the sandbox line it prints and its isolation.configured fact; the expected line is a RegExp built from Windows paths, whose backslashes it reads as escapes, so it never matches there") }, async (t) => {
    const runtime = await runtimeRegle(t);
    const { racine } = runtime;

    assert.match(runtime.sortie, new RegExp(`brigade : cloison — every launch \\(setup, cook, gates, reviewer, judges\\) runs in \`${FAUX_BWRAP}\` — hidden: ${join(racine, "etats")}`));
    assert.deepEqual(runtime.journal.find((e) => e.type === "isolation.configured")?.payload, {
      sandbox: { bin: FAUX_BWRAP, hidden: [join(racine, "etats")], credentials: join(racine, "compte/.claude/.credentials.json") },
      proxy: null,
    });
  });

  test("le runtime démarre avec ses garde-fous : les plafonds réglés par l'environnement sont au journal", { skip: posixOnly("starts the runtime with BRIGADE_MAX_TOKENS=2000000 and reads the ceilings of its guard.configured fact; on Windows the runtime, killed at the end of the test, leaves its children (Git Bash running the fake gh, git) alive in the test's state directory, whose removal then fails (EPERM)") }, async (t) => {
    const runtime = await runtimeRegle(t);

    assert.deepEqual(runtime.journal.find((e) => e.type === "guard.configured")?.payload, {
      limits: { durationMs: 3_600_000, tokens: 2_000_000, idleMs: 600_000 },
      breakerThreshold: 3,
      judgements: 3,
    });
  });

  const plafondIllisible = refusDe("plafond illisible", (t, gh) => {
    const repertoire = join(repertoireTemporaire(t), "etat");
    return { repertoire, env: { ...environnement(t, repertoire, gh), BRIGADE_MAX_TOKENS: "beaucoup" } };
  });
  test("un plafond illisible est un refus de démarrer, avant d'avoir rien écrit", async (t) => {
    const runtime = await plafondIllisible(t);

    assert.equal(runtime.code, REFUS);
    assert.match(runtime.sortie, /refus de démarrer.*BRIGADE_MAX_TOKENS/);
    assert.equal(runtime.etatCree, false);
  });

  // Le refus d'un vrai process : son code de sortie, et ce qu'il dit.
  test("sans BRIGADE_STATE_DIR, le runtime refuse de démarrer et nomme la variable", async (t) => {
    const runtime = lancer(t, MAIN, [], { BRIGADE_PROJECT: "brigade" });

    assert.equal(await runtime.fin, REFUS);
    assert.match(runtime.sortie(), /refus de démarrer[\s\S]*BRIGADE_STATE_DIR is not set/);
  });

  const sansProjet = refusDe("sans BRIGADE_PROJECT", () => ({ repertoire: "/chemin/jamais/cree", env: { BRIGADE_STATE_DIR: "/chemin/jamais/cree" } }));
  test("sans BRIGADE_PROJECT, le runtime refuse de démarrer et nomme la variable", async (t) => {
    const runtime = await sansProjet(t);

    assert.equal(runtime.code, REFUS);
    assert.match(runtime.sortie, /refus de démarrer[\s\S]*BRIGADE_PROJECT is not set/);
  });

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
    const refus = refusDe(cas, (t, gh) => {
      const repertoire = repertoireTemporaire(t);
      return { repertoire, env: { ...environnement(t, repertoire, gh), ...variables } };
    });
    test(`${cas}, le runtime refuse de démarrer, et rien n'est écrit`, async (t) => {
      const runtime = await refus(t);

      assert.equal(runtime.code, REFUS);
      assert.match(runtime.sortie, /refus de démarrer/);
      assert.match(runtime.sortie, motif);
      assert.equal(runtime.rienEcrit, true);
    });
  }

  test("un projet qui ne déclare aucune station démarre quand même : le runtime le dit, l'écrit, et aucun cook ne part", { skip: posixOnly("starts the runtime with no station declared and checks the GitHub-only station is refused and the fake claude is never launched, then stops it with SIGTERM expecting exit 0; on Windows SIGTERM kills the runtime before its handler runs, so the exit code is null") }, async (t) => {
    const repertoire = repertoireTemporaire(t);
    const gh = fauxGh(t);
    gh.issues([issueGitHub(15, { labels: ["fire", "model:sonnet", "effort:low"] })]);
    const temoin = join(repertoireTemporaire(t), "temoin");
    mkdirSync(temoin);
    const runtime = lancer(t, MAIN, [], { ...environnement(t, repertoire, gh), BRIGADE_STATIONS: "", FAUX_CLAUDE_TEMOIN: temoin });
    await runtime.attendre("démarré");
    // Sans station sur cette machine, la station GitHub seul est refusée, et le dit.
    await runtime.attendre("cannot serve the project on GitHub-only state — the project declares no station on this machine");

    assert.match(runtime.sortie(), /brigade : stations — none \(BRIGADE_STATIONS is set neither in the environment nor in the log\): no cook will leave, the tickets stay queued on the rail — set them with `brigade brigade station stations box\/claude:30:code\+raisonnement`/);
    const types = relire(repertoire).map((e) => e.type);
    assert.deepEqual(types.slice(0, 7), ["runtime.started", "project.switched-on", "grant.activated", "guard.configured", "drift.configured", "session.observed", "isolation.configured"]);
    assert.deepEqual(types.filter((type) => type.startsWith("station.") || type === "cook.launched" || type === "ticket.taken"), []);
    assert.deepEqual(lancementsDuFauxClaude(temoin), []);
    runtime.process.kill("SIGTERM");
    assert.equal(await runtime.fin, 0);
  });

  // L'interrupteur du projet (#1406) : posé allumé au premier démarrage, sans geste du chef.
  test("le manager est branché, et suit l'interrupteur du projet : allumé par défaut au premier démarrage, il sonde les issues ouvertes sans geste du chef", { skip: posixOnly("checks the manager, switched on by default, polls the open issues and is turned off only by the project switch, then stops the runtime with SIGTERM expecting exit 0; on Windows SIGTERM kills the runtime before its handler runs, so the exit code is null") }, async (t) => {
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

    // Le manager seul ne s'éteint plus : la commande nomme l'interrupteur du projet.
    // Les commandes du chef se jouent dans le process du test : c'est le journal qu'elles touchent.
    const eteindre = appeler(manager, ["off"], { BRIGADE_STATE_DIR: repertoire });
    assert.equal(await eteindre.fin, 1);
    const projet = appeler(interrupteur, ["off"], { BRIGADE_STATE_DIR: repertoire });
    assert.equal(await projet.fin, 0);
    assert.ok(relire(repertoire).some((e) => e.type === "project.switched-off" && e.author === "chef"));
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

  test("le runtime dit au démarrage où vivent les secrets du projet, ou qu'il n'en a pas", { skip: posixOnly("checks the startup line that names the secrets file, which the test writes with mode 0o600; on Windows that mode keeps the ACL inherited from the temporary directory, so the runtime refuses the file as readable by others and never starts") }, async (t) => {
    const sans = await runtimeParDefaut(t);
    assert.match(sans.sortie, /secrets du projet — aucun \(BRIGADE_SECRETS_FILE n'est pas défini\)/);

    const avec = await runtimeRegle(t);
    assert.ok(avec.sortie.includes(`secrets du projet — ${avec.secrets}, relu à chaque lancement`), avec.sortie);
    assert.equal(avec.sortie.includes("une-valeur-de-dev"), false);
  });

  test("avec CLAUDE_CODE_OAUTH_TOKEN seul dans l'environnement, le runtime démarre, et dit qu'il ne le transmet à aucun `claude`", { skip: posixOnly("starts the runtime with CLAUDE_CODE_OAUTH_TOKEN in its environment and checks it says it passes it to no `claude`, then stops it with SIGTERM expecting exit 0; on Windows SIGTERM kills the runtime before its handler runs, so the exit code is null") }, async (t) => {
    const runtime = await runtimeRegle(t);

    assert.match(runtime.sortie, /connection of `claude` — the account's own \(BRIGADE_CLAUDE_TOKEN_FILE is not set\); CLAUDE_CODE_OAUTH_TOKEN is in the runtime's environment: it is passed to no `claude`/);
    assert.equal(runtime.sortie.includes("sk-ant-oat01-pose-dans-l-environnement"), false);
    // Le relevé a envoyé SIGTERM.
    assert.equal(runtime.code, 0);
  });

  test("sans jeton, le runtime démarre sur la connexion du compte et le dit", { skip: posixOnly("checks the shared runtime's `the account's own` connection line and its exit code 0 after SIGTERM; on Windows that shared runtime is stopped by killing its process tree, so its exit code is never 0") }, async (t) => {
    const runtime = await runtimeParDefaut(t);

    assert.match(runtime.sortie, /connection of `claude` — the account's own \(BRIGADE_CLAUDE_TOKEN_FILE is not set\)$/m);
    // Le relevé a envoyé SIGTERM.
    assert.equal(runtime.code, 0);
  });

  const sautJeton = posixOnly("writes the claude token file, mode 0o600, inside the state directory and expects the refusal to name its location; on Windows that mode keeps the ACL inherited from the temporary directory, so the runtime refuses the file as readable by others before it looks at where it lies");
  const jetonDansLEtat = refusDe(
    "jeton dans l'état",
    (t, gh) => {
      const repertoire = repertoireTemporaire(t);
      writeFileSync(join(repertoire, "jeton-claude"), "sk-ant-oat01-range-dans-l-etat\n", { mode: 0o600 });
      return { repertoire, env: { ...environnement(t, repertoire, gh), BRIGADE_CLAUDE_TOKEN_FILE: join(repertoire, "jeton-claude") } };
    },
    sautJeton,
  );
  test("un fichier de jeton rangé dans l'état du runtime fait refuser de démarrer, sans laisser de journal", { skip: sautJeton }, async (t) => {
    const runtime = await jetonDansLEtat(t);

    assert.equal(runtime.code, REFUS);
    assert.match(runtime.sortie, /refus de démarrer — BRIGADE_CLAUDE_TOKEN_FILE invalide.*hors de BRIGADE_STATE_DIR et de BRIGADE_REPO_DIR/);
    assert.equal(runtime.sortie.includes("sk-ant-oat01-range-dans-l-etat"), false);
    assert.equal(runtime.rienEcrit, true);
  });

  const sautSecrets = posixOnly("writes the secrets file, mode 0o600, inside the state directory and expects the refusal to name its location; on Windows that mode keeps the ACL inherited from the temporary directory, so the runtime refuses the secrets as readable by others before it looks at where they lie");
  const secretsDansLEtat = refusDe(
    "secrets dans l'état",
    (t, gh) => {
      const repertoire = repertoireTemporaire(t);
      writeFileSync(join(repertoire, "secrets.env"), "CLE_API=une-valeur-de-dev\n", { mode: 0o600 });
      return { repertoire, env: { ...environnement(t, repertoire, gh), BRIGADE_SECRETS_FILE: join(repertoire, "secrets.env") } };
    },
    sautSecrets,
  );
  test("un fichier de secrets rangé dans l'état du runtime fait refuser de démarrer, sans laisser de journal", { skip: sautSecrets }, async (t) => {
    const runtime = await secretsDansLEtat(t);

    assert.equal(runtime.code, REFUS);
    assert.match(runtime.sortie, /refus de démarrer — BRIGADE_SECRETS_FILE invalide.*hors de BRIGADE_STATE_DIR et de BRIGADE_REPO_DIR/);
    assert.equal(runtime.rienEcrit, true);
  });

  // Un répertoire d'Apps où manquent la clé du manager : les autres clés sont
  // de vraies clés privées — une courbe elliptique, qui se tire en une
  // milliseconde ; le refus tombe avant qu'aucune ne serve à GitHub.
  const sautApps = posixOnly("removes manager.pem from a GitHub Apps directory and expects the refusal to name it; on Windows the runtime first reads cook.pem's ACL through PowerShell, and that read fails or outlasts the test there, so the refusal never names manager.pem");
  let appsIncompletes = "";
  const appsSansManager = refusDe(
    "apps incomplètes",
    (t, gh) => {
      const repertoire = repertoireTemporaire(t);
      appsIncompletes = join(repertoireTemporaire(t), "apps");
      mkdirSync(appsIncompletes, { mode: 0o700 });
      const cle = generateKeyPairSync("ec", { namedCurve: "prime256v1" }).privateKey.export({ type: "pkcs8", format: "pem" }).toString();
      for (const [rang, role] of ROLES.entries()) {
        writeFileSync(join(appsIncompletes, `${role}.id`), `${1001 + rang}\n`);
        if (role !== "manager") ecrireSecret(join(appsIncompletes, `${role}.pem`), cle);
      }
      return { repertoire, env: { ...environnement(t, repertoire, gh), BRIGADE_GITHUB_APPS_DIR: appsIncompletes } };
    },
    sautApps,
  );
  test("un répertoire d'Apps incomplet fait refuser de démarrer, fichier nommé, sans laisser de journal", { skip: sautApps }, async (t) => {
    const runtime = await appsSansManager(t);

    assert.equal(runtime.code, REFUS);
    assert.ok(runtime.sortie.includes(`refus de démarrer — BRIGADE_GITHUB_APPS_DIR invalide : « ${join(appsIncompletes, "manager.pem")} »`), runtime.sortie);
    assert.equal(runtime.rienEcrit, true);
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
