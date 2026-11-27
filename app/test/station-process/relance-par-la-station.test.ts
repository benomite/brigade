// La station demande sa relance par la ligne que sa mise à jour écrit (#2287, #2189) : l'app, qui la
// lit, relance seul son process sur le point d'entrée de la release, avec les mêmes variables.
// De vrais process, contre une fausse release que la station d'essai « a téléchargée ».
import assert from "node:assert/strict";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { test, type TestContext } from "node:test";
import { jusqua, repertoireTemporaire } from "../../../runtime/test/outils.ts";
import { LIGNE_DE_RELANCE as LIGNE_DU_RUNTIME, ligneDeRelance } from "../../../runtime/src/station-update/mettre-a-jour.ts";
import { PRINCIPAL } from "../../src/poste/role.ts";
import { environnementDeLaStation, LIGNE_DE_RELANCE, principalDe, tenirProcessDeStation, type Issue } from "../../src/station-process/superviseur.ts";
import { CACHE_DE_COMPILATION } from "../aides/cache-de-compilation.ts";
import { SANS_POSIX } from "../aides/posix.ts";

const RELEASE = "0.20261104.120000+gabcdef0";

// Une station d'essai : elle dit sa version dans `en-service`, ses deux variables, et — si on le lui demande —
// la ligne de relance de la vraie.
const station = (ligne: string | null) => `import { readFileSync, renameSync, writeFileSync } from "node:fs";
import { join } from "node:path";
const racine = process.env.BRIGADE_STATION_DIR;
const { version } = JSON.parse(readFileSync(join(import.meta.dirname, "../../package.json"), "utf8"));
const fichier = join(racine, "en-service");
writeFileSync(fichier + "." + process.pid, JSON.stringify({ version, pid: process.pid, depuis: new Date().toISOString(), servis: [], refuses: {} }));
renameSync(fichier + "." + process.pid, fichier);
console.log("variables " + version + " : " + process.env.BRIGADE_MISE_A_JOUR_SOURCE + " " + process.env.BRIGADE_STATION_RELANCE);
${ligne === null ? "" : `console.log(${JSON.stringify(ligne)});`}
const veille = setInterval(() => {}, 60_000);
process.on("SIGTERM", () => { clearInterval(veille); process.exit(0); });
`;

function poser(dossier: string, version: string, corps: string): void {
  mkdirSync(join(dossier, "src", "station"), { recursive: true });
  writeFileSync(join(dossier, "package.json"), `${JSON.stringify({ name: "brigade-runtime", version })}\n`);
  writeFileSync(join(dossier, PRINCIPAL), corps);
}

function unOrdinateur(t: TestContext) {
  const machine = repertoireTemporaire(t);
  const racine = join(machine, "station");
  const versions = join(racine, "station-update", "releases");
  const dossierDuRuntime = (version: string) => join(versions, version, "runtime");
  const embarque = join(machine, "paquet", "runtime", PRINCIPAL);
  return { racine, versions, dossierDuRuntime, embarque, paquet: join(machine, "paquet", "runtime") };
}

function tenir(t: TestContext, ordi: ReturnType<typeof unOrdinateur>, env: Record<string, string | undefined>) {
  const lignes: string[] = [];
  const issues: Issue[] = [];
  const tenue = tenirProcessDeStation({
    node: process.execPath,
    embarque: ordi.embarque,
    versions: ordi.versions,
    dossierDuRuntime: ordi.dossierDuRuntime,
    racine: ordi.racine,
    env: environnementDeLaStation({ PATH: process.env.PATH, ...CACHE_DE_COMPILATION, ...env }),
    dire: (ligne) => void lignes.push(ligne),
    appairer: () => assert.fail("une station d'essai n'affiche aucun code"),
    pasMs: 20,
    veilleMs: 20,
    relanceMs: 50,
    surIssue: (issue) => void issues.push(issue),
  });
  t.after(() => tenue.arreter());
  return { tenue, issues, dit: () => lignes.join("\n") };
}

test("l'app et le runtime s'accordent sur la ligne de relance", () => {
  assert.equal(LIGNE_DE_RELANCE.source, LIGNE_DU_RUNTIME.source);
});

test("l'app donne à la station sa source de mise à jour et la relance par l'app — une source déjà dite est gardée, la relance ne se change pas", () => {
  assert.deepEqual(environnementDeLaStation({ A: "1" }), { BRIGADE_MISE_A_JOUR_SOURCE: "github:benomite/brigade", A: "1", BRIGADE_STATION_RELANCE: "app" });
  assert.deepEqual(environnementDeLaStation({ BRIGADE_MISE_A_JOUR_SOURCE: "/essai", BRIGADE_STATION_RELANCE: "box" }), { BRIGADE_MISE_A_JOUR_SOURCE: "/essai", BRIGADE_STATION_RELANCE: "app" });
});

test("la station écrit sa demande de relance : l'app ne relance que son process, sur le main.ts de la release", { skip: SANS_POSIX }, async (t) => {
  const ordi = unOrdinateur(t);
  const main = principalDe(ordi.versions, RELEASE, ordi.dossierDuRuntime);
  poser(ordi.paquet, "1.0.91", station(ligneDeRelance({ version: RELEASE, runtime: ordi.dossierDuRuntime(RELEASE), main, from: "1.0.91", at: "2026-11-04T10:00:00.000Z" })));
  // La fausse release, telle que la mise à jour de la station la pose.
  poser(ordi.dossierDuRuntime(RELEASE), RELEASE, station(null));

  const { tenue, issues, dit } = tenir(t, ordi, {});
  await jusqua(() => issues.length > 0);

  assert.equal(issues[0]?.quoi, "passee");
  assert.equal(tenue.version(), RELEASE);
  assert.equal(tenue.tourne(), true);
  // La station relancée écrit sa ligne après l'issue `passee` : on attend le fait avant de l'asserter.
  const variablesDeLaRelancee = new RegExp(`variables ${RELEASE.replace(/[+.]/g, "\\$&")} : github:benomite/brigade app`);
  await jusqua(() => variablesDeLaRelancee.test(dit()));
  // Les deux variables sont celles que les deux stations ont reçues.
  assert.match(dit(), /variables 1\.0\.91 : github:benomite\/brigade app/);
  assert.match(dit(), variablesDeLaRelancee);
});

test("un point d'entrée que l'app ne tient pas n'est pas lancé", { skip: SANS_POSIX }, async (t) => {
  const ordi = unOrdinateur(t);
  poser(ordi.paquet, "1.0.91", station(ligneDeRelance({ version: RELEASE, runtime: "/tmp", main: "/tmp/ailleurs/main.ts", from: "1.0.91", at: "2026-11-04T10:00:00.000Z" })));
  const { tenue, issues, dit } = tenir(t, ordi, {});
  await jusqua(() => dit().includes("from an entry point the app does not hold"));
  assert.equal(issues.length, 0);
  assert.equal(tenue.version(), "1.0.91");
});
