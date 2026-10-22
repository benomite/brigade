// L'app d'un ordinateur est une station : elle lance la vraie station de la machine
// (runtime/src/station/main.ts), l'appaire seule par le geste du chef, et la station apparaît sur
// la home comme celle d'un serveur. Un projet qu'on lui ajoute y cuit. Contre des doublures de
// `gh` (les gists du compte, les tickets d'un projet) et de `claude` : ni réseau, ni quota.
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test, type TestContext } from "node:test";
import { ouvrirJournal } from "../../../runtime/src/journal.ts";
import { accepterSansBacASable } from "../../../runtime/src/onboarding/attente.ts";
import { BASE, depotGit, ENV_GIT, FAUX_CLAUDE, fauxGh, git, issueGitHub, jusqua, repertoireTemporaire } from "../../../runtime/test/outils.ts";
import { roleDe } from "../../src/poste/role.ts";
import { tenirStationLocale, TENUE_PAR, type OptionsStationLocale, type StationLocale } from "../../src/poste/station.ts";
import { FICHIER_STATION } from "../../src/stations/document.ts";
import { githubDesStations } from "../../src/stations/github.ts";
import { tenirStations, type Appairage, type Stations } from "../../src/stations/stations.ts";
import { CACHE_DE_COMPILATION } from "../aides/cache-de-compilation.ts";
import { ghDuRepertoire } from "../aides/gh-du-repertoire.ts";
import { SANS_POSIX } from "../aides/posix.ts";
import { repondre } from "../stations/faux-gh-gists.ts";

const ENVELOPPE = join(import.meta.dirname, "../../src/poste/enveloppe.ts");
const RUNTIME = join(import.meta.dirname, "../../../runtime");
const role = roleDe({ plateforme: "darwin", runtime: RUNTIME, env: {} });
const PRINCIPAL = role.role === "station" ? role.principal : assert.fail("la station n'est pas à côté de l'app");

// GitHub, hors de la machine : les gists du compte du chef, que l'app et la station lisent et
// écrivent chacune par son `gh` — la même doublure (aides/gh-du-repertoire.ts).
function unGitHub(t: TestContext) {
  const repertoire = mkdtempSync(join(tmpdir(), "brigade-app-gists-"));
  writeFileSync(join(repertoire, "appels"), "");
  const gh = ghDuRepertoire(repertoire, repondre);
  t.after(() => rmSync(repertoire, { recursive: true, force: true }));
  const gists = () => readdirSync(repertoire).filter((nom) => nom.endsWith(".gist.json"));
  const etat = (gist: string) => JSON.parse(JSON.parse(readFileSync(join(repertoire, gist), "utf8")).files[FICHIER_STATION].content) as { nom: string; arreteeLe: string | null };
  return { repertoire, gh, gists, etat };
}

// La home de l'app : ses stations, lues sur GitHub.
function laHome(t: TestContext, github: { gh: string }): Stations {
  const stations = tenirStations({ github: githubDesStations({ gh: github.gh, delaiMs: 30_000 }), surLecture: () => {}, cadenceMs: 3_600_000 });
  t.after(() => stations.fermer());
  return stations;
}

// Ce que l'app passe à sa station : son environnement — ici, celui d'une machine d'essai.
function unOrdinateur(t: TestContext, github: { gh: string }) {
  const machine = repertoireTemporaire(t);
  const racine = join(machine, "station");
  const compte = join(machine, "compte");
  mkdirSync(compte);
  const env = {
    ...ENV_GIT,
    HOME: compte,
    BRIGADE_GH_BIN: github.gh,
    BRIGADE_CLAUDE_BIN: FAUX_CLAUDE,
    BRIGADE_STATION_NOM: "ordi",
    BRIGADE_MAX_LOAD_PER_CORE: "1000000",
    BRIGADE_MIN_FREE_MEMORY_MB: "0",
    BRIGADE_MIN_FREE_DISK_MB: "0",
  };
  return { racine, env };
}

// L'app qui tient la station, arrêtée en fin de test si le test ne l'a pas fait.
function tenir(t: TestContext, options: Omit<OptionsStationLocale, "dire"> & { dire?: (ligne: string) => void }) {
  const lignes: string[] = [];
  const station = tenirStationLocale({ dire: (ligne) => lignes.push(ligne), ...options });
  t.after(() => station.arreter());
  return { station, lignes, dit: () => lignes.join("\n") };
}

const enLigne = (home: Stations) => home.vu()?.stations.find((station) => station.nom === "ordi");

test("installer l'app sur un ordinateur : sa station démarre, s'appaire seule, et apparaît sur la home « en ligne · version X » ; l'app fermée, elle passe hors ligne", { skip: SANS_POSIX }, async (t) => {
  const github = unGitHub(t);
  const home = laHome(t, github);
  const { racine, env } = unOrdinateur(t, github);
  const { station, dit } = tenir(t, { node: process.execPath, principal: PRINCIPAL, racine, env, appairer: (code) => home.appairer(code), reessaiMs: 200 });

  await jusqua(() => /paired with the app, as “ordi”/.test(dit()));
  assert.equal(station.etat(), "demarree");
  // Ce que la station dit d'elle est dans le terminal de l'app, tel quel — celle d'un serveur le dit pareil.
  assert.match(dit(), /brigade : station démarrée — pid \d+, configuration .*station\/projets ; aucun projet servi/);
  assert.match(dit(), /brigade : station à appairer — tape ce code dans l'app : [0-9A-Z]{4}-[0-9A-Z]{4}/);
  await home.relire();
  assert.equal(enLigne(home)?.etat, "en-ligne");
  assert.match(enLigne(home)?.ligne ?? "", /^online · version \S.* · no project$/);
  assert.equal(readFileSync(join(racine, TENUE_PAR), "utf8"), `${process.pid}\n`);

  // Fermer l'app : la station s'arrête et l'écrit sur GitHub ; la home la dit hors ligne, sans attendre.
  await station.arreter();
  assert.equal(station.etat(), "arretee");
  assert.match(dit(), /brigade : station arrêtée \(SIGTERM\)/);
  assert.equal(existsSync(join(racine, TENUE_PAR)), false);
  const [gist] = github.gists();
  assert.notEqual(github.etat(gist ?? "").arreteeLe, null);
  await home.relire();
  assert.match(enLigne(home)?.ligne ?? "", /^offline for less than a minute · version /);

  // Rouverte, l'app relance sa station : elle relit son appairage sur GitHub, et n'a plus de code à taper.
  const rouverte = tenir(t, { node: process.execPath, principal: PRINCIPAL, racine, env, appairer: () => assert.fail("une station appairée n'affiche plus de code") });
  await jusqua(() => github.etat(gist ?? "").arreteeLe === null);
  await home.relire();
  assert.equal(enLigne(home)?.etat, "en-ligne");
  assert.equal(github.gists().length, 1);
  await rouverte.station.arreter();
});

test("l'app tuée net : l'entrée de sa station se ferme, et la station s'arrête comme sur un SIGTERM — l'heure de son arrêt est sur GitHub", { skip: SANS_POSIX }, async (t) => {
  const github = unGitHub(t);
  const { racine, env } = unOrdinateur(t, github);
  const enfant = spawn(process.execPath, [ENVELOPPE, PRINCIPAL], { env: { ...env, BRIGADE_STATION_DIR: racine }, stdio: ["pipe", "pipe", "pipe"] });
  t.after(() => void enfant.kill("SIGKILL"));
  let sortie = "";
  enfant.stdout.on("data", (morceau: Buffer) => (sortie += morceau.toString()));
  const fin = new Promise<number | null>((resoudre) => enfant.on("close", (code) => resoudre(code)));
  await jusqua(() => sortie.includes("station à appairer"));

  // Le process de l'app meurt : ses bouts des tuyaux se ferment tous d'un coup — plus personne ne lit.
  enfant.stdout.destroy();
  enfant.stderr.destroy();
  enfant.stdin.destroy();
  assert.equal(await fin, 0);
  const [gist] = github.gists();
  assert.notEqual(github.etat(gist ?? "").arreteeLe, null);
});

test("ajouter un projet dont cette station est la principale : un ticket du projet y cuit, jusqu'à sa PR et son commentaire", { skip: SANS_POSIX }, async (t) => {
  const github = unGitHub(t);
  const { racine, env } = unOrdinateur(t, github);
  // Le projet, tel que l'ajout le pose sur la station : ses décisions au journal, sa ligne.
  const { origine, clone } = depotGit(t);
  const gh = fauxGh(t);
  gh.issues([issueGitHub(15, { labels: ["fire", "model:sonnet", "effort:low"] })]);
  gh.repondre("repos/benomite/brigade/pulls", { statut: 201, corps: { html_url: "https://github.com/benomite/brigade/pull/40" } });
  gh.repondre("repos/benomite/brigade/issues/15/comments", { statut: 201, corps: { id: 1 } });
  const etat = join(racine, "etat", "brigade");
  mkdirSync(etat, { recursive: true });
  const journal = ouvrirJournal(etat);
  for (const [name, value] of Object.entries({ BRIGADE_STATIONS: "ordi/claude:30:code", BRIGADE_MANAGER_MODEL: "sonnet", BRIGADE_MANAGER_EFFORT: "medium", BRIGADE_REVIEWER_MODEL: "sonnet", BRIGADE_REVIEWER_EFFORT: "medium" })) {
    journal.ajouter({ project: "brigade", ticket: null, author: "chef", type: "decision.set", payload: { name, value, previous: null } });
  }
  journal.fermer();
  // Cette cuisine tourne sans bac à sable : le chef a décidé de continuer ainsi.
  accepterSansBacASable({ repertoireEtat: etat, station: "ordi" });
  writeFileSync(join(racine, "projets"), `brigade benomite/brigade ${BASE} BRIGADE_GH_BIN=${gh.bin} BRIGADE_REPO_DIR=${clone}\n`);

  const { dit } = tenir(t, { node: process.execPath, principal: PRINCIPAL, racine, env: { ...env, FAUX_CLAUDE: "livre" }, appairer: async (): Promise<Appairage> => ({ refus: "pas de home dans ce test" }), reessaiMs: 3_600_000 });
  await jusqua(() => gh.appels().some((appel) => appel.at(-1) === "repos/benomite/brigade/issues/15/comments"));

  assert.match(dit(), /brigade \[brigade\] : servi par la station — benomite\/brigade, branche v2/);
  const lu = ouvrirJournal(etat, { lectureSeule: true });
  const lancement = lu.tout().find((e) => e.type === "cook.launched");
  lu.fermer();
  assert.equal(lancement?.ticket, 15);
  assert.equal(git(origine, "show", `cook/${String((lancement?.payload as { run: string }).run)}:travail.txt`), "le travail du cook");
});

// Une station d'essai, plus simple que la vraie : ce qu'elle fait à chaque lancement est écrit
// dans le test — dire une ligne, sortir, attendre son SIGTERM.
function unPrincipal(t: TestContext, corps: string): string {
  const dossier = repertoireTemporaire(t);
  // La place du point d'entrée dans le runtime : `<runtime>/src/station/main.ts`.
  mkdirSync(join(dossier, "src", "station"), { recursive: true });
  const principal = join(dossier, "src", "station", "main.ts");
  writeFileSync(principal, corps);
  return principal;
}

const ATTENDRE_SIGTERM = `
const veille = setInterval(() => {}, 1000);
process.on("SIGTERM", () => { console.log("arrêtée"); clearInterval(veille); });
`;

test("la station refusée (code 2) n'est pas relancée, et le refus est dit ; morte d'elle-même, elle est relancée", async (t) => {
  const racine = join(repertoireTemporaire(t), "station");
  const refusee = tenir(t, { node: process.execPath, principal: unPrincipal(t, `console.error("brigade : refus de démarrer la station — BRIGADE_PROXY_PORT n'est pas un port"); process.exit(2);`), racine, env: { ...CACHE_DE_COMPILATION }, appairer: () => assert.fail(), relanceMs: 10 });
  await jusqua(() => refusee.station.etat() === "refusee");
  assert.match(refusee.dit(), /this computer's station refused to start — brigade : refus de démarrer la station — BRIGADE_PROXY_PORT n'est pas un port; it is not launched again/);
  // Rendue : une autre app pourra la tenter.
  assert.equal(existsSync(join(racine, TENUE_PAR)), false);
  await refusee.station.arreter();

  const autre = join(repertoireTemporaire(t), "station");
  const compte = join(autre, "..", "lancements");
  const tombee = tenir(t, {
    node: process.execPath,
    principal: unPrincipal(t, `import { appendFileSync, readFileSync } from "node:fs";\nappendFileSync(${JSON.stringify(compte)}, "x");\nif (readFileSync(${JSON.stringify(compte)}, "utf8").length === 1) process.exit(1);\n${ATTENDRE_SIGTERM}`),
    racine: autre,
    env: { ...CACHE_DE_COMPILATION },
    appairer: () => assert.fail(),
    relanceMs: 10,
  });
  await jusqua(() => tombee.station.etat() === "relancee");
  assert.match(tombee.dit(), /this computer's station stopped \(code 1\) — relaunched in 0 s/);
  await tombee.station.arreter();
  assert.match(tombee.dit(), /arrêtée/);
});

test("le code refusé — GitHub ne montre pas encore la station — est retapé jusqu'à être appairé, et le refus n'est dit qu'une fois", async (t) => {
  const racine = join(repertoireTemporaire(t), "station");
  const tapes: string[] = [];
  let refus = 2;
  const { station, dit } = tenir(t, {
    node: process.execPath,
    principal: unPrincipal(t, `console.log("brigade : station à appairer — tape ce code dans l'app : AAAA-BBBB (valable jusqu'à 14:32)");\n${ATTENDRE_SIGTERM}`),
    racine,
    env: { ...CACHE_DE_COMPILATION },
    appairer: async (code) => {
      tapes.push(code);
      return refus-- > 0 ? { refus: "no station shows this code: check it on the station, it is 8 letters and digits" } : { appairee: "ordi" };
    },
    reessaiMs: 10,
  });
  await jusqua(() => /paired with the app, as “ordi”/.test(dit()));
  assert.deepEqual(tapes, ["AAAA-BBBB", "AAAA-BBBB", "AAAA-BBBB"]);
  // Le refus est dit une fois, pas à chaque essai.
  assert.equal(dit().match(/not paired yet/g)?.length, 1);
  await station.arreter();
});

test("la station dit si elle tourne, et le dit à l'app à chaque changement : lancée, arrêtée — rien entre deux", async (t) => {
  const racine = join(repertoireTemporaire(t), "station");
  const changements: boolean[] = [];
  const { station, dit } = tenir(t, {
    node: process.execPath,
    principal: unPrincipal(t, `console.log("lancée");\n${ATTENDRE_SIGTERM}`),
    racine,
    env: { ...CACHE_DE_COMPILATION },
    appairer: () => assert.fail(),
    surChangement: () => changements.push(station.tourne()),
  });
  assert.equal(station.tourne(), true);
  await jusqua(() => dit().includes("lancée"));
  await station.arreter();
  assert.equal(station.tourne(), false);
  await jusqua(() => changements.length === 2);
  assert.deepEqual(changements, [true, false]);
});

test("une deuxième app ouverte ne lance pas une deuxième station : elle le dit, et la reprend quand la première se ferme", async (t) => {
  const racine = join(repertoireTemporaire(t), "station");
  mkdirSync(racine, { recursive: true });
  // La première app : un process vivant, dont le pid tient la station.
  const premiere = spawn(process.execPath, ["-e", "setInterval(() => {}, 1000)"], { stdio: "ignore" });
  t.after(() => void premiere.kill("SIGKILL"));
  writeFileSync(join(racine, TENUE_PAR), `${premiere.pid}\n`);
  const principal = unPrincipal(t, `console.log("lancée");\n${ATTENDRE_SIGTERM}`);
  const seconde = tenir(t, { node: process.execPath, principal, racine, env: { ...CACHE_DE_COMPILATION }, appairer: () => assert.fail(), reessaiMs: 10 });

  assert.equal(seconde.station.etat(), "tenue-ailleurs");
  assert.match(seconde.dit(), new RegExp(`this computer's station is run by another app \\(pid ${premiere.pid}\\)`));
  premiere.kill("SIGKILL");
  await jusqua(() => seconde.dit().includes("lancée"));
  assert.equal(seconde.station.etat(), "demarree");
  assert.equal(readFileSync(join(racine, TENUE_PAR), "utf8"), `${process.pid}\n`);
  // Dit une fois, pas à chaque essai.
  assert.equal(seconde.dit().match(/run by another app/g)?.length, 1);
  await seconde.station.arreter();
});

test("un répertoire de station qu'on ne peut pas écrire : l'app s'ouvre quand même, sans station, et le dit", async (t) => {
  const fichier = join(repertoireTemporaire(t), "un-fichier");
  writeFileSync(fichier, "");
  const { station, dit } = tenir(t, { node: process.execPath, principal: unPrincipal(t, ATTENDRE_SIGTERM), racine: join(fichier, "station"), env: { ...CACHE_DE_COMPILATION }, appairer: () => assert.fail() });
  assert.equal(station.etat(), "refusee");
  assert.match(dit(), /this computer's station is not launched — its directory .*un-fichier[\\/]station cannot be written: /);
  await station.arreter();
});
