// Le process de la station, remplacé seul (#2190) : la station demande « redémarre-moi sur X »,
// l'app arrête ce seul process et lance X depuis ses données. L'app, ses seconds et ses shells
// gardent leurs pids, rien ne s'écrit dans le paquet de l'app, et une version qui ne démarre pas
// rend la main à celle d'avant. De vrais process — la station passe par workstation/station.ts et son
// enveloppe, le second et le shell par le registre des terminaux —, contre des stations d'essai :
// chacune dit sa version dans `en-service`, comme la vraie. Aucun test n'attend une durée.
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { join, relative } from "node:path";
import { test, type TestContext } from "node:test";
import { jusqua, mort, repertoireTemporaire, vivant } from "../../../runtime/test/outils.ts";
import { PRINCIPAL } from "../../src/workstation/role.ts";
import {
  REQUEST,
  askRestart,
  IN_SERVICE,
  readStateOfVersions,
  holdProcessOfStation,
  VARIABLE_OF_VERSIONS,
  type Issue,
  type OptionsProcessOfStation,
} from "../../src/station-process/supervisor.ts";
import { openTerminals, type Launch, type Terminal } from "../../src/terminals.ts";
import { CACHE_OF_COMPILATION } from "../helpers/cache-of-compilation.ts";
import { WITHOUT_POSIX } from "../helpers/posix.ts";

const FAKE_CLAUDE = join(import.meta.dirname, "../helpers/fake-claude.sh");

// Une station d'essai : elle dit sa version et son pid dans `en-service`, puis tourne jusqu'au
// SIGTERM que son enveloppe lui donne quand l'app ferme son entrée.
const HEALTHY = `import { readFileSync, renameSync, writeFileSync } from "node:fs";
import { join } from "node:path";
const racine = process.env.BRIGADE_STATION_DIR;
const { version } = JSON.parse(readFileSync(join(import.meta.dirname, "../../package.json"), "utf8"));
const fichier = join(racine, "en-service");
writeFileSync(fichier + "." + process.pid, JSON.stringify({ version, pid: process.pid, depuis: new Date().toISOString(), servis: [], refuses: {} }));
renameSync(fichier + "." + process.pid, fichier);
console.log("station d'essai en " + version + " — versions sous " + process.env.${VARIABLE_OF_VERSIONS});
const veille = setInterval(() => {}, 60_000);
process.on("SIGTERM", () => { clearInterval(veille); process.exit(0); });
`;
// Une version qui refuse de démarrer (code 2), et une qui tombe aussitôt lancée.
const WHO_REFUSES = `console.error("brigade : refus de démarrer la station — essai"); process.exit(2);\n`;
const WHO_FALLS = `throw new Error("une version cassée");\n`;

function setRuntime(folder: string, version: string, body: string): void {
  mkdirSync(join(folder, "src", "station"), { recursive: true });
  writeFileSync(join(folder, "package.json"), `${JSON.stringify({ name: "brigade-runtime", version })}\n`);
  writeFileSync(join(folder, PRINCIPAL), body);
}

// Un ordinateur : le paquet de l'app, qui porte le runtime de départ, et les données de l'app —
// le répertoire de la station, et le dossier des versions téléchargées.
function oneComputer(t: TestContext, embedded = "1.0.0") {
  const machine = repertoireTemporaire(t);
  const pkg = join(machine, "Brigade.app");
  const runtime = join(pkg, "Contents", "Resources", "runtime");
  setRuntime(runtime, embedded, HEALTHY);
  const data = join(machine, "donnees");
  const root = join(data, "station");
  const versions = join(data, "versions-de-la-station");
  // Ce que la mise à jour de la station a téléchargé (#2189).
  const fetchDownload = (version: string, body = HEALTHY) => setRuntime(join(versions, version), version, body);
  return { machine, paquet: pkg, embarque: join(runtime, PRINCIPAL), racine: root, versions, telecharger: fetchDownload };
}

// Chaque fichier du paquet, son contenu et sa date : l'empreinte que rien ne doit changer.
function fingerprint(folder: string): Record<string, string> {
  const seenOnes: Record<string, string> = {};
  for (const name of readdirSync(folder, { recursive: true, encoding: "utf8" })) {
    const path = join(folder, name);
    const state = statSync(path);
    seenOnes[relative(folder, path)] = state.isDirectory() ? `dossier ${state.mtimeMs}` : `${state.mtimeMs} ${createHash("sha256").update(readFileSync(path)).digest("hex")}`;
  }
  return seenOnes;
}

const inService = (root: string) => {
  try {
    return JSON.parse(readFileSync(join(root, IN_SERVICE), "utf8")) as { version: string; pid: number };
  } catch {
    return null;
  }
};

// L'app qui tient la station, arrêtée en fin de test si le test ne l'a pas fait.
function hold(t: TestContext, ordi: ReturnType<typeof oneComputer>, options: Partial<OptionsProcessOfStation> = {}) {
  const lines: string[] = [];
  const issues: Issue[] = [];
  const station = holdProcessOfStation({
    node: process.execPath,
    embarque: ordi.embarque,
    versions: ordi.versions,
    racine: ordi.racine,
    env: { PATH: process.env.PATH, ...CACHE_OF_COMPILATION },
    dire: (line) => void lines.push(line),
    appairer: () => assert.fail("une station d'essai n'affiche aucun code"),
    pasMs: 20,
    veilleMs: 20,
    relanceMs: 50,
    surIssue: (issue) => void issues.push(issue),
    ...options,
  });
  t.after(() => station.arreter());
  return { station, issues, dit: () => lines.join("\n") };
}

// Les onglets de l'app : un second et un shell, chacun un vrai process que l'app lance.
function ofTabs(t: TestContext, folder: string) {
  mkdirSync(folder, { recursive: true });
  // Un fil à reprendre : le faux `claude` reprend la session, puis lit son entrée.
  writeFileSync(join(folder, ".fil"), "");
  const launched: { lancement: Launch; pid: number }[] = [];
  const states: Terminal[] = [];
  const terminals = openTerminals({
    claude: FAKE_CLAUDE,
    shell: "/bin/sh",
    argsDuShell: [],
    persistantIci: false,
    // Un pty d'essai : le process, sans terminal. Le pid est ce que le test suit.
    ouvrirPty(launch) {
      const child = spawn(launch.commande, launch.args, { cwd: launch.dossier, env: { PATH: process.env.PATH, ...launch.env }, stdio: ["pipe", "pipe", "pipe"] });
      child.stdout.on("data", (data: Buffer) => launch.surSortie(data.toString()));
      child.once("exit", (code) => launch.surFin(code ?? 1));
      launched.push({ lancement: launch, pid: child.pid ?? assert.fail("un onglet sans pid") });
      return { ecrire: (data) => void child.stdin.write(data), redimensionner: () => {}, tuer: () => void child.kill("SIGKILL") };
    },
    surSortie: () => {},
    surEtat: (terminal) => void states.push(terminal),
  });
  t.after(() => terminals.fermer());
  const project = { nom: "essai", dossier: folder };
  terminals.espace(project);
  terminals.shell(project);
  return { lances: launched, etats: states, pids: () => launched.map(({ pid }) => pid) };
}

test("la station demande à redémarrer sur X : seul son process est remplacé, par celui de X — l'app, le second et le shell gardent leurs pids, et le paquet de l'app n'est pas écrit", { skip: WITHOUT_POSIX }, async (t) => {
  const ordi = oneComputer(t);
  ordi.telecharger("1.0.1");
  const packageBefore = fingerprint(ordi.paquet);
  const app = process.pid;
  const { station, issues, dit: said } = hold(t, ordi);
  await jusqua(() => inService(ordi.racine)?.version === "1.0.0");
  const before = inService(ordi.racine)?.pid ?? assert.fail("aucune station en service");
  assert.equal(station.version(), "1.0.0");
  // La station sait où poser les versions qu'elle télécharge.
  await jusqua(() => said().includes(`station d'essai en 1.0.0 — versions sous ${ordi.versions}`));

  const tabs = ofTabs(t, `${ordi.machine}/projet`);
  const openOnes = tabs.pids();
  assert.equal(openOnes.length, 2);
  assert.ok(openOnes.every((pid) => vivant(pid)));

  // Le geste de la mise à jour de la station, une fois ses cooks finis (#2189).
  askRestart(ordi.racine, "1.0.1");
  await jusqua(() => issues.length > 0);

  assert.deepEqual({ ...issues[0], le: "" }, { quoi: "passee", version: "1.0.1", depuis: "1.0.0", le: "" });
  const after = inService(ordi.racine);
  assert.equal(after?.version, "1.0.1");
  assert.notEqual(after?.pid, before);
  assert.ok(vivant(after?.pid));
  await mort(before);
  assert.equal(station.version(), "1.0.1");
  assert.equal(station.tourne(), true);
  // La demande est lue, une fois.
  assert.equal(readdirSync(ordi.racine).includes(REQUEST), false);

  // L'app est le même process ; le second et le shell aussi : rien ne les a relancés ni rattachés.
  assert.equal(process.pid, app);
  assert.deepEqual(tabs.pids(), openOnes);
  assert.ok(openOnes.every((pid) => vivant(pid)));
  assert.deepEqual(tabs.etats.filter((terminal) => terminal.arrete), []);

  // Rien n'a touché au paquet de l'app : tout ce qui a été écrit est dans ses données.
  assert.deepEqual(fingerprint(ordi.paquet), packageBefore);
  assert.deepEqual(readdirSync(ordi.machine).sort(), ["Brigade.app", "donnees", "projet"]);
  assert.equal(readStateOfVersions(ordi.versions).retenue, "1.0.1");
  assert.match(said(), /restarts on 1\.0\.1 \(from 1\.0\.0\) — only its process/);
  assert.match(said(), /now runs 1\.0\.1/);
});

for (const [theCase, body, motive] of [
  ["refuse de démarrer", WHO_REFUSES, /it refused to start in 1\.0\.1/],
  ["tombe aussitôt lancée", WHO_FALLS, /it stopped in 1\.0\.1 right after its launch/],
] as const) {
  test(`la version X ${theCase} : la version d'avant tourne de nouveau, l'échec est dit et retenu, et X n'est pas réessayée`, { skip: WITHOUT_POSIX }, async (t) => {
    const ordi = oneComputer(t);
    ordi.telecharger("1.0.1", body);
    const packageBefore = fingerprint(ordi.paquet);
    const { station, issues, dit: said } = hold(t, ordi);
    await jusqua(() => inService(ordi.racine)?.version === "1.0.0");
    const before = inService(ordi.racine)?.pid ?? assert.fail("aucune station en service");
    const tabs = ofTabs(t, `${ordi.machine}/projet`);
    const openOnes = tabs.pids();

    const issue = await station.redemarrer("1.0.1");

    assert.equal(issue?.quoi, "revenue");
    assert.ok(issue?.quoi === "revenue");
    assert.equal(issue.visee, "1.0.1");
    assert.equal(issue.restauree, "1.0.0");
    assert.match(issue.motif, motive);
    assert.equal(issue.retour, null);
    assert.deepEqual(issues, [issue]);
    // La version d'avant tourne, dans un process neuf.
    const back = inService(ordi.racine);
    assert.equal(back?.version, "1.0.0");
    assert.notEqual(back?.pid, before);
    assert.ok(vivant(back?.pid));
    assert.equal(station.version(), "1.0.0");
    assert.equal(station.tourne(), true);
    assert.match(said(), /did not start on 1\.0\.1 \(.*\) — back to 1\.0\.0/);
    assert.match(said(), /runs 1\.0\.0 again/);
    // Ce que l'écran de la station lira : l'échec, et la version qui n'est pas retenue.
    assert.deepEqual(readStateOfVersions(ordi.versions), { retenue: null, ratees: ["1.0.1"], derniere: issue });
    assert.deepEqual(tabs.pids(), openOnes);
    assert.ok(openOnes.every((pid) => vivant(pid)));

    // Redemandée, X n'est pas réessayée : la station qui tourne n'est pas arrêtée.
    const pid = back?.pid;
    const refusal = await station.redemarrer("1.0.1");
    assert.equal(refusal?.quoi, "refusee");
    assert.equal(inService(ordi.racine)?.pid, pid);
    assert.deepEqual(fingerprint(ordi.paquet), packageBefore);
  });
}

test("une version qui ne se dit jamais en service dans le temps laissé : la version d'avant revient", { skip: WITHOUT_POSIX }, async (t) => {
  const ordi = oneComputer(t);
  // Elle tourne, mais n'écrit rien : un process qui tourne ne suffit pas.
  ordi.telecharger("1.0.1", "setInterval(() => {}, 60_000);\nprocess.on(\"SIGTERM\", () => process.exit(0));\n");
  const { station } = hold(t, ordi, { demarrageMs: 300 });
  await jusqua(() => inService(ordi.racine)?.version === "1.0.0");

  const issue = await station.redemarrer("1.0.1");

  assert.ok(issue?.quoi === "revenue");
  assert.match(issue.motif, /it did not say it was in service in 1\.0\.1 within 0\.3 s/);
  assert.equal(inService(ordi.racine)?.version, "1.0.0");
});

// #3709 : la version X cesse de servir un projet : c'est un projet perdu, la version d'avant revient.
test("#3709 : la version X ne sert plus un projet que rien ne met de côté : la version d'avant revient", { skip: WITHOUT_POSIX }, async (t) => {
  const ordi = oneComputer(t);
  const who = (servedOnes: string[]) => HEALTHY.replace("servis: []", `servis: ${JSON.stringify(servedOnes)}`);
  setRuntime(join(ordi.paquet, "Contents", "Resources", "runtime"), "1.0.0", who(["shop", "other"]));
  ordi.telecharger("1.0.1", who(["shop"]));
  mkdirSync(ordi.racine, { recursive: true });
  writeFileSync(join(ordi.racine, "projets"), "other acme/other main\nshop acme/shop main\n");
  const { station } = hold(t, ordi, { demarrageMs: 300 });
  await jusqua(() => inService(ordi.racine)?.version === "1.0.0");

  const issue = await station.redemarrer("1.0.1");

  assert.equal(issue?.quoi, "revenue");
  if (issue?.quoi === "revenue") assert.match(issue.motif, /project other is no longer served in 1\.0\.1/);
  assert.equal(inService(ordi.racine)?.version, "1.0.0");
});

test("pendant le remplacement de son process, la station dit sur quelle version elle redémarre ; avant et après, rien (#3637)", { skip: WITHOUT_POSIX }, async (t) => {
  const ordi = oneComputer(t);
  ordi.telecharger("1.0.1");
  const { station } = hold(t, ordi);
  await jusqua(() => inService(ordi.racine)?.version === "1.0.0");
  assert.equal(station.redemarrage(), null);

  const issue = station.redemarrer("1.0.1");
  assert.equal(station.redemarrage(), "1.0.1");
  assert.equal((await issue)?.quoi, "passee");

  assert.equal(station.redemarrage(), null);
});

test("une version absente des données de l'app, ou un chemin à la place d'une version : rien n'est arrêté", { skip: WITHOUT_POSIX }, async (t) => {
  const ordi = oneComputer(t);
  const { station, dit: said } = hold(t, ordi);
  await jusqua(() => inService(ordi.racine)?.version === "1.0.0");
  const pid = inService(ordi.racine)?.pid;

  const issue = await station.redemarrer("1.0.1");
  assert.ok(issue?.quoi === "refusee");
  assert.match(issue.motif, /its runtime is not in .*versions-de-la-station\/1\.0\.1/);

  writeFileSync(join(ordi.racine, REQUEST), `${JSON.stringify({ version: "../../Brigade.app" })}\n`);
  await jusqua(() => /asked for a restart the app cannot read — it names no valid version/.test(said()));
  assert.equal(inService(ordi.racine)?.pid, pid);
  assert.equal(station.version(), "1.0.0");
});

test("l'app rouverte relance la station sur la version retenue — sauf si son paquet en porte une plus récente", { skip: WITHOUT_POSIX }, async (t) => {
  const ordi = oneComputer(t);
  ordi.telecharger("1.0.1");
  const first = hold(t, ordi);
  await jusqua(() => inService(ordi.racine)?.version === "1.0.0");
  assert.equal((await first.station.redemarrer("1.0.1"))?.quoi, "passee");
  await first.station.arreter();

  const reopened = hold(t, ordi);
  await jusqua(() => inService(ordi.racine)?.version === "1.0.1" && inService(ordi.racine)?.pid !== undefined && vivant(inService(ordi.racine)?.pid));
  assert.equal(reopened.station.version(), "1.0.1");
  await reopened.station.arreter();

  // Une app neuve, dont le paquet porte 1.0.2 : sa station part sur elle.
  setRuntime(join(ordi.paquet, "Contents", "Resources", "runtime"), "1.0.2", HEALTHY);
  const freshOne = hold(t, ordi);
  await jusqua(() => inService(ordi.racine)?.version === "1.0.2");
  assert.equal(freshOne.station.version(), "1.0.2");
});
