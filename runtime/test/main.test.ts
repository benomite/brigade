// Le runtime tel que le chef le lance : un vrai process, piloté par ses
// variables d'environnement et par des signaux.
import assert from "node:assert/strict";
import { chmodSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, utimesSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { describe, test, type TestContext } from "node:test";
import { ouvrirArbitre, servirArbitre } from "../src/arbitre.ts";
import { empreinteDuCode, lireCodeEnService } from "../src/code.ts";
import { ROLES } from "../src/identites.ts";
import { ouvrirJournal } from "../src/journal.ts";
import { lireRail } from "../src/projections/rail.ts";
import { fauxGitHubApps } from "./aides/faux-github-apps.ts";
import { aArreter, BASE, DEPOT, depotGit, ecrireSuite, ENV_GIT, FAUX_BWRAP, FAUX_CLAUDE, fauxGh, type FauxGh, git, issueGitHub, jusqua, lancementsDuFauxClaude, lancer, mort, repertoireDuFichier, repertoireTemporaire, rienEcritParLeRuntime, SANS_RESEAU, temporaireDuFichier, tuerLesRelais, vivant } from "./outils.ts";

const rienNeReste = temporaireDuFichier();

const MAIN = join(import.meta.dirname, "../src/main.ts");
const TIRER = join(import.meta.dirname, "../src/tirer-cli.ts");
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

function relire(repertoire: string) {
  const journal = ouvrirJournal(repertoire, { lectureSeule: true });
  try {
    // Les décisions du chef sont posées avant le démarrage : elles ne sont pas
    // ce que le runtime écrit.
    return journal.tout().filter((e) => e.type !== "decision.set");
  } finally {
    journal.fermer();
  }
}

// Chaque test a son état, son dépôt et son GitHub, et écoute sur le port 0 : ils se jouent de front.
describe("le runtime, son process et ses unités", { concurrency: 8 }, () => {
  test("le runtime démarre, tourne, et s'arrête proprement sur SIGTERM", async (t) => {
    const repertoire = repertoireTemporaire(t);
    const runtime = lancer(t, MAIN, [], environnement(t, repertoire));
    await runtime.attendre("démarré");
    assert.deepEqual(relire(repertoire).map((e) => e.type), ["runtime.started", "guard.configured", "station.announced", "session.observed", "isolation.configured"]);

    // Ce qu'une autre commande lira pour dire s'il tourne sur le code installé.
    assert.equal(lireCodeEnService(repertoire), empreinteDuCode());

    runtime.process.kill("SIGTERM");

    assert.equal(await runtime.fin, 0);
    assert.match(runtime.sortie(), /arrêté/);
    assert.deepEqual(
      relire(repertoire).map((e) => [e.type, e.project, e.author]),
      [
        ["runtime.started", "brigade", "runtime"],
        ["guard.configured", "brigade", "runtime"],
        ["station.announced", "brigade", "station:box/claude"],
        ["session.observed", "brigade", "runtime"],
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
      apres.map((e) => [e.type, e.payload]).slice(5, 6),
      [["runtime.interrupted", { startedSeq: apres.find((e) => e.type === "runtime.started")?.seq }]],
    );
    assert.deepEqual(apres.map((e) => e.type), ["runtime.started", "guard.configured", "station.announced", "session.observed", "isolation.configured", "runtime.interrupted", "runtime.started"]);
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
    assert.deepEqual(relire(repertoire).map((e) => e.type), ["runtime.started", "guard.configured", "station.announced", "session.observed", "isolation.configured"]);
  });

  test("sans cloison ni porte, le runtime le dit au démarrage et l'écrit : les projets se voient", async (t) => {
    const repertoire = repertoireTemporaire(t);
    const runtime = lancer(t, MAIN, [], environnement(t, repertoire));
    await runtime.attendre("démarré");

    assert.match(runtime.sortie(), /brigade : cloison — none \(BRIGADE_SANDBOX_BIN is not set\): a cook reads everything the service account reads — the state, the clone, the worktrees and the secrets of the other projects included/);
    assert.match(runtime.sortie(), /brigade : réseau — open \(BRIGADE_PROXY_PORT is not set\): a cook reaches everything the machine reaches/);
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
    ["sans BRIGADE_GITHUB_REPO", { BRIGADE_GITHUB_REPO: "" }, /BRIGADE_GITHUB_REPO is not set/],
    ["avec un dépôt qui n'est pas <owner>/<repo>", { BRIGADE_GITHUB_REPO: "brigade" }, /BRIGADE_GITHUB_REPO invalid/],
    ["avec un bail qui n'est pas un nombre de secondes", { BRIGADE_LEASE_SECONDS: "dix" }, /BRIGADE_LEASE_SECONDS invalid/],
    ["sans BRIGADE_REPO_DIR", { BRIGADE_REPO_DIR: "" }, /BRIGADE_REPO_DIR n'est pas défini/],
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
    ["avec un plafond de calibrage inconnu", { BRIGADE_CEILING_EFFORT: "extrême" }, /BRIGADE_CEILING_EFFORT invalide/],
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
    const journal = ouvrirJournal(repertoire, { lectureSeule: true });
    try {
      return lireRail(journal.base);
    } finally {
      journal.fermer();
    }
  }

  test("un projet qui déclare deux stations démarre avec les deux : chacune s'annonce, avec son plafond, et le runtime les dit", async (t) => {
    const repertoire = repertoireTemporaire(t);
    const runtime = lancer(t, MAIN, [], { ...environnement(t, repertoire), BRIGADE_STATIONS: "box/claude:3:code+raisonnement,box/playwright:1:navigateur-headless" });
    await runtime.attendre("démarré");

    assert.deepEqual(
      relire(repertoire).flatMap((e) => (e.type === "station.announced" ? [[e.author, e.payload]] : [])),
      [
        ["station:box/claude", { station: "box/claude", engine: "claude", provides: ["code", "raisonnement"], maxCooks: 3 }],
        ["station:box/playwright", { station: "box/playwright", engine: "playwright", provides: ["navigateur-headless"], maxCooks: 1 }],
      ],
    );
    assert.match(runtime.sortie(), /brigade : stations — box\/claude \(3 cooks at most; provides: code, raisonnement\) ; box\/playwright \(1 cook at most; provides: navigateur-headless\)/);
    runtime.process.kill("SIGTERM");
    assert.equal(await runtime.fin, 0);
  });

  test("sur le vrai process : une station déclarée distante s'annonce et réclame par le geste `tirer`, lancé dans son propre process — le runtime lui prête le ticket qu'elle seule peut cuisiner, sans rien lancer ici", async (t) => {
    const repertoire = repertoireTemporaire(t);
    const gh = fauxGh(t);
    // Sans cloison sur son poste, elle ne prend que ce qui demande ses capacités.
    gh.commentaires(16, "<!-- brigade:fiche -->\n**Fiche du ticket**\n- requiert : chrome-connecté");
    gh.issues([issueGitHub(16, { labels: ["fire", "model:sonnet", "effort:low"] })]);
    const temoin = join(repertoireTemporaire(t), "temoin");
    mkdirSync(temoin);
    const runtime = lancer(t, MAIN, [], { ...environnement(t, repertoire, gh), BRIGADE_STATIONS: "mac/claude:1:chrome-connecté:distante", FAUX_CLAUDE_TEMOIN: temoin });
    await runtime.attendre("démarré");
    assert.match(runtime.sortie(), /brigade : stations — mac\/claude \(1 cook at most; provides: chrome-connecté; remote: it pulls its work, the box never reaches it\)/);
    assert.deepEqual(
      relire(repertoire).flatMap((e) => (e.type === "station.announced" ? [e.payload] : [])),
      [{ station: "mac/claude", engine: "claude", provides: ["chrome-connecté"], maxCooks: 1, remote: true }],
    );
    // Absente, son ticket est 86 : aucun cook ne part.
    await jusqua(() => lireLeRail(repertoire).some((ticket) => ticket.ticket === 16 && ticket.state === "86"));
    assert.equal(lireLeRail(repertoire)[0]?.reason, "station-absent: mac/claude");

    // Le geste, tel que la box le lance pour la station : un process, sa sortie, son code.
    const tirer = async (...args: string[]) => {
      const geste = lancer(t, TIRER, ["mac/claude", ...args], { BRIGADE_STATE_DIR: repertoire });
      const code = await geste.fin;
      return { code, sortie: geste.sortie() };
    };
    const annonce = await tirer("announce");
    assert.equal(annonce.code, 0, annonce.sortie);
    assert.deepEqual([JSON.parse(annonce.sortie).ok, JSON.parse(annonce.sortie).provides], [true, ["chrome-connecté"]]);
    await jusqua(() => lireLeRail(repertoire).some((ticket) => ticket.ticket === 16 && ticket.state === "waiting"));
    const prise = await tirer("claim");
    assert.equal(prise.code, 0, prise.sortie);
    const { mission } = JSON.parse(prise.sortie);
    assert.deepEqual([mission.ticket, mission.branch, mission.base, mission.model], [16, `cook/${mission.run}`, BASE, "sonnet"]);
    assert.deepEqual(lireLeRail(repertoire).map((ticket) => [ticket.ticket, ticket.state, ticket.station]), [[16, "taken", "mac/claude"]]);
    // Sans preuve, le renouvellement est refusé : code 1, et le refus se lit.
    const sansPreuve = await tirer("renew", mission.run, "--turns", "1", "--tokens", "10");
    assert.equal(sansPreuve.code, 1, sansPreuve.sortie);
    assert.equal(JSON.parse(sansPreuve.sortie.split("\n")[0] ?? "").refusal, "no-progress");
    const renouvele = await tirer("renew", mission.run, "--proof", "empreinte-1", "--turns", "1", "--tokens", "10");
    assert.equal(renouvele.code, 0, renouvele.sortie);
    // Rien n'a été lancé sur la box : ni `claude`, ni worktree.
    assert.deepEqual(lancementsDuFauxClaude(temoin), []);
    assert.equal(existsSync(join(repertoire, "worktrees")), false);
    runtime.process.kill("SIGTERM");
    assert.equal(await runtime.fin, 0);
  });

  test("un projet qui ne déclare aucune station démarre quand même : le runtime le dit, l'écrit, et aucun cook ne part", async (t) => {
    const repertoire = repertoireTemporaire(t);
    const gh = fauxGh(t);
    gh.issues([issueGitHub(15, { labels: ["fire", "model:sonnet", "effort:low"] })]);
    const temoin = join(repertoireTemporaire(t), "temoin");
    mkdirSync(temoin);
    const runtime = lancer(t, MAIN, [], { ...environnement(t, repertoire, gh), BRIGADE_STATIONS: "", FAUX_CLAUDE_TEMOIN: temoin });
    await runtime.attendre("démarré");
    await jusqua(() => lireLeRail(repertoire).length === 1);
    // Le temps qu'une prise qui ne doit pas avoir lieu aurait largement eu pour se faire.
    await new Promise((resoudre) => setTimeout(resoudre, 300));

    assert.match(runtime.sortie(), /brigade : stations — none \(BRIGADE_STATIONS is set neither in the environment nor in the log\): no cook will leave, the tickets stay queued on the rail — set them with `brigade brigade station stations box\/claude:30:code\+raisonnement`/);
    const types = relire(repertoire).map((e) => e.type);
    assert.deepEqual(types.slice(0, 5), ["runtime.started", "guard.configured", "stations.undeclared", "session.observed", "isolation.configured"]);
    assert.deepEqual(types.filter((type) => type.startsWith("station.") || type === "cook.launched" || type === "ticket.taken"), []);
    assert.deepEqual(lireLeRail(repertoire).map((ticket) => [ticket.ticket, ticket.state]), [[15, "waiting"]]);
    assert.deepEqual(lancementsDuFauxClaude(temoin), []);
    runtime.process.kill("SIGTERM");
    assert.equal(await runtime.fin, 0);
  });

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

    const allumer = lancer(t, join(import.meta.dirname, "../src/manager-cli.ts"), ["on"], { BRIGADE_STATE_DIR: repertoire });
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

    test("avec le jeton à son emplacement, sur une machine sans session : la station se sait connectée, et le cook reçoit le jeton dans CLAUDE_CODE_OAUTH_TOKEN", async (t) => {
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

      await jusqua(() => lancementsDuFauxClaude(temoin).length === 1);

      assert.ok(runtime.sortie().includes(`connection of \`claude\` — long-lived token read from ${fichier}, read again at each launch`), runtime.sortie());
      assert.equal(runtime.sortie().includes("sk-ant-oat01-jeton-de-la-machine"), false);
      const [cook] = lancementsDuFauxClaude(temoin);
      assert.equal(cook?.env.CLAUDE_CODE_OAUTH_TOKEN, "sk-ant-oat01-jeton-de-la-machine");
      assert.equal(cook?.env.BRIGADE_CLAUDE_TOKEN_FILE, undefined);
      assert.equal(relire(repertoire).some((e) => e.type === "station.disconnected"), false);
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

  test("un runtime remplacé pendant qu'un cook tourne : le cook lui survit, le runtime suivant le reprend sans le relancer, et sa livraison est jugée et mergée", async (t) => {
    const repertoire = repertoireTemporaire(t);
    aArreter(t, () => tuerLesRelais(repertoire));
    const { origine, clone } = depotGit(t);
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
    const avant = ouvrirJournal(repertoire);
    avant.ajouter({ project: "brigade", ticket: null, author: "chef", type: "grant.activated", payload: { action: "merge" } });
    avant.fermer();
    // Le cook commite, puis attend qu'on le laisse conclure ; le reviewer relit vert.
    const suite = join(repertoire, "suite.txt");
    ecrireSuite(suite, ["commite-puis-attend"]);
    const feu = join(repertoire, "feu");
    const env = { ...environnement(t, repertoire, gh), BRIGADE_REPO_DIR: clone, FAUX_CLAUDE: "relit-vert", FAUX_CLAUDE_SUITE: suite, FAUX_CLAUDE_FEU: feu };
    const faits = (type: string) => relire(repertoire).flatMap((e) => (e.type === type ? [{ ticket: e.ticket, payload: e.payload as Record<string, unknown> }] : []));

    const premier = lancer(t, MAIN, [], env);
    await jusqua(() => faits("cook.launched").length === 1);
    const run = String(faits("cook.launched")[0]?.payload.run);
    const fichierDuPid = join(repertoire, "runs", `${run}.cook.pid`);
    await jusqua(() => existsSync(fichierDuPid));
    const pid = Number(readFileSync(fichierDuPid, "utf8"));
    const worktree = join(repertoire, "worktrees", run);
    await jusqua(() => existsSync(join(worktree, "travail.txt")));

    // Le remplacement : le runtime s'arrête, le cook continue.
    premier.process.kill("SIGTERM");
    assert.equal(await premier.fin, 0);
    assert.equal(vivant(pid), true);
    assert.equal(existsSync(worktree), true);

    const second = lancer(t, MAIN, [], env);
    await jusqua(() => faits("cook.resumed").length === 1);
    assert.deepEqual(faits("cook.resumed")[0]?.ticket, 15);
    assert.equal(vivant(pid), true);
    assert.deepEqual(faits("cook.interrupted"), []);

    writeFileSync(feu, "");
    await jusqua(() => gh.appels().some((appel) => appel.includes("PATCH")));

    await mort(pid);
    const juge = git(origine, "rev-parse", `cook/${run}`);
    assert.equal(git(origine, "show", `cook/${run}:travail.txt`), "le travail du cook");
    // Un seul cook pour le ticket, lancé par le premier runtime ; sa fin écrite par le second.
    assert.deepEqual(faits("cook.launched").filter((e) => e.ticket === 15).map((e) => e.payload.run), [run]);
    assert.deepEqual(faits("cook.exited").filter((e) => e.ticket === 15).map((e) => [e.payload.run, e.payload.outcome]), [[run, "ok"]]);
    assert.deepEqual([faits("pass.judged")[0]?.payload.verdict, faits("pass.judged")[0]?.payload.sha], ["green", juge]);
    assert.deepEqual(gh.appels().find((appel) => appel.includes("PUT")), ["api", "-i", "-X", "PUT", "-f", `sha=${juge}`, "-f", "merge_method=merge", `repos/${DEPOT}/pulls/40/merge`]);
    assert.equal(faits("merge.done").length, 1);
    assert.deepEqual(lireLeRail(repertoire).map((ticket) => [ticket.ticket, ticket.state]), [[15, "served"]]);
    second.process.kill("SIGTERM");
    assert.equal(await second.fin, 0);
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

  test("avec CLAUDE_CODE_OAUTH_TOKEN seul dans l'environnement, le runtime démarre, et dit qu'il ne le transmet à aucun `claude`", async (t) => {
    const runtime = lancer(t, MAIN, [], { ...environnement(t, repertoireTemporaire(t)), CLAUDE_CODE_OAUTH_TOKEN: "sk-ant-oat01-pose-dans-l-environnement" });
    await runtime.attendre("démarré");

    assert.match(runtime.sortie(), /connection of `claude` — the account's own \(BRIGADE_CLAUDE_TOKEN_FILE is not set\); CLAUDE_CODE_OAUTH_TOKEN is in the runtime's environment: it is passed to no `claude`/);
    assert.equal(runtime.sortie().includes("sk-ant-oat01-pose-dans-l-environnement"), false);
    runtime.process.kill("SIGTERM");
    assert.equal(await runtime.fin, 0);
  });

  test("sans jeton, le runtime démarre sur la connexion du compte et le dit", async (t) => {
    const runtime = lancer(t, MAIN, [], environnement(t, repertoireTemporaire(t)));
    await runtime.attendre("démarré");

    assert.match(runtime.sortie(), /connection of `claude` — the account's own \(BRIGADE_CLAUDE_TOKEN_FILE is not set\)$/m);
    runtime.process.kill("SIGTERM");
    assert.equal(await runtime.fin, 0);
  });

  test("un fichier de jeton rangé dans l'état du runtime fait refuser de démarrer, sans laisser de journal", async (t) => {
    const repertoire = repertoireTemporaire(t);
    writeFileSync(join(repertoire, "jeton-claude"), "sk-ant-oat01-range-dans-l-etat\n", { mode: 0o600 });
    const runtime = lancer(t, MAIN, [], { ...environnement(t, repertoire), BRIGADE_CLAUDE_TOKEN_FILE: join(repertoire, "jeton-claude") });

    assert.equal(await runtime.fin, REFUS);
    assert.match(runtime.sortie(), /refus de démarrer — BRIGADE_CLAUDE_TOKEN_FILE invalide.*hors de BRIGADE_STATE_DIR et de BRIGADE_REPO_DIR/);
    assert.equal(runtime.sortie().includes("sk-ant-oat01-range-dans-l-etat"), false);
    assert.equal(rienEcritParLeRuntime(repertoire), true);
  });

  test("un fichier de secrets rangé dans l'état du runtime fait refuser de démarrer, sans laisser de journal", async (t) => {
    const repertoire = repertoireTemporaire(t);
    writeFileSync(join(repertoire, "secrets.env"), "CLE_API=une-valeur-de-dev\n", { mode: 0o600 });
    const runtime = lancer(t, MAIN, [], { ...environnement(t, repertoire), BRIGADE_SECRETS_FILE: join(repertoire, "secrets.env") });

    assert.equal(await runtime.fin, REFUS);
    assert.match(runtime.sortie(), /refus de démarrer — BRIGADE_SECRETS_FILE invalide.*hors de BRIGADE_STATE_DIR et de BRIGADE_REPO_DIR/);
    assert.equal(rienEcritParLeRuntime(repertoire), true);
  });

  test("un répertoire d'Apps incomplet fait refuser de démarrer, fichier nommé, sans laisser de journal", async (t) => {
    const repertoire = repertoireTemporaire(t);
    const apps = await fauxGitHubApps(t);
    rmSync(join(apps.repertoire, "manager.pem"));
    const runtime = lancer(t, MAIN, [], { ...environnement(t, repertoire), BRIGADE_GITHUB_APPS_DIR: apps.repertoire, BRIGADE_GITHUB_API_URL: apps.url });

    assert.equal(await runtime.fin, REFUS);
    assert.ok(runtime.sortie().includes(`refus de démarrer — BRIGADE_GITHUB_APPS_DIR invalide : « ${join(apps.repertoire, "manager.pem")} »`), runtime.sortie());
    assert.equal(rienEcritParLeRuntime(repertoire), true);
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

  test("désigné par BRIGADE_ARBITER_PORT, l'arbitre entend le projet dès le démarrage ; s'il s'en va, le runtime continue et l'écrit ; sans lui, rien n'en est dit qu'une ligne", async (t) => {
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

    // Le runtime s'arrête proprement : le projet rend sa part.
    runtime.process.kill("SIGTERM");
    assert.equal(await runtime.fin, 0);
    await jusqua(() => ouvert.etat().projets[0]?.presence === "absent");
    assert.equal(relire(repertoire).some((e) => e.type === "station.unarbitrated"), false);

    // L'arbitre n'est plus là : le runtime démarre quand même, et l'écrit une fois.
    // Le refus est joué dans le process du runtime, où toute connexion est refusée :
    // le port d'un arbitre qu'on vient de fermer n'est pas muet pour autant, un
    // voisin peut l'avoir repris. Celui du test écoute encore — joint, il répondrait.
    const sansLui = lancer(t, MAIN, [], { ...environnement(t, repertoire), BRIGADE_ARBITER_PORT: String(serveur.port), NODE_OPTIONS: `--import=${SANS_RESEAU}` });
    await sansLui.attendre("mode dégradé");
    assert.deepEqual(relire(repertoire).findLast((e) => e.type === "station.unarbitrated")?.payload, { station: "box/claude", reason: "connexion refusée" });
    sansLui.process.kill("SIGTERM");
    assert.equal(await sansLui.fin, 0);

    // Sans arbitre désigné : une ligne au démarrage, et le mode dégradé d'avant est levé.
    const seul = lancer(t, MAIN, [], environnement(t, repertoire));
    await seul.attendre("démarré");
    assert.match(seul.sortie(), /brigade : arbitre — aucun \(BRIGADE_ARBITER_PORT n'est pas défini\) : ce projet se tient pour seul sur la machine et sur le compte/);
    assert.doesNotMatch(seul.sortie(), /mode dégradé/);
    assert.equal(relire(repertoire).some((e) => e.type === "station.arbitrated"), true);
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
