// La station telle que la machine la lance : un seul vrai process, qui sert
// tous les projets de sa configuration, piloté par cette configuration et par
// des signaux.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { appendFileSync, chmodSync, existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, test, type TestContext } from "node:test";
import { ROLES } from "../../src/identites.ts";
import { ouvrirJournal } from "../../src/journal.ts";
import { REPERTOIRE_COMPTEUR } from "../../src/limite-github.ts";
import { accepterSansBacASable } from "../../src/onboarding/attente.ts";
import { lirePortes } from "../../src/station/portes.ts";
import { fauxGitHubApps } from "../aides/faux-github-apps.ts";
import { relecteur } from "../aides/opt-B-journal.ts";
import { aArreter, BASE, depotGit, ecrireSuite, ENV_GIT, FAUX_BWRAP, FAUX_CLAUDE, fauxGh, type FauxGh, git, issueGitHub, jusqua, lancementsDuFauxClaude, lancer, mort, repertoireTemporaire, temporaireDuFichier, tuerLesRelais, vivant } from "../outils.ts";
import { FAUX_GH_GISTS } from "../appairage/doublure-des-gists.ts";

const rienNeReste = temporaireDuFichier();

const STATION = join(import.meta.dirname, "../../src/station/main.ts");
const PORTES = join(import.meta.dirname, "../../src/station/tenir-portes.ts");
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

// Chaque test a sa station — racine, configuration, doublures — sur le port 0 : ils se jouent de front.
describe("la station, son process", { concurrency: 8 }, () => {
  test("deux projets dans la configuration : un seul process les sert, chacun avec son journal, sa cloison et son `gh`, et sa sortie est le seul journal de service", async (t) => {
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
    await station.attendre("brigade [espace] : sondage GitHub en échec");
    assert.doesNotMatch(station.sortie(), /^brigade : sondage/m);

    station.process.kill("SIGTERM");
    assert.equal(await station.fin, 0);
    for (const projet of ["brigade", "espace"]) assert.deepEqual(relire(projet).at(-1)?.payload, { signal: "SIGTERM" }, projet);
    assert.match(station.sortie(), /station arrêtée \(SIGTERM\)/);
  });

  test("un projet ajouté à la configuration est servi, sans redémarrer ; retiré, il ne l'est plus ; et rien d'autre que la configuration n'a été écrit pour cela", async (t) => {
    const { machine, racine, env, preparer, configurer, relire, faits } = uneStation(t);
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
    // Sa présence sur GitHub publiée, la station n'écrit plus rien d'elle-même.
    await station.attendre("station à appairer");

    // Tout ce que la machine porte, sauf l'état des projets, la configuration
    // elle-même, ce que la station dit de ce qu'elle sert (`en-service`, que
    // sa mise à jour attend) et le compteur de ses appels à GitHub, que chaque
    // sondage écrit.
    const sauf = [join(racine, "etat"), join(racine, "projets"), join(racine, "en-service"), join(racine, REPERTOIRE_COMPTEUR)];
    const avant = photographier(machine, sauf);

    // Ajouter : une ligne de plus, rien d'autre.
    appendFileSync(join(racine, "projets"), `espace acme/espace main BRIGADE_GH_BIN=${espace.bin}\n`);
    await jusqua(() => faits("espace", "runtime.started").length === 1);
    assert.equal(faits("espace", "runtime.started")[0]?.payload.pid, pid);
    await station.attendre("brigade [espace] : servi par la station");
    await jusqua(() => espace.appels().length > 0);

    // Retirer : la ligne s'en va ; le projet s'arrête, la station et l'autre projet restent.
    configurer(ligneBrigade);
    await jusqua(() => faits("espace", "runtime.stopped").length === 1);
    assert.deepEqual(faits("espace", "runtime.stopped")[0]?.payload, { signal: "removed" });
    await station.attendre("brigade [espace] : retiré de la configuration : la station ne le sert plus");
    assert.equal(vivant(pid), true);
    assert.deepEqual(faits("brigade", "runtime.stopped"), []);
    const sondes = espace.appels().length;

    // Rajouté, il repart de son journal : son verrou a été rendu, rien n'est interrompu.
    appendFileSync(join(racine, "projets"), `espace acme/espace main BRIGADE_GH_BIN=${espace.bin}\n`);
    await jusqua(() => faits("espace", "runtime.started").length === 2);
    assert.deepEqual(faits("espace", "runtime.interrupted"), []);
    await jusqua(() => espace.appels().length > sondes);
    configurer(ligneBrigade);
    await jusqua(() => faits("espace", "runtime.stopped").length === 2);

    // Ni unité, ni drop-in, ni compte, ni clone : rien hors de l'état des projets n'a bougé.
    assert.deepEqual(photographier(machine, sauf), avant);
    // Et dans l'état, seul celui du projet ajouté puis retiré a été écrit — par la station elle-même.
    assert.deepEqual(readdirSync(join(racine, "etat")).sort(), ["brigade", "espace"]);
    assert.equal(relire("espace").every((e) => e.project === "espace"), true);

    station.process.kill("SIGTERM");
    assert.equal(await station.fin, 0);
  });

  test("une ligne refusée n'arrête pas la station : elle le dit au nom du projet, et sert les autres", async (t) => {
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

  test("sous les portes de la station : elle attend la sienne avant de rien joindre, puis chaque projet sort par la sienne — jamais par celle d'un autre", async (t) => {
    const { racine, env, preparer, configurer, faits } = uneStation(t);
    const brigade = fauxGh(t);
    brigade.issues([]);
    const espace = fauxGh(t);
    issuesDe(espace, "acme/espace", []);
    preparer("brigade");
    preparer("espace");
    configurer(`brigade acme/brigade ${BASE} BRIGADE_GH_BIN=${brigade.bin}\nespace acme/espace main BRIGADE_GH_BIN=${espace.bin}\n`);
    const fichier = join(racine, "portes.json");

    const station = lancer(t, STATION, [], { ...env, BRIGADE_STATION_PORTES: fichier });
    await station.attendre(`la station attend sa porte — brigade-station-porte.service n'a pas encore écrit son port dans ${fichier}`);
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

  test("sans BRIGADE_STATION_DIR, la station refuse de démarrer et nomme la variable ; sans configuration, elle démarre et ne sert aucun projet", async (t) => {
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

  // Deux cuisines complètes : elles se jouent de front.
  describe("de bout en bout", { concurrency: 2 }, () => {
    test("deux projets cuisinés par le même process : chacun voit son issue devenir une branche poussée sur son origine, une PR et un commentaire", async (t) => {
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

    test("une identité par rôle sous la station : la PR part sous l'identité cook, et ni le cook ni le reviewer ne reçoivent de jeton — pas même celui du compte de la station", async (t) => {
      const { env, etat, preparer, configurer, faits } = uneStation(t);
      const { origine, clone } = depotGit(t);
      const gh = fauxGh(t);
      gh.issues([issueGitHub(15, { labels: ["fire", "model:sonnet", "effort:low"] })]);
      gh.repondre("repos/acme/brigade/pulls", { statut: 201, corps: { html_url: "https://github.com/acme/brigade/pull/40" } });
      gh.repondre("repos/acme/brigade/issues/15/comments", { statut: 201, corps: { id: 1 } });
      const apps = await fauxGitHubApps(t);
      preparer("brigade", { clone: false });
      const temoin = join(repertoireTemporaire(t), "temoin");
      mkdirSync(temoin);
      configurer(`brigade acme/brigade ${BASE} BRIGADE_GH_BIN=${gh.bin} BRIGADE_REPO_DIR=${clone} BRIGADE_GITHUB_APPS_DIR=${apps.repertoire} BRIGADE_GITHUB_API_URL=${apps.url}\n`);
      const station = lancer(t, STATION, [], { ...env, GH_TOKEN: "ghp_du_compte", FAUX_CLAUDE: "livre", FAUX_CLAUDE_TEMOIN: temoin });

      await jusqua(() => gh.appels().some((appel) => appel.at(-1) === "repos/acme/brigade/issues/15/comments"));
      assert.match(station.sortie(), /brigade \[brigade\] : GitHub — une identité par rôle \(cook, pass, manager\)/);
      const sous = (chemin: string) => [...new Set(gh.appels().flatMap((appel, i) => (appel.at(-1) === chemin ? [/^ghs_([a-z]+)_/.exec(gh.jetons()[i] ?? "")?.[1] ?? gh.jetons()[i]] : [])))];
      assert.deepEqual(sous("repos/acme/brigade/pulls"), ["cook"]);
      assert.deepEqual(sous("repos/acme/brigade/issues?labels=fire&state=open&per_page=100"), ["manager"]);
      assert.ok(!gh.jetons().includes(null) && !gh.jetons().includes("ghp_du_compte"));
      const [lancement] = faits("brigade", "cook.launched");
      assert.equal(git(origine, "show", `cook/${String(lancement?.payload.run)}:travail.txt`), "le travail du cook");

      const lances = lancementsDuFauxClaude(temoin);
      assert.ok(lances.length >= 1);
      for (const lance of lances) {
        assert.deepEqual(Object.keys(lance.env).filter((nom) => /TOKEN|BRIGADE_|GIT_CONFIG_(COUNT|KEY|VALUE)/.test(nom)), []);
        assert.equal(lance.env.GH_CONFIG_DIR, join(etat("brigade"), "gh-sans-compte"));
        assert.ok(!JSON.stringify(lance).includes("ghs_"));
      }
      station.process.kill("SIGTERM");
      assert.equal(await station.fin, 0);
      const secrets = [...ROLES.flatMap((role) => apps.jetons(role)), ...apps.jwts(), "ghp_du_compte"];
      const ecrits = [JSON.stringify(faits("brigade", "cook.launched")), JSON.stringify(faits("brigade", "cook.exited")), station.sortie()];
      for (const ecrit of ecrits) for (const secret of secrets) assert.ok(!ecrit.includes(secret), `un jeton s'est écrit : ${ecrit.slice(0, 200)}`);
    });
  });

  test("la station remplacée pendant qu'un cook tourne — une mise à jour : le cook lui survit, la station suivante le reprend sans le relancer, et sa livraison est jugée, mergée sous grant et servie", async (t) => {
    const { env, etat, preparer, configurer, faits } = uneStation(t);
    aArreter(t, () => tuerLesRelais(etat("brigade")));
    const { origine, clone } = depotGit(t);
    mkdirSync(join(clone, ".claude/brigade"), { recursive: true });
    writeFileSync(join(clone, ".claude/brigade/gates.sh"), '#!/usr/bin/env bash\ntest -f "$1/travail.txt" && echo "gates : VERT"\n');
    chmodSync(join(clone, ".claude/brigade/gates.sh"), 0o755);
    git(clone, "add", ".");
    git(clone, "commit", "-q", "-m", "les gates du projet");
    git(clone, "push", "-q", "origin", BASE);
    const depot = "acme/brigade";
    const pr = { number: 40, html_url: `https://github.com/${depot}/pull/40`, state: "open", merged: false, mergeable: true, base: { ref: BASE }, head: { sha: "tete" } };
    const gh = fauxGh(t);
    gh.issues([issueGitHub(15, { labels: ["fire", "model:sonnet", "effort:low"] })]);
    gh.repondre(`repos/${depot}/pulls`, { statut: 201, corps: pr });
    gh.repondre(`repos/${depot}/issues/15/comments`, { statut: 201, corps: { id: 1 } });
    gh.repondre(`repos/${depot}/pulls?head=acme:cook/*`, { corps: [pr] });
    gh.repondre(`repos/${depot}/pulls/40`, { corps: pr });
    gh.repondre(`repos/${depot}/commits/*/check-runs?per_page=100`, { corps: { check_runs: [] } });
    gh.repondre(`repos/${depot}/commits/*/status?per_page=100`, { corps: { statuses: [] } });
    gh.repondre(`repos/${depot}/pulls/40/merge`, { corps: { merged: true } });
    preparer("brigade", { clone: false, grant: true });
    // Le cook commite, puis attend qu'on le laisse conclure ; le reviewer relit vert.
    const essais = repertoireTemporaire(t);
    const suite = join(essais, "suite.txt");
    ecrireSuite(suite, ["commite-puis-attend"]);
    const feu = join(essais, "feu");
    configurer(`brigade ${depot} ${BASE} BRIGADE_GH_BIN=${gh.bin} BRIGADE_REPO_DIR=${clone}\n`);
    const envDeStation = { ...env, FAUX_CLAUDE: "relit-vert", FAUX_CLAUDE_SUITE: suite, FAUX_CLAUDE_FEU: feu };

    const premiere = lancer(t, STATION, [], envDeStation);
    await jusqua(() => faits("brigade", "cook.launched").length === 1);
    const run = String(faits("brigade", "cook.launched")[0]?.payload.run);
    const fichierDuPid = join(etat("brigade"), "runs", `${run}.cook.pid`);
    await jusqua(() => existsSync(fichierDuPid));
    const pid = Number(readFileSync(fichierDuPid, "utf8"));
    await jusqua(() => existsSync(join(etat("brigade"), "worktrees", run, "travail.txt")));

    premiere.process.kill("SIGTERM");
    assert.equal(await premiere.fin, 0);
    assert.equal(vivant(pid), true);

    const seconde = lancer(t, STATION, [], envDeStation);
    await jusqua(() => faits("brigade", "cook.resumed").length === 1);
    assert.equal(vivant(pid), true);
    assert.deepEqual(faits("brigade", "cook.interrupted"), []);

    writeFileSync(feu, "");
    await jusqua(() => faits("brigade", "ticket.served").length === 1);
    await mort(pid);
    const juge = git(origine, "rev-parse", `cook/${run}`);
    assert.deepEqual(faits("brigade", "cook.launched").filter((e) => e.ticket === 15).map((e) => e.payload.run), [run]);
    assert.deepEqual([faits("brigade", "pass.judged")[0]?.payload.verdict, faits("brigade", "pass.judged")[0]?.payload.sha], ["green", juge]);
    assert.deepEqual(gh.appels().find((appel) => appel.includes("PUT")), ["api", "-i", "-X", "PUT", "-f", `sha=${juge}`, "-f", "merge_method=merge", `repos/${depot}/pulls/40/merge`]);
    assert.deepEqual(faits("brigade", "grant.used").length, 1);
    seconde.process.kill("SIGTERM");
    assert.equal(await seconde.fin, 0);
  });
});

test("main.test.ts de la station ne laisse rien dans le répertoire temporaire", rienNeReste);
