// La station telle que la machine la lance : un seul vrai process, qui sert
// tous les projets de sa configuration, piloté par cette configuration et par
// des signaux.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { appendFileSync, existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { join, relative } from "node:path";
import { after, describe, test, type TestContext } from "node:test";
import { ouvrirJournal } from "../../src/journal.ts";
import { REPERTOIRE_COMPTEUR } from "../../src/limite-github.ts";
import { accepterSansBacASable } from "../../src/onboarding/attente.ts";
import { lirePortes } from "../../src/station/portes.ts";
import { casEnProcess } from "../aides/cas-en-process.ts";
import { relecteur } from "../aides/opt-B-journal.ts";
import { aArreter, BASE, ENV_ENFANT, ENV_GIT, FAUX_BWRAP, FAUX_CLAUDE, fauxGh, type FauxGh, git, issueGitHub, jusqua, lancer, repertoireTemporaire, temporaireDuFichier, vivant } from "../outils.ts";
import { FAUX_GH_GISTS } from "../appairage/doublure-des-gists.ts";
import { posixOnly } from "../support/plateforme.ts";

const rienNeReste = temporaireDuFichier();

const STATION = join(import.meta.dirname, "../../src/station/main.ts");
const PORTES = join(import.meta.dirname, "../../src/station/tenir-portes.ts");
// Le `gh` de la station quand ce qu'elle publie d'elle n'est pas le sujet : hors ligne, en shell — la doublure
// des gists lance un Node à chaque écriture, cinq par station (#2464).
const GH_HORS_LIGNE = join(import.meta.dirname, "../aides/gh-hors-ligne.sh");
const REFUS = 2;

// Les refus de démarrer de la station se jouent dans un seul process d'essai,
// l'un après l'autre : un Node par refus coûtait les modules de la station à
// chaque fois. Ils viennent tous avant qu'elle ne touche à rien.
const refus = casEnProcess(ENV_ENFANT);
const refuser = (env: Record<string, string>) => refus.jouer({ module: STATION, env });

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
// machine porte hors de la station. `gists` : ce qu'elle publie d'elle sur
// GitHub y arrive ; sans lui, son `gh` est hors ligne.
function uneStation(t: TestContext, options: { gists?: boolean } = {}) {
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
    BRIGADE_GH_BIN: options.gists ? FAUX_GH_GISTS : GH_HORS_LIGNE,
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
  return { machine, racine, compte, env, etat, preparer, configurer, relire, faits };
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

// Les refus se jouent avant les stations, et seuls : partis avec elles, ils attendaient que cinq stations aient
// chargé leurs modules, au-delà de 2 s sur un runner de la CI (#2464).
describe("la station refuse de démarrer", () => {
  test("BRIGADE_PROXY_PORT et BRIGADE_STATION_PORTES ensemble : la station refuse de démarrer — sous ses portes, la sienne est celle qu'elles ouvrent", async (t) => {
    const { racine, env } = uneStation(t);
    const refusee = await refuser({ ...env, BRIGADE_STATION_PORTES: join(racine, "portes.json"), BRIGADE_PROXY_PORT: "3128" });
    assert.equal(refusee.code, REFUS);
    assert.match(refusee.sortie, /BRIGADE_PROXY_PORT et BRIGADE_STATION_PORTES sont définis ensemble/);
  });

  test("un écart du gist ou un tick qui n'est pas un nombre entier de secondes : la station refuse de démarrer et nomme la variable (#1658)", async (t) => {
    const { env } = uneStation(t);
    for (const [variable, valeur] of [["BRIGADE_STATION_ECART_S", "0.5"], ["BRIGADE_STATION_TICK_S", "0"]] as const) {
      const refusee = await refuser({ ...env, [variable]: valeur });
      assert.equal(refusee.code, REFUS);
      assert.match(refusee.sortie, new RegExp(`refus de démarrer la station — ${variable}=${valeur.replace(".", "\\.")} — attendu un nombre entier de secondes`));
    }
  });
});

// Chaque test a sa station — racine, configuration, doublures — sur le port 0 : ils se jouent de front.
describe("la station, son process", { concurrency: 8 }, () => {
  after(() => refus.fermer());

  test("deux projets dans la configuration : un seul process les sert, chacun avec son journal, sa cloison et son `gh`, et sa sortie est le seul journal de service", { skip: posixOnly("serves two projects from one station process and checks each one's log, sandbox and gh in its single output, then stops it with SIGTERM; the expected startup line is a RegExp built from a Windows path, whose backslashes it reads as escapes, and SIGTERM kills the station before its handler runs, so neither exit code 0 nor the SIGTERM stop facts can come") }, async (t) => {
    const { racine, compte, env, preparer, configurer, relire } = uneStation(t);
    const brigade = fauxGh(t);
    brigade.issues([]);
    // Le `gh` d'espace ne répond rien : son sondage échoue, et la ligne qui le dit porte son nom.
    const espace = fauxGh(t);
    preparer("brigade");
    preparer("espace");
    configurer(
      [
        "# projet  dépôt             branche  réglages",
        `brigade   acme/brigade  ${BASE}  BRIGADE_GH_BIN=${brigade.bin}`,
        `espace    acme/espace   main     BRIGADE_GH_BIN=${espace.bin} BRIGADE_SANDBOX_BIN=${FAUX_BWRAP} BRIGADE_SANDBOX_HIDDEN=${racine} BRIGADE_PROXY_PORT=3128`,
        "",
      ].join("\n"),
    );

    const station = lancer(t, STATION, [], env);
    await station.attendre("station démarrée");
    const pid = station.process.pid;

    assert.match(station.sortie(), new RegExp(`station démarrée — pid ${pid}, configuration ${join(racine, "projets")} ; 2 projets servis : brigade, espace`));
    // Chaque projet a démarré dans ce process-là, chacun dans son journal.
    for (const projet of ["brigade", "espace"]) {
      const demarrage = relire(projet).find((e) => e.type === "runtime.started");
      assert.deepEqual([demarrage?.project, (demarrage?.payload as { pid: number }).pid], [projet, pid]);
      assert.match(station.sortie(), new RegExp(`brigade \\[${projet}\\] : servi par la station — acme/${projet}, branche ${projet === "brigade" ? BASE : "main"}, état dans ${join(racine, "etat", projet)}`));
    }
    // Chacun sa cloison et sa porte, dites à son nom dans la même sortie.
    assert.deepEqual(relire("brigade").find((e) => e.type === "isolation.configured")?.payload, { sandbox: null, proxy: null });
    await jusqua(() => relire("espace").some((e) => e.type === "isolation.configured"));
    const espaceCloison = relire("espace").find((e) => e.type === "isolation.configured")?.payload as { sandbox: unknown; proxy: { port: number } };
    assert.deepEqual(espaceCloison.sandbox, { bin: FAUX_BWRAP, hidden: [racine], credentials: join(compte, ".claude/.credentials.json") });
    assert.equal(espaceCloison.proxy.port, 3128);
    await station.attendre("brigade [espace] : réseau — ");
    assert.match(station.sortie(), /brigade \[brigade\] : cloison — none/);
    assert.match(station.sortie(), new RegExp(`brigade \\[espace\\] : cloison — every launch .* runs in \`${FAUX_BWRAP}\``));
    // Chacun sonde son dépôt par son `gh`.
    await jusqua(() => brigade.appels().length > 0 && espace.appels().length > 0);
    assert.ok(brigade.appels().every((appel) => !appel.join(" ").includes("acme/espace")));
    assert.ok(espace.appels().every((appel) => !appel.join(" ").includes("acme/brigade")));
    assert.doesNotMatch(station.sortie(), /^brigade : sondage/m);

    station.process.kill("SIGTERM");
    assert.equal(await station.fin, 0);
    for (const projet of ["brigade", "espace"]) assert.deepEqual(relire(projet).at(-1)?.payload, { signal: "SIGTERM" }, projet);
    assert.match(station.sortie(), /station arrêtée \(SIGTERM\)/);
  });

  test("un projet ajouté à la configuration est servi, sans redémarrer ; retiré, il ne l'est plus ; et rien d'autre que la configuration n'a été écrit pour cela", { skip: posixOnly("adds then withdraws a project by editing the station's configuration and checks nothing else on the machine was written, then stops the station with SIGTERM expecting exit 0; on Windows SIGTERM kills the station before its handler runs, so the exit code is null") }, async (t) => {
    const { machine, racine, env, preparer, configurer, relire, faits } = uneStation(t, { gists: true });
    const brigade = fauxGh(t);
    brigade.issues([]);
    const espace = fauxGh(t);
    issuesDe(espace, "acme/espace", []);
    preparer("brigade");
    preparer("espace");
    const ligneBrigade = `brigade acme/brigade ${BASE} BRIGADE_GH_BIN=${brigade.bin}\n`;
    configurer(ligneBrigade);
    const station = lancer(t, STATION, [], env);
    await station.attendre("station démarrée");
    const pid = station.process.pid;
    assert.match(station.sortie(), /1 projet servi : brigade/);
    assert.deepEqual(faits("espace", "runtime.started"), []);
    // Sa présence et son enregistrement sur GitHub publiés, la station n'écrit plus rien d'elle-même.
    await station.attendre("station à appairer");
    await station.attendre("station enregistrée sous le compte GitHub");

    // Tout ce que la machine porte, sauf l'état des projets, la configuration
    // elle-même, ce que la station dit de ce qu'elle sert (`en-service`, que
    // sa mise à jour attend) et le compteur de ses appels à GitHub, que chaque
    // sondage écrit.
    const sauf = [join(racine, "etat"), join(racine, "projets"), join(racine, "en-service"), join(racine, REPERTOIRE_COMPTEUR)];
    const avant = photographier(machine, sauf);

    // Chaque changement de la configuration est suivi d'un SIGHUP : la station la relit sans attendre sa relecture
    // de 2 s, que station.test.ts joue sur une horloge simulée (#2464).
    // Ajouter : une ligne de plus, rien d'autre.
    appendFileSync(join(racine, "projets"), `espace acme/espace main BRIGADE_GH_BIN=${espace.bin}\n`);
    station.process.kill("SIGHUP");
    await jusqua(() => faits("espace", "runtime.started").length === 1);
    assert.equal(faits("espace", "runtime.started")[0]?.payload.pid, pid);
    await station.attendre("brigade [espace] : servi par la station");
    await jusqua(() => espace.appels().length > 0);

    // Retirer : la ligne s'en va ; le projet s'arrête, la station et l'autre projet restent.
    configurer(ligneBrigade);
    station.process.kill("SIGHUP");
    await jusqua(() => faits("espace", "runtime.stopped").length === 1);
    assert.deepEqual(faits("espace", "runtime.stopped")[0]?.payload, { signal: "removed" });
    await station.attendre("brigade [espace] : retiré de la configuration : la station ne le sert plus");
    assert.equal(vivant(pid), true);
    assert.deepEqual(faits("brigade", "runtime.stopped"), []);
    const sondes = espace.appels().length;

    // Rajouté, il repart de son journal : son verrou a été rendu, rien n'est interrompu.
    appendFileSync(join(racine, "projets"), `espace acme/espace main BRIGADE_GH_BIN=${espace.bin}\n`);
    station.process.kill("SIGHUP");
    await jusqua(() => faits("espace", "runtime.started").length === 2);
    assert.deepEqual(faits("espace", "runtime.interrupted"), []);
    await jusqua(() => espace.appels().length > sondes);
    configurer(ligneBrigade);
    station.process.kill("SIGHUP");
    await jusqua(() => faits("espace", "runtime.stopped").length === 2);

    // Ni unité, ni drop-in, ni compte, ni clone : rien hors de l'état des projets n'a bougé.
    assert.deepEqual(photographier(machine, sauf), avant);
    // Et dans l'état, seul celui du projet ajouté puis retiré a été écrit — par la station elle-même.
    assert.deepEqual(readdirSync(join(racine, "etat")).sort(), ["brigade", "espace"]);
    assert.equal(relire("espace").every((e) => e.project === "espace"), true);

    station.process.kill("SIGTERM");
    assert.equal(await station.fin, 0);
  });

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

  test("sous les portes de la station : elle attend la sienne avant de rien joindre, puis chaque projet sort par la sienne — jamais par celle d'un autre", { skip: posixOnly("starts the station under its doors (tenir-portes.ts) and expects each project's proxy on a port of its own, then stops both processes with SIGTERM expecting exit 0; on Windows SIGTERM kills them before their handlers run, and a project's isolation.configured fact did not even come within the test's one-minute wait") }, async (t) => {
    const { racine, env, preparer, configurer, faits } = uneStation(t);
    const brigade = fauxGh(t);
    brigade.issues([]);
    const espace = fauxGh(t);
    issuesDe(espace, "acme/espace", []);
    preparer("brigade");
    preparer("espace");
    configurer(`brigade acme/brigade ${BASE} BRIGADE_GH_BIN=${brigade.bin}\nespace acme/espace main BRIGADE_GH_BIN=${espace.bin}\n`);
    const fichier = join(racine, "portes.json");

    // La station part sans portes : rien ne la fait joindre quoi que ce soit avant que le fichier porte leurs
    // ports, et les ports que ses projets prennent, plus bas, sont ceux de ce fichier. Ce qu'elle dit en attendant
    // est joué par portes.test.ts sur une horloge simulée : l'attendre ici coûtait sa patience, 3 s (#2464).
    const station = lancer(t, STATION, [], { ...env, BRIGADE_STATION_PORTES: fichier });
    assert.deepEqual(faits("brigade", "runtime.started"), []);

    const portes = lancer(t, PORTES, [], { BRIGADE_STATION_DIR: racine, BRIGADE_STATION_PORTES: fichier });
    await station.attendre("station démarrée");
    assert.match(station.sortie(), /2 projets servis : brigade, espace/);
    const ports = lirePortes(fichier);
    assert.equal(new Set([ports.station, ports.projets.brigade, ports.projets.espace]).size, 3);
    for (const projet of ["brigade", "espace"]) {
      await jusqua(() => faits(projet, "isolation.configured").length > 0);
      assert.equal((faits(projet, "isolation.configured")[0]?.payload.proxy as { port: number }).port, ports.projets[projet], projet);
    }

    station.process.kill("SIGTERM");
    assert.equal(await station.fin, 0);
    portes.process.kill("SIGTERM");
    assert.equal(await portes.fin, 0);
  });

  test("sans BRIGADE_STATION_DIR, la station refuse de démarrer et nomme la variable ; sans configuration, elle démarre et ne sert aucun projet", { skip: posixOnly("expects the station refused without BRIGADE_STATION_DIR, then started without configuration and serving nothing, and stopped with SIGTERM expecting exit 0; on Windows SIGTERM kills the station before its handler runs, so the exit code is null") }, async (t) => {
    const { env } = uneStation(t);
    const { BRIGADE_STATION_DIR: _, ...sans } = env;
    const refusee = await refuser(sans);
    assert.equal(refusee.code, REFUS);
    assert.match(refusee.sortie, /refus de démarrer la station — BRIGADE_STATION_DIR n'est pas défini/);

    const vide = lancer(t, STATION, [], env);
    await vide.attendre("station démarrée");
    assert.match(vide.sortie(), /aucun projet servi/);
    vide.process.kill("SIGTERM");
    assert.equal(await vide.fin, 0);
  });

});

test("main.test.ts de la station ne laisse rien dans le répertoire temporaire", rienNeReste);
