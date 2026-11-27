// La station demande sa relance par la ligne que sa mise à jour écrit (#2287, #2189) : l'app, qui la
// lit, relance seul son process sur le point d'entrée de la release, avec les mêmes variables.
// De vrais process, contre une fausse release que la station d'essai « a téléchargée ».
import assert from "node:assert/strict";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { test, type TestContext } from "node:test";
import { jusqua, repertoireTemporaire } from "../../../runtime/test/outils.ts";
import { LIGNE_DE_RELANCE as LINE_OF_RUNTIME, ligneDeRelance } from "../../../runtime/src/station-update/mettre-a-jour.ts";
import { PRINCIPAL } from "../../src/workstation/role.ts";
import { environmentOfTheStation, LINE_OF_RELAUNCH, principalOf, holdProcessOfStation, type Issue } from "../../src/station-process/supervisor.ts";
import { CACHE_OF_COMPILATION } from "../helpers/cache-of-compilation.ts";
import { WITHOUT_POSIX } from "../helpers/posix.ts";

const RELEASE = "0.20261104.120000+gabcdef0";

// Une station d'essai : elle dit sa version dans `en-service`, ses deux variables, et — si on le lui demande —
// la ligne de relance de la vraie.
const station = (line: string | null) => `import { readFileSync, renameSync, writeFileSync } from "node:fs";
import { join } from "node:path";
const racine = process.env.BRIGADE_STATION_DIR;
const { version } = JSON.parse(readFileSync(join(import.meta.dirname, "../../package.json"), "utf8"));
const fichier = join(racine, "en-service");
writeFileSync(fichier + "." + process.pid, JSON.stringify({ version, pid: process.pid, depuis: new Date().toISOString(), servis: [], refuses: {} }));
renameSync(fichier + "." + process.pid, fichier);
console.log("variables " + version + " : " + process.env.BRIGADE_MISE_A_JOUR_SOURCE + " " + process.env.BRIGADE_STATION_RELANCE);
${line === null ? "" : `console.log(${JSON.stringify(line)});`}
const veille = setInterval(() => {}, 60_000);
process.on("SIGTERM", () => { clearInterval(veille); process.exit(0); });
`;

function set(folder: string, version: string, body: string): void {
  mkdirSync(join(folder, "src", "station"), { recursive: true });
  writeFileSync(join(folder, "package.json"), `${JSON.stringify({ name: "brigade-runtime", version })}\n`);
  writeFileSync(join(folder, PRINCIPAL), body);
}

function oneComputer(t: TestContext) {
  const machine = repertoireTemporaire(t);
  const root = join(machine, "station");
  const versions = join(root, "station-update", "releases");
  const folderOfRuntime = (version: string) => join(versions, version, "runtime");
  const embedded = join(machine, "paquet", "runtime", PRINCIPAL);
  return { racine: root, versions, dossierDuRuntime: folderOfRuntime, embarque: embedded, paquet: join(machine, "paquet", "runtime") };
}

function hold(t: TestContext, ordi: ReturnType<typeof oneComputer>, env: Record<string, string | undefined>) {
  const lines: string[] = [];
  const issues: Issue[] = [];
  const heldOne = holdProcessOfStation({
    node: process.execPath,
    embarque: ordi.embarque,
    versions: ordi.versions,
    dossierDuRuntime: ordi.dossierDuRuntime,
    racine: ordi.racine,
    env: environmentOfTheStation({ PATH: process.env.PATH, ...CACHE_OF_COMPILATION, ...env }),
    dire: (line) => void lines.push(line),
    appairer: () => assert.fail("une station d'essai n'affiche aucun code"),
    pasMs: 20,
    veilleMs: 20,
    relanceMs: 50,
    surIssue: (issue) => void issues.push(issue),
  });
  t.after(() => heldOne.arreter());
  return { tenue: heldOne, issues, dit: () => lines.join("\n") };
}

test("l'app et le runtime s'accordent sur la ligne de relance", () => {
  assert.equal(LINE_OF_RELAUNCH.source, LINE_OF_RUNTIME.source);
});

test("l'app donne à la station sa source de mise à jour et la relance par l'app — une source déjà dite est gardée, la relance ne se change pas", () => {
  assert.deepEqual(environmentOfTheStation({ A: "1" }), { BRIGADE_MISE_A_JOUR_SOURCE: "github:benomite/brigade", A: "1", BRIGADE_STATION_RELANCE: "app" });
  assert.deepEqual(environmentOfTheStation({ BRIGADE_MISE_A_JOUR_SOURCE: "/essai", BRIGADE_STATION_RELANCE: "box" }), { BRIGADE_MISE_A_JOUR_SOURCE: "/essai", BRIGADE_STATION_RELANCE: "app" });
});

test("la station écrit sa demande de relance : l'app ne relance que son process, sur le main.ts de la release", { skip: WITHOUT_POSIX }, async (t) => {
  const ordi = oneComputer(t);
  const main = principalOf(ordi.versions, RELEASE, ordi.dossierDuRuntime);
  set(ordi.paquet, "1.0.91", station(ligneDeRelance({ version: RELEASE, runtime: ordi.dossierDuRuntime(RELEASE), main, from: "1.0.91", at: "2026-11-04T10:00:00.000Z" })));
  // La fausse release, telle que la mise à jour de la station la pose.
  set(ordi.dossierDuRuntime(RELEASE), RELEASE, station(null));

  const { tenue: heldOne, issues, dit: said } = hold(t, ordi, {});
  await jusqua(() => issues.length > 0);

  assert.equal(issues[0]?.quoi, "passee");
  assert.equal(heldOne.version(), RELEASE);
  assert.equal(heldOne.tourne(), true);
  // La station relancée écrit sa ligne après l'issue `passee` : on attend le fait avant de l'asserter.
  const variablesOfTheRelaunched = new RegExp(`variables ${RELEASE.replace(/[+.]/g, "\\$&")} : github:benomite/brigade app`);
  await jusqua(() => variablesOfTheRelaunched.test(said()));
  // Les deux variables sont celles que les deux stations ont reçues.
  assert.match(said(), /variables 1\.0\.91 : github:benomite\/brigade app/);
  assert.match(said(), variablesOfTheRelaunched);
});

test("un point d'entrée que l'app ne tient pas n'est pas lancé", { skip: WITHOUT_POSIX }, async (t) => {
  const ordi = oneComputer(t);
  set(ordi.paquet, "1.0.91", station(ligneDeRelance({ version: RELEASE, runtime: "/tmp", main: "/tmp/ailleurs/main.ts", from: "1.0.91", at: "2026-11-04T10:00:00.000Z" })));
  const { tenue: heldOne, issues, dit: said } = hold(t, ordi, {});
  await jusqua(() => said().includes("from an entry point the app does not hold"));
  assert.equal(issues.length, 0);
  assert.equal(heldOne.version(), "1.0.91");
});
