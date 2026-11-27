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
import { brancheDuTicket } from "../../../runtime/src/brigade-github.ts";
import { accepterSansBacASable } from "../../../runtime/src/onboarding/attente.ts";
import { BASE, depotGit, ENV_GIT, FAUX_CLAUDE, fauxGh, issueGitHub, jusqua, repertoireTemporaire } from "../../../runtime/test/outils.ts";
import { roleOf } from "../../src/workstation/role.ts";
import { holdStationLocale, HELD_BY, type OptionsStationLocale, type StationLocale } from "../../src/workstation/station.ts";
import { FILE_STATION } from "../../src/stations/document.ts";
import { githubOfStations } from "../../src/stations/github.ts";
import { holdStations, type Pairing, type Stations } from "../../src/stations/stations.ts";
import { CACHE_OF_COMPILATION } from "../helpers/cache-of-compilation.ts";
import { ghOfDirectory } from "../helpers/gh-of-directory.ts";
import { WITHOUT_POSIX } from "../helpers/posix.ts";
import { reply } from "../stations/fake-gh-gists.ts";

const ENVELOPE = join(import.meta.dirname, "../../src/workstation/envelope.ts");
const RUNTIME = join(import.meta.dirname, "../../../runtime");
const role = roleOf({ plateforme: "darwin", runtime: RUNTIME, env: {} });
const PRINCIPAL = role.role === "station" ? role.principal : assert.fail("la station n'est pas à côté de l'app");

// GitHub, hors de la machine : les gists du compte du chef, que l'app et la station lisent et
// écrivent chacune par son `gh` — la même doublure (helpers/gh-of-directory.ts).
function oneGitHub(t: TestContext) {
  const directory = mkdtempSync(join(tmpdir(), "brigade-app-gists-"));
  writeFileSync(join(directory, "appels"), "");
  const gh = ghOfDirectory(directory, reply);
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  // Les gists de la présence de la station : celui de son enregistrement sous le compte
  // (runtime/src/enregistrement-station/) est à côté, sans `brigade-station.json`.
  const files = (gist: string) => (JSON.parse(readFileSync(join(directory, gist), "utf8")) as { files: Record<string, { content: string }> }).files;
  const gists = () => readdirSync(directory).filter((name) => name.endsWith(".gist.json") && FILE_STATION in files(name));
  const state = (gist: string) => JSON.parse(files(gist)[FILE_STATION]?.content ?? "null") as { nom: string; arreteeLe: string | null };
  return { repertoire: directory, gh, gists, etat: state };
}

// La home de l'app : ses stations, lues sur GitHub.
function theHome(t: TestContext, github: { gh: string }): Stations {
  const stations = holdStations({ github: githubOfStations({ gh: github.gh, delaiMs: 30_000 }), surLecture: () => {}, cadenceMs: 3_600_000 });
  t.after(() => stations.fermer());
  return stations;
}

// Ce que l'app passe à sa station : son environnement — ici, celui d'une machine d'essai.
function oneComputer(t: TestContext, github: { gh: string }) {
  const machine = repertoireTemporaire(t);
  const root = join(machine, "station");
  const account = join(machine, "compte");
  mkdirSync(account);
  const env = {
    ...ENV_GIT,
    HOME: account,
    BRIGADE_GH_BIN: github.gh,
    BRIGADE_CLAUDE_BIN: FAUX_CLAUDE,
    BRIGADE_STATION_NOM: "ordi",
    BRIGADE_MAX_LOAD_PER_CORE: "1000000",
    BRIGADE_MIN_FREE_MEMORY_MB: "0",
    BRIGADE_MIN_FREE_DISK_MB: "0",
  };
  return { racine: root, env };
}

// L'app qui tient la station, arrêtée en fin de test si le test ne l'a pas fait.
function hold(t: TestContext, options: Omit<OptionsStationLocale, "dire"> & { dire?: (line: string) => void }) {
  const lines: string[] = [];
  const station = holdStationLocale({ dire: (line) => lines.push(line), ...options });
  t.after(() => station.arreter());
  return { station, lignes: lines, dit: () => lines.join("\n") };
}

const inLine = (home: Stations) => home.vu()?.stations.find((station) => station.nom === "ordi");

test("installer l'app sur un ordinateur : sa station démarre, s'appaire seule, et apparaît sur la home « en ligne · version X » ; l'app fermée, elle passe hors ligne", { skip: WITHOUT_POSIX }, async (t) => {
  const github = oneGitHub(t);
  const home = theHome(t, github);
  const { racine: root, env } = oneComputer(t, github);
  const { station, dit: said } = hold(t, { node: process.execPath, principal: PRINCIPAL, racine: root, env, appairer: (code) => home.appairer(code), reessaiMs: 200 });

  await jusqua(() => /paired with the app, as “ordi”/.test(said()));
  assert.equal(station.etat(), "demarree");
  // Ce que la station dit d'elle est dans le terminal de l'app, tel quel — celle d'un serveur le dit pareil.
  assert.match(said(), /brigade : station démarrée — pid \d+, configuration .*station\/projets ; aucun projet servi/);
  assert.match(said(), /brigade : station à appairer — tape ce code dans l'app : [0-9A-Z]{4}-[0-9A-Z]{4}/);
  await home.relire();
  assert.equal(inLine(home)?.etat, "en-ligne");
  assert.match(inLine(home)?.ligne ?? "", /^online · version \S.* · no project$/);
  assert.equal(readFileSync(join(root, HELD_BY), "utf8"), `${process.pid}\n`);

  // Fermer l'app : la station s'arrête et l'écrit sur GitHub ; la home la dit hors ligne, sans attendre.
  await station.arreter();
  assert.equal(station.etat(), "arretee");
  assert.match(said(), /brigade : station arrêtée \(SIGTERM\)/);
  assert.equal(existsSync(join(root, HELD_BY)), false);
  const [gist] = github.gists();
  assert.notEqual(github.etat(gist ?? "").arreteeLe, null);
  await home.relire();
  assert.match(inLine(home)?.ligne ?? "", /^offline for less than a minute · version /);

  // Rouverte, l'app relance sa station : elle relit son appairage sur GitHub, et n'a plus de code à taper.
  const reopened = hold(t, { node: process.execPath, principal: PRINCIPAL, racine: root, env, appairer: () => assert.fail("une station appairée n'affiche plus de code") });
  await jusqua(() => github.etat(gist ?? "").arreteeLe === null);
  await home.relire();
  assert.equal(inLine(home)?.etat, "en-ligne");
  assert.equal(github.gists().length, 1);
  await reopened.station.arreter();
});

test("l'app tuée net : l'entrée de sa station se ferme, et la station s'arrête comme sur un SIGTERM — l'heure de son arrêt est sur GitHub", { skip: WITHOUT_POSIX }, async (t) => {
  const github = oneGitHub(t);
  const { racine: root, env } = oneComputer(t, github);
  const child = spawn(process.execPath, [ENVELOPE, PRINCIPAL], { env: { ...env, BRIGADE_STATION_DIR: root }, stdio: ["pipe", "pipe", "pipe"] });
  t.after(() => void child.kill("SIGKILL"));
  let output = "";
  child.stdout.on("data", (piece: Buffer) => (output += piece.toString()));
  const end = new Promise<number | null>((resolve) => child.on("close", (code) => resolve(code)));
  await jusqua(() => output.includes("station à appairer"));

  // Le process de l'app meurt : ses bouts des tuyaux se ferment tous d'un coup — plus personne ne lit.
  child.stdout.destroy();
  child.stderr.destroy();
  child.stdin.destroy();
  assert.equal(await end, 0);
  const [gist] = github.gists();
  assert.notEqual(github.etat(gist ?? "").arreteeLe, null);
});

test("ajouter un projet à cette station : elle le sert sur GitHub seul, et prend un ticket du projet à son nom", { skip: WITHOUT_POSIX }, async (t) => {
  const github = oneGitHub(t);
  const { racine: root, env } = oneComputer(t, github);
  // Le projet, tel que l'ajout le pose sur la station : ses décisions au journal, sa ligne. Sur GitHub, un ticket
  // calibré que personne ne tient, sur une base verte.
  const { clone } = depotGit(t);
  const gh = fauxGh(t);
  gh.issues([issueGitHub(15, { labels: ["fire", "model:sonnet", "effort:low"] })]);
  // Le compte de la machine écrit sur le dépôt : la station GitHub seul sert le projet, pas la contributrice (#2935).
  gh.repondre("user", { corps: { login: "chef" } });
  gh.repondre("repos/acme/brigade", { corps: { full_name: "acme/brigade", owner: { login: "acme", type: "Organization" }, permissions: { push: true } } });
  gh.repondre("repos/acme/brigade/issues/15/events?per_page=100", { corps: [] });
  // Sans PR : la station lit celle du ticket avant de le prendre (#2622).
  gh.repondre(`repos/acme/brigade/pulls?head=acme:${brancheDuTicket(15)}&state=all&per_page=1`, { corps: [] });
  gh.repondre(`repos/acme/brigade/commits/${BASE}/check-runs?per_page=100`, { corps: { check_runs: [] } });
  gh.repondre(`repos/acme/brigade/commits/${BASE}/status?per_page=100`, { corps: { statuses: [] } });
  const state = join(root, "etat", "brigade");
  mkdirSync(state, { recursive: true });
  const log = ouvrirJournal(state);
  for (const [name, value] of Object.entries({ BRIGADE_STATIONS: "ordi/claude:30:code", BRIGADE_MANAGER_MODEL: "sonnet", BRIGADE_MANAGER_EFFORT: "medium", BRIGADE_REVIEWER_MODEL: "sonnet", BRIGADE_REVIEWER_EFFORT: "medium" })) {
    log.ajouter({ project: "brigade", ticket: null, author: "chef", type: "decision.set", payload: { name, value, previous: null } });
  }
  log.fermer();
  // Cette cuisine tourne sans bac à sable : le chef a décidé de continuer ainsi.
  accepterSansBacASable({ repertoireEtat: state, station: "ordi" });
  writeFileSync(join(root, "projets"), `brigade acme/brigade ${BASE} BRIGADE_GH_BIN=${gh.bin} BRIGADE_REPO_DIR=${clone}\n`);

  const { dit: said } = hold(t, { node: process.execPath, principal: PRINCIPAL, racine: root, env: { ...env, FAUX_CLAUDE: "livre" }, appairer: async (): Promise<Pairing> => ({ refus: "pas de home dans ce test" }), reessaiMs: 3_600_000 });
  // La prise de la station, postée sur l'issue du ticket : le premier geste du chemin GitHub seul.
  const taken = () =>
    gh
      .appels()
      .filter((args) => args.includes("POST") && args.at(-1) === "repos/acme/brigade/issues/15/comments")
      .map((args) => args.find((arg) => arg.startsWith("body="))?.slice("body=".length));
  await jusqua(() => taken().length > 0);

  assert.match(said(), /brigade \[brigade\] : servi par la station — acme\/brigade, branche v2/);
  assert.deepEqual(taken(), ["<!-- brigade:prise station=ordi/claude -->\nTaken by station `ordi/claude`."]);
});

// Une station d'essai, plus simple que la vraie : ce qu'elle fait à chaque lancement est écrit
// dans le test — dire une ligne, sortir, attendre son SIGTERM.
function onePrincipal(t: TestContext, body: string): string {
  const folder = repertoireTemporaire(t);
  // La place du point d'entrée dans le runtime : `<runtime>/src/station/main.ts`.
  mkdirSync(join(folder, "src", "station"), { recursive: true });
  const principal = join(folder, "src", "station", "main.ts");
  writeFileSync(principal, body);
  return principal;
}

const WAIT_SIGTERM = `
const veille = setInterval(() => {}, 1000);
process.on("SIGTERM", () => { console.log("arrêtée"); clearInterval(veille); });
`;

test("la station refusée (code 2) est retentée d'elle-même avec un délai qui double, et le refus est dit ; morte d'elle-même, elle est relancée", async (t) => {
  const root = join(repertoireTemporaire(t), "station");
  const refused = hold(t, { node: process.execPath, principal: onePrincipal(t, `console.error("brigade : refus de démarrer la station — BRIGADE_PROXY_PORT n'est pas un port"); process.exit(2);`), racine: root, env: { ...CACHE_OF_COMPILATION }, appairer: () => assert.fail(), relanceMs: 10 });
  await jusqua(() => refused.station.etat() === "refusee");
  assert.match(refused.dit(), /this computer's station refused to start — brigade : refus de démarrer la station — BRIGADE_PROXY_PORT n'est pas un port; trying again in 10 ms/);
  assert.doesNotMatch(refused.dit(), /until the app restarts/);
  // Rendue entre deux essais : une autre app pourra la tenter.
  await refused.station.arreter();
  assert.equal(existsSync(join(root, HELD_BY)), false);

  const other = join(repertoireTemporaire(t), "station");
  const account = join(other, "..", "lancements");
  const fallen = hold(t, {
    node: process.execPath,
    principal: onePrincipal(t, `import { appendFileSync, readFileSync } from "node:fs";\nappendFileSync(${JSON.stringify(account)}, "x");\nif (readFileSync(${JSON.stringify(account)}, "utf8").length === 1) process.exit(1);\n${WAIT_SIGTERM}`),
    racine: other,
    env: { ...CACHE_OF_COMPILATION },
    appairer: () => assert.fail(),
    relanceMs: 10,
  });
  await jusqua(() => fallen.station.etat() === "relancee");
  assert.match(fallen.dit(), /this computer's station stopped \(code 1\) — relaunched in 0 s/);
  await fallen.station.arreter();
  assert.match(fallen.dit(), /arrêtée/);
});

test("une station refusée parce qu'une autre tient encore le répertoire démarre d'elle-même dès que l'autre est partie (mise à jour à chaud)", async (t) => {
  const root = join(repertoireTemporaire(t), "station");
  const account = join(root, "..", "essais");
  const { station, dit: said } = hold(t, {
    node: process.execPath,
    principal: onePrincipal(t, `import { appendFileSync, readFileSync } from "node:fs";\nappendFileSync(${JSON.stringify(account)}, "x");\nif (readFileSync(${JSON.stringify(account)}, "utf8").length < 3) { console.error("une autre station tourne déjà"); process.exit(2); }\n${WAIT_SIGTERM}`),
    racine: root,
    env: { ...CACHE_OF_COMPILATION },
    appairer: () => assert.fail(),
    relanceMs: 10,
  });
  await jusqua(() => existsSync(account) && readFileSync(account, "utf8").length === 3 && station.etat() === "relancee" && station.tourne());
  assert.match(said(), /refused to start — une autre station tourne déjà; trying again in 10 ms/);
  await station.arreter();
});

test("les essais d'une station refusée restent à plat tant que la première minute dure, puis leur délai double", async (t) => {
  const refuses = `console.error("une autre station tourne déjà"); process.exit(2);`;
  const plate = hold(t, { node: process.execPath, principal: onePrincipal(t, refuses), racine: join(repertoireTemporaire(t), "station"), env: { ...CACHE_OF_COMPILATION }, appairer: () => assert.fail(), relanceMs: 10 });
  await jusqua(() => (plate.dit().match(/trying again in 10 ms/g) ?? []).length >= 3);
  assert.doesNotMatch(plate.dit(), /trying again in 20 ms/);
  await plate.station.arreter();
  const doubled = hold(t, { node: process.execPath, principal: onePrincipal(t, refuses), racine: join(repertoireTemporaire(t), "station"), env: { ...CACHE_OF_COMPILATION }, appairer: () => assert.fail(), relanceMs: 10, platMs: 0 });
  await jusqua(() => /trying again in 80 ms/.test(doubled.dit()));
  assert.match(doubled.dit(), /trying again in 20 ms[\s\S]*trying again in 40 ms[\s\S]*trying again in 80 ms/);
  await doubled.station.arreter();
});

test("un répertoire qu'on ne peut pas écrire n'arrête pas la station jusqu'au redémarrage de l'app : elle est retentée", async (t) => {
  const folder = repertoireTemporaire(t);
  const file = join(folder, "fichier");
  writeFileSync(file, "");
  const { station, dit: said } = hold(t, { node: process.execPath, principal: onePrincipal(t, WAIT_SIGTERM), racine: join(file, "station"), env: { ...CACHE_OF_COMPILATION }, appairer: () => assert.fail(), relanceMs: 10 });
  assert.equal(station.etat(), "refusee");
  assert.match(said(), /cannot be written.*trying again in 10 ms/);
  rmSync(file);
  await jusqua(() => station.tourne());
  await station.arreter();
});

test("le code refusé — GitHub ne montre pas encore la station — est retapé jusqu'à être appairé, et le refus n'est dit qu'une fois", async (t) => {
  const root = join(repertoireTemporaire(t), "station");
  const tapes: string[] = [];
  let refusal = 2;
  const { station, dit: said } = hold(t, {
    node: process.execPath,
    principal: onePrincipal(t, `console.log("brigade : station à appairer — tape ce code dans l'app : AAAA-BBBB (valable jusqu'à 14:32)");\n${WAIT_SIGTERM}`),
    racine: root,
    env: { ...CACHE_OF_COMPILATION },
    appairer: async (code) => {
      tapes.push(code);
      return refusal-- > 0 ? { refus: "no station shows this code: check it on the station, it is 8 letters and digits" } : { appairee: "ordi" };
    },
    reessaiMs: 10,
  });
  await jusqua(() => /paired with the app, as “ordi”/.test(said()));
  assert.deepEqual(tapes, ["AAAA-BBBB", "AAAA-BBBB", "AAAA-BBBB"]);
  // Le refus est dit une fois, pas à chaque essai.
  assert.equal(said().match(/not paired yet/g)?.length, 1);
  await station.arreter();
});

test("la station dit si elle tourne, et le dit à l'app à chaque changement : lancée, arrêtée — rien entre deux", async (t) => {
  const root = join(repertoireTemporaire(t), "station");
  const changes: boolean[] = [];
  const { station, dit: said } = hold(t, {
    node: process.execPath,
    principal: onePrincipal(t, `console.log("lancée");\n${WAIT_SIGTERM}`),
    racine: root,
    env: { ...CACHE_OF_COMPILATION },
    appairer: () => assert.fail(),
    surChangement: () => changes.push(station.tourne()),
  });
  assert.equal(station.tourne(), true);
  await jusqua(() => said().includes("lancée"));
  await station.arreter();
  assert.equal(station.tourne(), false);
  await jusqua(() => changes.length === 2);
  assert.deepEqual(changes, [true, false]);
});

test("une deuxième app ouverte ne lance pas une deuxième station : elle le dit, et la reprend quand la première se ferme", async (t) => {
  const root = join(repertoireTemporaire(t), "station");
  mkdirSync(root, { recursive: true });
  // La première app : un process vivant, dont le pid tient la station.
  const first = spawn(process.execPath, ["-e", "setInterval(() => {}, 1000)"], { stdio: "ignore" });
  t.after(() => void first.kill("SIGKILL"));
  writeFileSync(join(root, HELD_BY), `${first.pid}\n`);
  const principal = onePrincipal(t, `console.log("lancée");\n${WAIT_SIGTERM}`);
  const second = hold(t, { node: process.execPath, principal, racine: root, env: { ...CACHE_OF_COMPILATION }, appairer: () => assert.fail(), reessaiMs: 10 });

  assert.equal(second.station.etat(), "tenue-ailleurs");
  assert.match(second.dit(), new RegExp(`this computer's station is run by another app \\(pid ${first.pid}\\)`));
  first.kill("SIGKILL");
  await jusqua(() => second.dit().includes("lancée"));
  assert.equal(second.station.etat(), "demarree");
  assert.equal(readFileSync(join(root, HELD_BY), "utf8"), `${process.pid}\n`);
  // Dit une fois, pas à chaque essai.
  assert.equal(second.dit().match(/run by another app/g)?.length, 1);
  await second.station.arreter();
});

test("un répertoire de station qu'on ne peut pas écrire : l'app s'ouvre quand même, sans station, et le dit", async (t) => {
  const file = join(repertoireTemporaire(t), "un-fichier");
  writeFileSync(file, "");
  const { station, dit: said } = hold(t, { node: process.execPath, principal: onePrincipal(t, WAIT_SIGTERM), racine: join(file, "station"), env: { ...CACHE_OF_COMPILATION }, appairer: () => assert.fail() });
  assert.equal(station.etat(), "refusee");
  assert.match(said(), /this computer's station is not launched — its directory .*un-fichier[\\/]station cannot be written: /);
  await station.arreter();
});
