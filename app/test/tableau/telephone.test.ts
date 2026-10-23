// Le tableau de la cuisine lu par le téléphone (app/android/web/lecture.ts, `lireLeTableauDuTelephone`) : le module du
// desktop, posé par la construction de l'APK à côté de la vue (app/packaging/android.ts, `poserLesModules`) avec le
// lecteur du runtime, joué ici tel qu'il est posé — sans types —, contre un faux pont natif : le coffre qui garde le
// jeton GitHub (Coffre.java) et le HTTP natif, qui rend ce que GitHub rend.
import assert from "node:assert/strict";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { test, type TestContext } from "node:test";
import type * as Lecture from "../../android/web/lecture.ts";
import { poserLesModules } from "../../packaging/android.ts";
import { GENERE_LE, ISSUE, TABLEAU } from "./fixture.ts";

// La lecture du téléphone, posée comme pour l'APK, et chargée de là.
async function posee(t: TestContext): Promise<{ www: string; poses: string[]; module: typeof Lecture }> {
  const dossier = mkdtempSync(join(tmpdir(), "brigade-app-tableau-"));
  t.after(() => rmSync(dossier, { recursive: true, force: true }));
  const www = join(dossier, "www");
  const poses = poserLesModules(www);
  return { www, poses, module: (await import(pathToFileURL(join(www, "android", "lecture.js")).href)) as typeof Lecture };
}

type Appel = { plugin: string; methode: string; options: Record<string, unknown> };
// Un pont natif : le coffre rend ce jeton (ou lève), le HTTP rend cette réponse (ou lève).
function natif(jeton: { valeur?: string } | Error, http: unknown): { natif: Lecture.Natif; appels: Appel[] } {
  const appels: Appel[] = [];
  return {
    appels,
    natif: async (plugin, methode, options) => {
      appels.push({ plugin, methode, options });
      if (plugin === "Coffre" && methode === "lire") {
        if (jeton instanceof Error) throw jeton;
        return jeton;
      }
      if (plugin === "CapacitorHttp" && methode === "request") {
        if (http instanceof Error) throw http;
        return http;
      }
      throw new Error(`${plugin}.${methode} is not implemented`);
    },
  };
}

const LU_LE = new Date(GENERE_LE.getTime() + 125_000);

test("la construction de l'APK pose la lecture du tableau et le lecteur du runtime, sans le jeton du desktop", async (t) => {
  const { www, poses } = await posee(t);
  for (const attendu of ["src/tableau/lecture.js", "src/tableau/client.js", "runtime/src/tableau/rendu/bloc.js"]) assert.ok(poses.includes(attendu), attendu);
  assert.ok(!poses.includes("src/tableau/jeton-gh.js"), "le `gh` du desktop n'est pas sur le téléphone");
  // Les imports de la lecture du tableau tiennent dans `www` : rien n'en sort.
  assert.match(readFileSync(join(www, "src", "tableau", "lecture.js"), "utf8"), /from "\.\.\/\.\.\/runtime\/src\/tableau\/rendu\/bloc\.js"/);
  assert.ok(existsSync(join(www, "runtime", "src", "tableau", "rendu", "bloc.js")));
});

test("le téléphone lit le tableau de GitHub, avec le jeton de son coffre : la file, l'état, et l'âge de la lecture", async (t) => {
  const { module } = await posee(t);
  const { natif: pont, appels } = natif({ valeur: "gho_du_coffre" }, { status: 200, headers: {}, data: [ISSUE] });
  const lecture = await module.lireLeTableauDuTelephone("chef/parade", { natif: pont, maintenant: () => LU_LE });
  assert.ok(lecture.lu, lecture.lu ? "" : lecture.raison);
  assert.deepEqual(lecture.file, TABLEAU.file);
  assert.deepEqual(lecture.cuisine, TABLEAU.cuisine);
  assert.equal(lecture.age, 125);
  assert.deepEqual(appels[0], { plugin: "Coffre", methode: "lire", options: { cle: module.CLE_DU_JETON_GITHUB } });
  const demande = appels.find(({ plugin }) => plugin === "CapacitorHttp")?.options;
  assert.match(String(demande?.url), /^https:\/\/api\.github\.com\/repos\/chef\/parade\/issues\?labels=kitchen-board&state=open/);
  assert.equal(demande?.method, "GET");
  assert.equal((demande?.headers as Record<string, string>).Authorization, "Bearer gho_du_coffre");
});

test("sur le téléphone, un coffre vide ou qui refuse laisse partir la demande sans jeton ; un corps en texte se lit en JSON", async (t) => {
  const { module } = await posee(t);
  for (const jeton of [{}, new Error("the phone's keystore is locked")]) {
    const { natif: pont, appels } = natif(jeton, { status: 200, headers: {}, data: JSON.stringify([ISSUE]) });
    const lecture = await module.lireLeTableauDuTelephone("chef/parade", { natif: pont, maintenant: () => LU_LE });
    assert.ok(lecture.lu, lecture.lu ? "" : lecture.raison);
    assert.equal((appels.find(({ plugin }) => plugin === "CapacitorHttp")?.options.headers as Record<string, string>).Authorization, undefined);
  }
});

test("sur le téléphone, GitHub injoignable ou qui refuse : un échec en une phrase, jamais une file vide", async (t) => {
  const { module } = await posee(t);
  const injoignable = await module.lireLeTableauDuTelephone("chef/parade", { natif: natif({}, new Error("Unable to resolve host \"api.github.com\"")).natif, maintenant: () => LU_LE });
  assert.deepEqual(injoignable, { lu: false, depot: "chef/parade", luLe: LU_LE.toISOString(), raison: 'GitHub could not be reached to read the Kitchen board of chef/parade: Unable to resolve host "api.github.com".' });
  const prive = await module.lireLeTableauDuTelephone("chef/parade", { natif: natif({}, { status: 404, headers: {}, data: { message: "Not Found" } }).natif, maintenant: () => LU_LE });
  assert.equal(prive.lu, false);
  assert.match(prive.lu ? "" : prive.raison, /^GitHub does not show chef\/parade \(HTTP 404\)/);
  const muet = await module.lireLeTableauDuTelephone("chef/parade", { natif: natif({}, null).natif, maintenant: () => LU_LE });
  assert.equal(muet.lu ? "" : muet.raison, "GitHub could not be reached to read the Kitchen board of chef/parade: the phone's HTTP returned no answer.");
});

// Une décision du chef, postée par le téléphone sur l'issue du tableau (#1590) : par le HTTP natif, avec le jeton du coffre.
const VISE = { depot: "chef/parade", numero: 7, tickets: new Set([18, 21]) };

test("le téléphone poste une décision sur le tableau : un POST natif, son corps en JSON, avec le jeton du coffre", async (t) => {
  const { module, poses } = await posee(t);
  assert.ok(poses.includes("src/tableau-gestes/github.js") && poses.includes("src/tableau-gestes/gestes.js"));
  const { natif: pont, appels } = natif({ valeur: "gho_du_coffre" }, { status: 201, headers: {}, data: { id: 4242, html_url: "https://github.com/chef/parade/issues/7#issuecomment-4242" } });
  const etat = await module.gesteDuTelephone(VISE, { geste: "merge", ticket: 18 }, { natif: pont });
  assert.deepEqual(etat, { etat: "pending", commentaire: { id: 4242, url: "https://github.com/chef/parade/issues/7#issuecomment-4242" } });
  const demande = appels.find(({ plugin }) => plugin === "CapacitorHttp")?.options;
  assert.equal(demande?.url, "https://api.github.com/repos/chef/parade/issues/7/comments");
  assert.equal(demande?.method, "POST");
  assert.deepEqual(demande?.data, { body: "/brigade merge #18" });
  assert.equal((demande?.headers as Record<string, string>).Authorization, "Bearer gho_du_coffre");
  assert.equal((demande?.headers as Record<string, string>)["Content-Type"], "application/json");
});

test("sur le téléphone, un ticket hors de la dernière lecture, ou GitHub qui refuse : rien n'est posté, une phrase le dit", async (t) => {
  const { module } = await posee(t);
  const hors = natif({ valeur: "gho_du_coffre" }, { status: 201, headers: {}, data: { id: 1 } });
  const ailleurs = await module.gesteDuTelephone(VISE, { geste: "merge", ticket: 99 }, { natif: hors.natif });
  assert.equal(ailleurs.etat, "failed");
  assert.equal(hors.appels.some(({ plugin }) => plugin === "CapacitorHttp"), false);
  const refuse = await module.gesteDuTelephone(VISE, { geste: "set-aside", ticket: 21 }, { natif: natif({}, { status: 404, headers: {}, data: { message: "Not Found" } }).natif });
  assert.deepEqual(refuse, { etat: "failed", raison: "The gesture could not be posted on the Kitchen board of chef/parade: GitHub refused the comment (HTTP 404): Not Found." });
});
