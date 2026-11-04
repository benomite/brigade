// La station telle que la machine la lance : un seul vrai process, qui sert
// tous les projets de sa configuration, piloté par cette configuration et par
// des signaux. Chaque démarrage d'un vrai process coûte près d'une seconde :
// seul ce que le point d'entrée câble lui-même se joue sur un vrai process. Ce
// que la station fait de sa configuration et de ses projets se joue ici sur la
// station qu'il ouvre (`ouvrirStation`), dans le process du test, et sans
// cuisine dans station.test.ts et portes.test.ts ; les cuisines complètes — un
// cook jusqu'à sa PR, sous une identité par rôle, repris par la vie suivante —
// sur la cuisine du test (../station.test.ts, ../identites.test.ts, ../reprise.test.ts).
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { appendFileSync, existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, test, type TestContext } from "node:test";
import { lireLesStationsDuCompte } from "../../src/enregistrement-station/stations-du-compte.ts";
import { ouvrirJournal } from "../../src/journal.ts";
import { REPERTOIRE_COMPTEUR } from "../../src/limite-github.ts";
import { REPERTOIRE_DES_TAILLES } from "../../src/tableau/rendu/taille.ts";
import { accepterSansBacASable } from "../../src/onboarding/attente.ts";
import { ouvrirCuisine, type Cuisine } from "../../src/station/cuisine.ts";
import { ecrirePortes } from "../../src/station/portes.ts";
import { ouvrirStation } from "../../src/station/station.ts";
import { principal as status } from "../../src/status.ts";
import { relecteur } from "../aides/opt-B-journal.ts";
import { aArreter, appeler, BASE, ENV_ENFANT, ENV_GIT, FAUX_BWRAP, FAUX_CLAUDE, fauxGh, type FauxGh, git, issueGitHub, jusqua, lancer, repertoireTemporaire, temporaireDuFichier } from "../outils.ts";
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

// La station que `main.ts` ouvre, ouverte dans le process du test sur le même
// environnement, ses cuisines réelles : ce qu'elle dit, et de quoi l'arrêter
// comme son process l'arrête sur SIGTERM.
function stationOuverte(t: TestContext, racine: string, env: Record<string, string>, portes: string | null = null) {
  const dits: string[] = [];
  const cuisines: Cuisine[] = [];
  const station = ouvrirStation({
    racine,
    env: { ...ENV_ENFANT, ...env },
    dire: (ligne) => void dits.push(ligne),
    ouvrir: (envDuProjet, options) => {
      const cuisine = ouvrirCuisine(envDuProjet, options);
      cuisines.push(cuisine);
      return cuisine;
    },
    portes,
  });
  aArreter(t, async () => {
    station.arreter("SIGTERM");
    for (const cuisine of cuisines) await cuisine.arretee?.();
  });
  return { dits, station };
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

// Ce que la machine porte, hors de l'état des projets et de la configuration :
// chaque fichier, et ce qu'il contient.
function photographier(racine: string, sauf: string[]): Record<string, string> {
  const photo: Record<string, string> = {};
  const parcourir = (repertoire: string) => {
    for (const entree of readdirSync(repertoire, { withFileTypes: true })) {
      const chemin = join(repertoire, entree.name);
      if (sauf.includes(chemin)) continue;
      if (entree.isDirectory()) {
        photo[`${relative(racine, chemin)}/`] = "";
        parcourir(chemin);
      } else photo[relative(racine, chemin)] = `${statSync(chemin).mtimeMs} ${createHash("sha256").update(readFileSync(chemin)).digest("hex")}`;
    }
  };
  parcourir(racine);
  return photo;
}

// Ce que la station fait de sa configuration et de ses projets, sur la station que le process ouvre, ouverte dans
// celui du test : une seule à la fois — chaque cuisine qui s'ouvre tient le process du test, et ferait attendre
// les autres tests.
describe("la station ouverte dans le process du test", { concurrency: 1 }, () => {
  test("deux projets dans la configuration : une seule station les sert, chacun avec son journal, sa cloison, sa porte et son `gh` — jamais ceux d'un autre ; une ligne refusée ne l'arrête pas : elle le dit au nom du projet, et sert les autres", { skip: posixOnly("serves two projects through the fake gh (a bash script) and expects each one's sandbox path as a POSIX path") }, async (t) => {
    const { racine, compte, env, preparer, configurer, relire, faits } = uneStation(t);
    const brigade = fauxGh(t);
    brigade.issues([]);
    const espace = fauxGh(t);
    issuesDe(espace, "acme/espace", []);
    preparer("brigade");
    preparer("espace");
    configurer(
      [
        "# projet  dépôt             branche  réglages",
        `brigade   acme/brigade  ${BASE}  BRIGADE_GH_BIN=${brigade.bin}`,
        `espace    acme/espace   main     BRIGADE_GH_BIN=${espace.bin} BRIGADE_SANDBOX_BIN=${FAUX_BWRAP} BRIGADE_SANDBOX_HIDDEN=${racine}`,
        // Sans clone et sans décisions : ce projet ne peut pas être servi.
        "tiers     acme/tiers    main",
        "seul",
        "",
      ].join("\n"),
    );
    // Le fichier des ports, tel que les portes l'écrivent (le process qui l'écrit : portes.test.ts).
    const fichierDesPortes = join(racine, "portes.json");
    const ports = { station: 41000, projets: { brigade: 41001, espace: 41002 } };
    ecrirePortes(fichierDesPortes, ports);
    const { dits } = stationOuverte(t, racine, env, fichierDesPortes);
    const dit = () => dits.join("\n");

    // Chaque projet a démarré dans le même process, chacun dans son journal.
    for (const projet of ["brigade", "espace"]) {
      const demarrage = relire(projet).find((e) => e.type === "runtime.started");
      assert.deepEqual([demarrage?.project, (demarrage?.payload as { pid: number }).pid], [projet, process.pid]);
      assert.match(dit(), new RegExp(`brigade \\[${projet}\\] : servi par la station — acme/${projet}, branche ${projet === "brigade" ? BASE : "main"}, état dans ${join(racine, "etat", projet)}`));
    }
    // Les lignes refusées, chacune dite, au nom du projet quand elle en nomme un.
    assert.match(dit(), /brigade \[tiers\] : refusé par la station, les autres projets restent servis — /);
    assert.match(dit(), /brigade : station — ligne 5 de la configuration \(« seul »\)/);
    assert.deepEqual(faits("tiers", "runtime.started"), []);
    // Chacun sa cloison et sa porte — la sienne, jamais celle d'un autre —, dites à son nom.
    for (const projet of ["brigade", "espace"]) await jusqua(() => relire(projet).some((e) => e.type === "isolation.configured"));
    const cloison = (projet: string) => relire(projet).find((e) => e.type === "isolation.configured")?.payload as { sandbox: unknown; proxy: { port: number } };
    assert.deepEqual([cloison("brigade").sandbox, cloison("brigade").proxy.port], [null, ports.projets.brigade]);
    assert.deepEqual(cloison("espace").sandbox, { bin: FAUX_BWRAP, hidden: [racine], credentials: join(compte, ".claude/.credentials.json") });
    assert.equal(cloison("espace").proxy.port, ports.projets.espace);
    await jusqua(() => /brigade \[espace\] : cloison — /.test(dit()));
    assert.match(dit(), /brigade \[brigade\] : cloison — none/);
    assert.match(dit(), new RegExp(`brigade \\[espace\\] : cloison — every launch .* runs in \`${FAUX_BWRAP}\``));
    // Chacun sonde son dépôt par son `gh`.
    await jusqua(() => brigade.appels().length > 0 && espace.appels().length > 0);
    assert.ok(brigade.appels().every((appel) => !appel.join(" ").includes("acme/espace")));
    assert.ok(espace.appels().every((appel) => !appel.join(" ").includes("acme/brigade")));
  });

  // Qu'elle relise sa configuration sur SIGHUP : « le process de la station… », plus bas.
  test("un projet ajouté à la configuration est servi, sans redémarrer ; retiré, il ne l'est plus ; et rien d'autre que la configuration n'a été écrit pour cela", { skip: posixOnly("adds then withdraws a project by editing the station's configuration and checks nothing else on the machine was written; the fake gh is a bash script") }, async (t) => {
    const { machine, racine, env, preparer, configurer, relire, faits } = uneStation(t);
    const brigade = fauxGh(t);
    brigade.issues([]);
    const espace = fauxGh(t);
    issuesDe(espace, "acme/espace", []);
    preparer("brigade");
    preparer("espace");
    const ligneBrigade = `brigade acme/brigade ${BASE} BRIGADE_GH_BIN=${brigade.bin}\n`;
    configurer(ligneBrigade);
    const { station } = stationOuverte(t, racine, env);
    assert.deepEqual(station.projets(), ["brigade"]);
    assert.deepEqual(faits("espace", "runtime.started"), []);

    // Tout ce que la machine porte, sauf l'état des projets, la configuration
    // elle-même, ce que la station dit de ce qu'elle sert (`en-service`, que
    // sa mise à jour attend) et le compteur de ses appels à GitHub, que chaque
    // sondage écrit, et la taille du board de chaque projet, que chaque
    // rafraîchissement écrit.
    const sauf = [join(racine, "etat"), join(racine, "projets"), join(racine, "en-service"), join(racine, REPERTOIRE_COMPTEUR), join(racine, REPERTOIRE_DES_TAILLES)];
    const avant = photographier(machine, sauf);

    // Ajouter : une ligne de plus, rien d'autre. La station la relit — toutes les deux secondes, ou sur SIGHUP dans
    // son process : ici, le test la lui fait relire.
    appendFileSync(join(racine, "projets"), `espace acme/espace main BRIGADE_GH_BIN=${espace.bin}\n`);
    station.relire();
    await jusqua(() => faits("espace", "runtime.started").length === 1);
    assert.equal(faits("espace", "runtime.started")[0]?.payload.pid, process.pid);
    await jusqua(() => espace.appels().length > 0);

    // Retirer : la ligne s'en va ; le projet s'arrête, la station et l'autre projet restent.
    configurer(ligneBrigade);
    station.relire();
    await jusqua(() => faits("espace", "runtime.stopped").length === 1);
    assert.deepEqual(faits("espace", "runtime.stopped")[0]?.payload, { signal: "removed" });
    assert.deepEqual(station.projets(), ["brigade"]);
    assert.deepEqual(faits("brigade", "runtime.stopped"), []);
    const sondes = espace.appels().length;

    // Rajouté, il repart de son journal : son verrou a été rendu, rien n'est interrompu.
    appendFileSync(join(racine, "projets"), `espace acme/espace main BRIGADE_GH_BIN=${espace.bin}\n`);
    station.relire();
    await jusqua(() => faits("espace", "runtime.started").length === 2);
    assert.deepEqual(faits("espace", "runtime.interrupted"), []);
    await jusqua(() => espace.appels().length > sondes);
    configurer(ligneBrigade);
    station.relire();
    await jusqua(() => faits("espace", "runtime.stopped").length === 2);

    // Ni unité, ni drop-in, ni compte, ni clone : rien hors de l'état des projets n'a bougé.
    assert.deepEqual(photographier(machine, sauf), avant);
    // Et dans l'état, seul celui du projet ajouté puis retiré a été écrit — par la station elle-même.
    assert.deepEqual(readdirSync(join(racine, "etat")).sort(), ["brigade", "espace"]);
    assert.equal(relire("espace").every((e) => e.project === "espace"), true);
  });

  // Que les appels à GitHub aillent au compteur de la station, que `status` lit : « le process de la station… », plus bas.
  test("chaque projet servi publie son Kitchen board dans son dépôt : un geste posté sous celui d'un projet est joué par sa cuisine, et le chef y est mentionné pour ce qui l'attend", { skip: posixOnly("two kitchens create and pin their Kitchen board through the fake gh (a bash script) and a gesture under brigade's board is played by its kitchen alone") }, async (t) => {
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
    const station = stationOuverte(t, racine, env);

    // Chaque cuisine crée le sien, dans son dépôt, par son `gh` — jamais dans celui d'un autre.
    for (const p of projets) {
      await jusqua(() => p.gh.appels().some((appel) => appel.includes("POST") && appel.at(-1) === `repos/${p.depot}/issues`));
      await jusqua(() => station.dits.includes(`brigade [${p.nom}] : Kitchen board créé dans ${p.depot} — #${p.tableau}`));
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
  });

});

// Chaque test a sa station — racine, configuration, doublures — sur le port 0 : ils se jouent de front.
describe("la station, son process", { concurrency: 3 }, () => {
  test("le process de la station : sous ses portes, il sert sa configuration, et sa sortie est le seul journal de service — ce qu'un projet y écrit de lui-même porte son nom ; ses appels à GitHub vont au compteur de la station, que `status` lit (#1662) ; SIGTERM l'arrête, et arrête ses projets", { skip: posixOnly("starts the station process under its doors' ports file and checks its single output, then stops it with SIGTERM; the expected startup line is a RegExp built from a Windows path, whose backslashes it reads as escapes, and SIGTERM kills the station before its handler runs, so neither exit code 0 nor the SIGTERM stop facts can come") }, async (t) => {
    const { racine, env, preparer, configurer, relire, faits } = uneStation(t);
    // Le `gh` d'espace ne répond rien : son sondage échoue, et la ligne qui le dit porte son nom.
    const espace = fauxGh(t);
    preparer("espace");
    configurer(`espace acme/espace main BRIGADE_GH_BIN=${espace.bin}\n`);
    // Le fichier des ports, tel que les portes l'écrivent : la station n'attend pas la sienne. Le process des portes
    // qui l'écrit : portes.test.ts (« le process des portes, tel que son unité le lance… ») ; la station et ses portes
    // lancées ensemble par leurs unités : paquet/paquet.test.ts ; qu'elle attende sa porte, et le dise : portes.test.ts.
    const fichierDesPortes = join(racine, "portes.json");
    ecrirePortes(fichierDesPortes, { station: 41000, projets: { espace: 41002 } });
    const station = lancer(t, STATION, [], { ...env, BRIGADE_STATION_PORTES: fichierDesPortes });
    await station.attendre("station démarrée");
    const pid = station.process.pid;

    assert.match(station.sortie(), new RegExp(`station démarrée — pid ${pid}, configuration ${join(racine, "projets")} ; 1 projet servi : espace`));
    assert.equal(faits("espace", "runtime.started")[0]?.payload.pid, pid);
    // Sa porte est celle que les portes lui ont ouverte.
    await jusqua(() => faits("espace", "isolation.configured").length > 0);
    assert.equal((faits("espace", "isolation.configured")[0]?.payload.proxy as { port: number }).port, 41002);
    await station.attendre("brigade [espace] : sondage GitHub en échec");
    assert.doesNotMatch(station.sortie(), /^brigade : sondage/m);
    // Ses appels à GitHub, comptés au compteur de la station : `status` le lit, et compte celui des tableaux
    // (le compte exact : tableau/budget/cout.test.ts).
    const commande = appeler(status, [], { BRIGADE_STATE_DIR: join(racine, "etat", "espace"), BRIGADE_STATION_DIR: racine });
    assert.equal(await commande.fin, 0, commande.sortie());
    assert.match(commande.sortie(), /board cost\s+\d+ calls? per hour, all projects/);

    station.process.kill("SIGTERM");
    assert.equal(await station.fin, 0);
    assert.deepEqual(relire("espace").at(-1)?.payload, { signal: "SIGTERM" });
    assert.match(station.sortie(), /station arrêtée \(SIGTERM\)/);
  });

  test("le process de la station relit sa configuration sur SIGHUP, sans attendre sa minuterie ; arrêté par SIGTERM, il l'écrit sur son enregistrement", { skip: posixOnly("rereads the station's configuration on SIGHUP, then stops it with SIGTERM expecting exit 0; on Windows SIGTERM kills the station before its handler runs, so the exit code is null") }, async (t) => {
    const { gists, env } = uneStation(t);
    const station = lancer(t, STATION, [], env);
    await station.attendre("station démarrée");
    // Une ligne ajoutée — un projet que rien n'a préparé, refusé sans qu'aucune cuisine ne s'ouvre : relue sur
    // SIGHUP, elle est dite. Ajouter, retirer, rajouter un projet servi, et rien d'autre d'écrit : « un projet ajouté
    // à la configuration est servi… », plus haut, sans process.
    appendFileSync(join(env.BRIGADE_STATION_DIR, "projets"), "tiers acme/tiers main\n");
    station.process.kill("SIGHUP");
    await station.attendre("brigade [tiers] : refusé par la station, les autres projets restent servis — ");

    // Enregistrée sous le compte GitHub, puis arrêtée proprement : elle l'écrit sur son enregistrement, et l'app
    // connectée au même compte la lit indisponible (enregistrement-station/, dont `enregistrer.test.ts` éprouve
    // chaque écriture).
    await station.attendre("station enregistrée sous le compte GitHub");
    station.process.kill("SIGTERM");
    assert.equal(await station.fin, 0);
    assert.match(station.sortie(), /station arrêtée \(SIGTERM\)/);
    const lu = await lireLesStationsDuCompte({ gh: FAUX_GH_GISTS, env: { ...process.env, FAUX_GISTS: gists } });
    assert.equal(lu.state, "listed", JSON.stringify(lu));
    const [arretee, ...autres] = lu.state === "listed" ? lu.stations : [];
    assert.deepEqual(autres, []);
    assert.equal(arretee?.name, "box");
    assert.equal(arretee?.available, false);
    assert.ok(arretee?.stoppedAt);
  });

  test("BRIGADE_PROXY_PORT et BRIGADE_STATION_PORTES ensemble : la station refuse de démarrer — sous ses portes, la sienne est celle qu'elles ouvrent", async (t) => {
    const { racine, env } = uneStation(t);
    const refusee = lancer(t, STATION, [], { ...env, BRIGADE_STATION_PORTES: join(racine, "portes.json"), BRIGADE_PROXY_PORT: "3128" });
    assert.equal(await refusee.fin, REFUS);
    assert.match(refusee.sortie(), /BRIGADE_PROXY_PORT et BRIGADE_STATION_PORTES sont définis ensemble/);
  });

  test("un écart du gist ou un tick qui n'est pas un nombre entier de secondes : la station refuse de démarrer et nomme la variable (#1658)", async (t) => {
    const { env } = uneStation(t);
    // Les deux refus se jouent de front : leurs démarrages se recouvrent.
    const essais = (
      [
        ["BRIGADE_STATION_ECART_S", "0.5"],
        ["BRIGADE_STATION_TICK_S", "0"],
      ] as const
    ).map(([variable, valeur]) => ({ variable, valeur, refusee: lancer(t, STATION, [], { ...env, [variable]: valeur }) }));
    for (const { variable, valeur, refusee } of essais) {
      assert.equal(await refusee.fin, REFUS);
      assert.match(refusee.sortie(), new RegExp(`refus de démarrer la station — ${variable}=${valeur.replace(".", "\\.")} — attendu un nombre entier de secondes`));
    }
  });

  // Sans configuration, elle démarre et ne sert aucun projet : paquet/paquet.test.ts, sur le runtime du paquet.
  test("sans BRIGADE_STATION_DIR, la station refuse de démarrer et nomme la variable", async (t) => {
    const { env } = uneStation(t);
    const { BRIGADE_STATION_DIR: _, ...sans } = env;
    const refusee = lancer(t, STATION, [], sans);
    assert.equal(await refusee.fin, REFUS);
    assert.match(refusee.sortie(), /refus de démarrer la station — BRIGADE_STATION_DIR n'est pas défini/);
  });
});

test("main.test.ts de la station ne laisse rien dans le répertoire temporaire", rienNeReste);
