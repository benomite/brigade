// La station telle que la machine la lance : un seul vrai process, qui sert
// tous les projets de sa configuration, piloté par cette configuration et par
// des signaux.
import assert from "node:assert/strict";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { describe, test, type TestContext } from "node:test";
import { ouvrirJournal } from "../../src/journal.ts";
import { accepterSansBacASable } from "../../src/onboarding/attente.ts";
import { principal as status } from "../../src/status.ts";
import { relecteur } from "../aides/opt-B-journal.ts";
import { aArreter, appeler, BASE, depotGit, ENV_GIT, FAUX_CLAUDE, fauxGh, type FauxGh, git, issueGitHub, jusqua, lancer, repertoireTemporaire, temporaireDuFichier } from "../outils.ts";
import { FAUX_GH_GISTS } from "../appairage/doublure-des-gists.ts";
import { posixOnly } from "../support/plateforme.ts";

const rienNeReste = temporaireDuFichier();

const STATION = join(import.meta.dirname, "../../src/station/main.ts");
const REFUS = 2;

// Les décisions sans lesquelles un projet ne sert pas : le chef les a posées
// au journal du projet, avant de lui écrire sa ligne.
const DECIDE = {
  BRIGADE_STATIONS: "box/claude:30:code",
  BRIGADE_MANAGER_MODEL: "sonnet",
  BRIGADE_MANAGER_EFFORT: "medium",
  BRIGADE_REVIEWER_MODEL: "sonnet",
  BRIGADE_REVIEWER_EFFORT: "medium",
};

// Une station d'essai : son répertoire, et un compte à côté — tout ce qu'une
// machine porte hors de la station.
function uneStation(t: TestContext) {
  const machine = repertoireTemporaire(t);
  const racine = join(machine, "station");
  const compte = join(machine, "compte");
  // GitHub, hors de la machine.
  const gists = repertoireTemporaire(t);
  mkdirSync(racine);
  mkdirSync(compte);
  const env = {
    ...ENV_GIT,
    // Ce que la station publie d'elle sur GitHub (appairage/presence.ts) va à
    // une doublure : aucun test ne joint GitHub.
    BRIGADE_GH_BIN: FAUX_GH_GISTS,
    FAUX_GISTS: gists,
    HOME: compte,
    BRIGADE_STATION_DIR: racine,
    BRIGADE_STATION_NOM: "box",
    BRIGADE_CLAUDE_BIN: FAUX_CLAUDE,
    // La machine du poste ne décide d'aucun test : une suite qui tourne à côté
    // charge le processeur bien au-delà du seuil par défaut.
    BRIGADE_MAX_LOAD_PER_CORE: "1000000",
    BRIGADE_MIN_FREE_MEMORY_MB: "0",
    BRIGADE_MIN_FREE_DISK_MB: "0",
  };
  const etat = (projet: string) => join(racine, "etat", projet);
  // Ce que le chef a fait d'un projet avant de l'ajouter : ses décisions au
  // journal, et — sans clone nommé sur sa ligne — un clone à sa place.
  const preparer = (projet: string, options: { clone?: boolean; grant?: boolean } = {}) => {
    mkdirSync(etat(projet), { recursive: true });
    const journal = ouvrirJournal(etat(projet));
    for (const [name, value] of Object.entries(DECIDE)) journal.ajouter({ project: projet, ticket: null, author: "chef", type: "decision.set", payload: { name, value, previous: null } });
    if (options.grant) journal.ajouter({ project: projet, ticket: null, author: "chef", type: "grant.activated", payload: { action: "merge" } });
    journal.fermer();
    // Ces cuisines tournent sans bac à sable : le chef a décidé de continuer ainsi.
    accepterSansBacASable({ repertoireEtat: etat(projet), station: "box" });
    if (options.clone !== false) {
      const clone = join(racine, "clones", projet);
      mkdirSync(clone, { recursive: true });
      git(clone, "init", "-q");
    }
  };
  const configurer = (texte: string) => writeFileSync(join(racine, "projets"), texte);
  // Sondé toutes les cinq millisecondes par les attentes : relu seulement
  // quand la station y a écrit.
  const lecteur = relecteur();
  aArreter(t, () => lecteur.fermer());
  const relire = (projet: string) => {
    if (!existsSync(join(etat(projet), "log.db"))) return [];
    return lecteur.lire(etat(projet), "tout", (journal) => journal.tout()).filter((e) => e.type !== "decision.set");
  };
  const faits = (projet: string, type: string) => relire(projet).flatMap((e) => (e.type === type ? [{ ticket: e.ticket, payload: e.payload as Record<string, unknown> }] : []));
  return { machine, racine, compte, gists, env, etat, preparer, configurer, relire, faits };
}

// Les réponses du faux `gh` pour un autre dépôt que celui des outils : ses
// issues, et leurs commentaires.
function issuesDe(gh: FauxGh, depot: string, liste: ReturnType<typeof issueGitHub>[]) {
  for (const issue of liste) {
    gh.repondre(`repos/${depot}/issues/${issue.number}`, { corps: issue });
    gh.repondre(`repos/${depot}/issues/${issue.number}/comments?per_page=100`, { corps: [] });
  }
  gh.repondre(`repos/${depot}/issues?labels=fire&state=open&per_page=100`, { corps: liste });
}

describe("la station, son process", () => {

  // Un projet ajouté à la configuration, puis retiré, sans redémarrer : `station.test.ts` (« un projet ajouté
  // s'ouvre, un projet retiré s'arrête… », et « un projet qu'un autre runtime tient encore est repris… »).
  test("une ligne refusée n'arrête pas la station : elle le dit au nom du projet, et sert les autres", { skip: posixOnly("gives the station a configuration with two refused lines and expects it to name them and serve the valid project, then stops it with SIGTERM expecting exit 0; on Windows SIGTERM kills the station before its handler runs, so the exit code is null") }, async (t) => {
    const { env, preparer, configurer, faits } = uneStation(t);
    const brigade = fauxGh(t);
    brigade.issues([]);
    preparer("brigade");
    // Sans clone et sans décisions : ce projet ne peut pas être servi.
    configurer(`brigade acme/brigade ${BASE} BRIGADE_GH_BIN=${brigade.bin}\nespace acme/espace main\nseul\n`);
    const station = lancer(t, STATION, [], env);
    await station.attendre("station démarrée");

    assert.match(station.sortie(), /1 projet servi : brigade/);
    assert.match(station.sortie(), /brigade \[espace\] : refusé par la station, les autres projets restent servis — /);
    assert.match(station.sortie(), /brigade : station — ligne 3 de la configuration \(« seul »\)/);
    assert.equal(faits("brigade", "runtime.started").length, 1);
    assert.deepEqual(faits("espace", "runtime.started"), []);
    station.process.kill("SIGTERM");
    assert.equal(await station.fin, 0);
  });

  // Sous ses portes, chaque projet sort par la sienne : station/cuisine-portes.test.ts, les vraies portes, la vraie
  // station et ses cuisines dans le process du test ; son process derrière sa porte, tel que son unité le lance :
  // paquet/paquet.test.ts.

  test("chaque projet servi publie son Kitchen board dans son dépôt : un geste posté sous celui d'un projet est joué par sa cuisine, le chef y est mentionné pour ce qui l'attend, et `status` compte le coût des tableaux (#1662)", { skip: posixOnly("two kitchens create and pin their Kitchen board through the fake gh and a gesture under brigade's board is played by its kitchen alone, then the station is stopped with SIGTERM expecting exit 0; on Windows SIGTERM kills the station before its handler runs, so the exit code is null") }, async (t) => {
    const { racine, env, etat, preparer, configurer, faits } = uneStation(t);
    const projets = [
      { nom: "brigade", depot: "acme/brigade", tableau: 90, gestes: ["/brigade stop"] },
      { nom: "espace", depot: "acme/espace", tableau: 7, gestes: [] },
    ].map((projet) => {
      const gh = fauxGh(t);
      const { depot, tableau } = projet;
      issuesDe(gh, depot, []);
      // Aucun tableau dans le dépôt : la cuisine le crée, puis l'épingle.
      gh.repondre(`repos/${depot}/issues?labels=kitchen-board&state=all&per_page=100`, { corps: [] });
      gh.repondre(`repos/${depot}/issues`, { statut: 201, corps: { number: tableau } });
      gh.repondre(`repos/${depot}/issues/${tableau}`, { corps: { number: tableau, title: "Kitchen board", body: "", state: "open", labels: [{ name: "kitchen-board" }, { name: "hors-cuisine" }], repository_url: `https://api.github.com/repos/${depot}` } });
      gh.repondre("graphql", { corps: { data: { repository: { issue: { id: `I_${tableau}`, isPinned: false } }, pinIssue: { issue: { isPinned: true } } } } });
      // Les gestes du chef sous le tableau, et ce que la box y répond.
      gh.repondre(`repos/${depot}/issues/${tableau}/comments?per_page=100`, {
        corps: projet.gestes.map((body, rang) => ({ id: 500 + rang, body, user: { login: "chef" }, created_at: "2026-10-26T08:00:00Z", html_url: `https://github.com/${depot}/issues/${tableau}#issuecomment-${500 + rang}` })),
      });
      gh.repondre(`repos/${depot}/issues/${tableau}/comments?per_page=100&since=*`, { corps: [] });
      gh.repondre(`repos/${depot}/issues/${tableau}/comments`, { statut: 201, corps: { id: 1 } });
      gh.repondre("user", { corps: { login: "chef" } });
      preparer(projet.nom);
      return { ...projet, gh };
    });
    // Une issue de brigade que le manager a écartée : elle attend le chef.
    const journal = ouvrirJournal(etat("brigade"));
    journal.ajouter({ project: "brigade", ticket: 21, author: "manager", type: "manager.set-aside", payload: { reason: "question", fired: true } });
    journal.fermer();
    configurer(projets.map((p) => `${p.nom} ${p.depot} ${BASE} BRIGADE_GH_BIN=${p.gh.bin}\n`).join(""));
    const station = lancer(t, STATION, [], env);

    // Chaque cuisine crée le sien, dans son dépôt, par son `gh` — jamais dans celui d'un autre.
    for (const p of projets) {
      await jusqua(() => p.gh.appels().some((appel) => appel.includes("POST") && appel.at(-1) === `repos/${p.depot}/issues`));
      await station.attendre(`brigade [${p.nom}] : Kitchen board créé dans ${p.depot} — #${p.tableau}`);
      const autre = projets.find((q) => q !== p)?.depot ?? "";
      assert.ok(p.gh.appels().every((appel) => !appel.join(" ").includes(autre)), p.nom);
    }
    // Le geste posté sous le tableau de brigade est joué par la cuisine de brigade, et elle seule.
    await jusqua(() => faits("brigade", "board.replied").length === 1);
    assert.deepEqual(
      faits("brigade", "board.gesture").map(({ payload }) => [payload.board, payload.gesture, payload.done]),
      [[90, "stop", true]],
    );
    assert.equal(faits("brigade", "kitchen.stopped").length, 1);
    assert.deepEqual([faits("espace", "board.gesture"), faits("espace", "kitchen.stopped")], [[], []]);
    // Le chef est mentionné sous le tableau de brigade pour la décision qui l'y attend — et sous aucun autre.
    await jusqua(() => faits("brigade", "board.mention").length === 1);
    assert.deepEqual(faits("brigade", "board.mention").map(({ payload }) => [payload.board, payload.decision]), [[90, "#21"]]);
    assert.deepEqual(faits("espace", "board.mention"), []);
    const commentes = (p: (typeof projets)[number]) => p.gh.appels().filter((appel) => appel.includes("POST") && appel.at(-1)?.endsWith("/comments"));
    assert.deepEqual(projets.map((p) => commentes(p).map((appel) => appel.at(-1))), [["repos/acme/brigade/issues/90/comments", "repos/acme/brigade/issues/90/comments"], []]);

    // Les appels des tableaux, comptés au compteur de la station : `status` les dit.
    const commande = appeler(status, [], { BRIGADE_STATE_DIR: etat("brigade"), BRIGADE_STATION_DIR: racine });
    assert.equal(await commande.fin, 0, commande.sortie());
    const cout = /board cost\s+(\d+) calls? per hour, all projects/.exec(commande.sortie());
    assert.ok(cout !== null && Number(cout[1]) > 0, commande.sortie());

    station.process.kill("SIGTERM");
    assert.equal(await station.fin, 0);
  });

  test("BRIGADE_PROXY_PORT et BRIGADE_STATION_PORTES ensemble : la station refuse de démarrer — sous ses portes, la sienne est celle qu'elles ouvrent", async (t) => {
    const { racine, env } = uneStation(t);
    const refusee = lancer(t, STATION, [], { ...env, BRIGADE_STATION_PORTES: join(racine, "portes.json"), BRIGADE_PROXY_PORT: "3128" });
    assert.equal(await refusee.fin, REFUS);
    assert.match(refusee.sortie(), /BRIGADE_PROXY_PORT et BRIGADE_STATION_PORTES sont définis ensemble/);
  });

  test("un écart du gist ou un tick qui n'est pas un nombre entier de secondes : la station refuse de démarrer et nomme la variable (#1658)", async (t) => {
    const { env } = uneStation(t);
    for (const [variable, valeur] of [["BRIGADE_STATION_ECART_S", "0.5"], ["BRIGADE_STATION_TICK_S", "0"]] as const) {
      const refusee = lancer(t, STATION, [], { ...env, [variable]: valeur });
      assert.equal(await refusee.fin, REFUS);
      assert.match(refusee.sortie(), new RegExp(`refus de démarrer la station — ${variable}=${valeur.replace(".", "\\.")} — attendu un nombre entier de secondes`));
    }
  });

  test("sans BRIGADE_STATION_DIR, la station refuse de démarrer et nomme la variable ; sans configuration, elle démarre et ne sert aucun projet", { skip: posixOnly("expects the station refused without BRIGADE_STATION_DIR, then started without configuration and serving nothing, and stopped with SIGTERM expecting exit 0; on Windows SIGTERM kills the station before its handler runs, so the exit code is null") }, async (t) => {
    const { env } = uneStation(t);
    const { BRIGADE_STATION_DIR: _, ...sans } = env;
    const refusee = lancer(t, STATION, [], sans);
    assert.equal(await refusee.fin, REFUS);
    assert.match(refusee.sortie(), /refus de démarrer la station — BRIGADE_STATION_DIR n'est pas défini/);

    const vide = lancer(t, STATION, [], env);
    await vide.attendre("station démarrée");
    assert.match(vide.sortie(), /aucun projet servi/);
    vide.process.kill("SIGTERM");
    assert.equal(await vide.fin, 0);
  });

  describe("de bout en bout", () => {
    test("deux projets cuisinés par le même process : chacun voit son issue devenir une branche poussée sur son origine, une PR et un commentaire", { skip: posixOnly("has one station process cook an issue in each of two projects, through the fake claude (Git Bash), to a pushed branch, a PR and a comment, then stops it with SIGTERM expecting exit 0; on Windows SIGTERM kills the station before its handler runs, and the comments did not even come within the test's one-minute wait") }, async (t) => {
      const { env, preparer, configurer, faits } = uneStation(t);
      const projets = [
        { nom: "brigade", depot: "acme/brigade", numero: 15 },
        { nom: "espace", depot: "acme/espace", numero: 7 },
      ].map((projet) => {
        const { origine, clone } = depotGit(t);
        const gh = fauxGh(t);
        issuesDe(gh, projet.depot, [{ ...issueGitHub(projet.numero, { labels: ["fire", "model:sonnet", "effort:low"] }), html_url: `https://github.com/${projet.depot}/issues/${projet.numero}` }]);
        gh.repondre(`repos/${projet.depot}/pulls`, { statut: 201, corps: { html_url: `https://github.com/${projet.depot}/pull/40` } });
        gh.repondre(`repos/${projet.depot}/issues/${projet.numero}/comments`, { statut: 201, corps: { id: 1 } });
        preparer(projet.nom, { clone: false });
        return { ...projet, origine, clone, gh };
      });
      configurer(projets.map((p) => `${p.nom} ${p.depot} ${BASE} BRIGADE_GH_BIN=${p.gh.bin} BRIGADE_REPO_DIR=${p.clone}\n`).join(""));
      const station = lancer(t, STATION, [], { ...env, FAUX_CLAUDE: "livre" });

      for (const p of projets) await jusqua(() => p.gh.appels().some((appel) => appel.at(-1) === `repos/${p.depot}/issues/${p.numero}/comments`));

      for (const p of projets) {
        assert.equal(faits(p.nom, "runtime.started")[0]?.payload.pid, station.process.pid);
        const [lancement] = faits(p.nom, "cook.launched");
        assert.deepEqual([lancement?.ticket, lancement?.payload.model, lancement?.payload.effort], [p.numero, "sonnet", "low"]);
        assert.equal(git(p.origine, "show", `cook/${String(lancement?.payload.run)}:travail.txt`), "le travail du cook");
        const pr = p.gh.appels().find((appel) => appel.at(-1) === `repos/${p.depot}/pulls`) ?? [];
        assert.equal(pr.includes(`head=cook/${String(lancement?.payload.run)}`) && pr.includes(`base=${BASE}`), true);
      }
      station.process.kill("SIGTERM");
      assert.equal(await station.fin, 0);
    });

  });

});

test("main.test.ts de la station ne laisse rien dans le répertoire temporaire", rienNeReste);
