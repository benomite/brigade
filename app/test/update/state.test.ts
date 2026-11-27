// La mise à jour de l'app installée (mise-a-jour/etat.ts) : ses états — à jour, disponible, en
// téléchargement, prête, en erreur —, « installer maintenant », et l'installation au lancement
// suivant. Contre un faux flux local qui répond comme GitHub : ni réseau, ni installeur réel. Sous
// Windows (#1156), le même chemin, sur le `latest.yml` et le setup .exe des mêmes releases.
import assert from "node:assert/strict";
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { test, type TestContext } from "node:test";
import { jusqua, repertoireTemporaire } from "../../../runtime/test/outils.ts";
import { FAILURE, READY, holdUpdate, type StateOfUpdate, type OptionsUpdate, type Ready } from "../../src/update/state.ts";
import { fluxGitHub, WINDOWS, type Flux } from "../../src/update/flux.ts";
import { nameOfSetup, oneFakeFlux, oneAddressSilent, ymlOf } from "./fake-flux.ts";

const DMG = Buffer.alloc(300_000, 7);
const EXE = Buffer.alloc(400_000, 9);
// Ce que l'installeur reçoit, dit par ce qu'il est : l'installeur publié de chaque poste, ou son chemin.
const published = (path: string) => (readFileSync(path).equals(DMG) ? "le dmg publié" : readFileSync(path).equals(EXE) ? "le setup publié" : path);

// L'app installée, en version `version`, sur un flux : ses états dans l'ordre, ce qu'elle a donné à
// l'installeur, et combien de fois elle s'est fermée.
function oneApp(t: TestContext, flux: Flux, others: Partial<OptionsUpdate> & { dossier?: string } = {}) {
  const folder = others.dossier ?? join(repertoireTemporaire(t), "mise-a-jour");
  const states: StateOfUpdate[] = [];
  const installed: Ready[] = [];
  let closings = 0;
  const update = holdUpdate({
    version: "1.0.0",
    flux,
    dossier: folder,
    installable: () => undefined,
    installer: (ready) => void installed.push({ ...ready, installeur: published(ready.installeur) }),
    quitter: () => void closings++,
    surEtat: (state) => void states.push(state),
    ...others,
  });
  t.after(() => update.fermer());
  return { miseAJour: update, dossier: folder, etats: states, installees: installed, fermetures: () => closings, noms: () => [...new Set(states.map(({ etat: state }) => state))] };
}

const onThe = (address: string) => fluxGitHub({ api: address, telechargements: address, delaiMs: 60_000 });
// Le même flux, lu par l'app de Windows.
const underWindows = (address: string) => fluxGitHub({ api: address, telechargements: address, delaiMs: 60_000, format: WINDOWS });

test("lancée depuis le dépôt, l'app ne regarde aucune version : le flux n'est jamais lu", async (t) => {
  let readings = 0;
  const flux: Flux = { nom: "un flux", nouvelle: async () => void readings++ };
  const { miseAJour: update, etats: states } = oneApp(t, flux, { inactive: "launched from the repository, it updates through its clone" });
  assert.equal(update.auLancement(), false);
  update.demarrer();
  assert.deepEqual(await update.verifier(), { etat: "inactive", version: "1.0.0", raison: "launched from the repository, it updates through its clone" });
  assert.deepEqual(await update.installerMaintenant(), { refus: "this app does not update itself here: launched from the repository, it updates through its clone" });
  assert.equal(readings, 0);
  assert.deepEqual(states, []);
});

test("rien de plus haut publié : l'app est à jour, à l'heure de la vérification", async (t) => {
  const fake = await oneFakeFlux(t, { "1.0.0": { dmg: DMG } });
  const { miseAJour: update, etats: states } = oneApp(t, onThe(fake.adresse), { maintenant: () => new Date("2026-10-19T12:00:00Z") });
  assert.deepEqual(await update.verifier(), { etat: "a-jour", version: "1.0.0", verifieeLe: "2026-10-19T12:00:00.000Z" });
  assert.deepEqual(states.map(({ etat: state }) => state), ["verification", "a-jour"]);
});

test("une version plus haute est annoncée avec son numéro, téléchargée, vérifiée, puis prête", async (t) => {
  const fake = await oneFakeFlux(t, { "1.0.0": { dmg: Buffer.from("a") }, "1.1.0": { dmg: DMG } });
  const app = oneApp(t, onThe(fake.adresse));
  // La vérification rend l'état où elle laisse l'app : le téléchargement est parti.
  assert.equal((await app.miseAJour.verifier()).etat, "telechargement");
  assert.deepEqual(app.etats[1], { etat: "disponible", version: "1.0.0", nouvelle: "1.1.0" });
  await jusqua(() => app.miseAJour.vu().etat !== "telechargement");
  assert.deepEqual(app.miseAJour.vu(), { etat: "prete", version: "1.0.0", nouvelle: "1.1.0" });
  assert.deepEqual(app.noms(), ["verification", "disponible", "telechargement", "prete"]);
  // Le téléchargement se dit par pour-cent gagné, jusqu'au dernier octet.
  const receivedOnes = app.etats.flatMap((state) => (state.etat === "telechargement" ? [state] : []));
  assert.deepEqual(receivedOnes[0], { etat: "telechargement", version: "1.0.0", nouvelle: "1.1.0", recus: 0, taille: DMG.length });
  assert.equal(receivedOnes.at(-1)?.recus, DMG.length);
  assert.ok(receivedOnes.length <= 102);
  assert.deepEqual(readdirSync(app.dossier).sort(), ["Brigade-1.1.0-arm64.dmg", READY]);
  assert.ok(readFileSync(join(app.dossier, "Brigade-1.1.0-arm64.dmg")).equals(DMG));
  // Prête, la version ne se relit plus : rien ne repart.
  const requests = fake.demandes.length;
  assert.equal((await app.miseAJour.verifier()).etat, "prete");
  assert.equal(fake.demandes.length, requests);
});

test("un .dmg qui n'a pas l'empreinte publiée n'est jamais prêt", async (t) => {
  const fake = await oneFakeFlux(t, { "1.1.0": { dmg: DMG, yml: ymlOf("1.1.0", Buffer.alloc(DMG.length, 8)) } });
  const app = oneApp(t, onThe(fake.adresse));
  await app.miseAJour.verifier();
  await jusqua(() => app.miseAJour.vu().etat === "erreur");
  assert.deepEqual(app.miseAJour.vu(), { etat: "erreur", version: "1.0.0", nouvelle: "1.1.0", raison: "the update 1.1.0 could not be downloaded: its sha512 is not the published one" });
  assert.deepEqual(readdirSync(app.dossier), []);
});

test("un flux injoignable ne retient rien : l'app dit l'erreur, et la vérification suivante réessaie", async (t) => {
  const app = oneApp(t, onThe(await oneAddressSilent()));
  assert.equal(app.miseAJour.auLancement(), false);
  const state = await app.miseAJour.verifier();
  assert.equal(state.etat, "erreur");
  assert.match(state.etat === "erreur" ? state.raison : "", /^the update feed \(the releases of benomite\/brigade\) could not be read: /);
  assert.equal((await app.miseAJour.verifier()).etat, "erreur");
  assert.deepEqual(app.etats.map(({ etat: state }) => state), ["verification", "erreur", "verification", "erreur"]);
});

test("une app qui ne pourrait pas se remplacer le dit, et ne télécharge rien", async (t) => {
  const fake = await oneFakeFlux(t, { "1.1.0": { dmg: DMG } });
  const app = oneApp(t, onThe(fake.adresse), { installable: () => "this account cannot write to /Applications" });
  assert.deepEqual(await app.miseAJour.verifier(), { etat: "erreur", version: "1.0.0", nouvelle: "1.1.0", raison: "the update 1.1.0 cannot be installed: this account cannot write to /Applications" });
  assert.equal(fake.demandes.some((path) => path.endsWith(".dmg")), false);
});

test("« installer maintenant » télécharge ce qui manque, lance l'installeur et ferme l'app", async (t) => {
  const fake = await oneFakeFlux(t, { "1.1.0": { dmg: DMG } });
  const app = oneApp(t, onThe(fake.adresse));
  assert.equal(await app.miseAJour.installerMaintenant(), undefined);
  assert.deepEqual(app.installees, [{ version: "1.1.0", installeur: "le dmg publié" }]);
  assert.equal(app.fermetures(), 1);
  assert.deepEqual(app.miseAJour.vu(), { etat: "installation", version: "1.0.0", nouvelle: "1.1.0" });
  assert.deepEqual(app.noms(), ["verification", "disponible", "telechargement", "prete", "installation"]);
  // L'installeur part une fois : rouverte, l'app ne le relance pas d'elle-même.
  assert.equal(existsSync(join(app.dossier, READY)), false);
});

test("« installer maintenant » sur une version prête l'installe sans rien relire", async (t) => {
  const fake = await oneFakeFlux(t, { "1.1.0": { dmg: DMG } });
  const app = oneApp(t, onThe(fake.adresse));
  await app.miseAJour.verifier();
  await jusqua(() => app.miseAJour.vu().etat === "prete");
  const requests = fake.demandes.length;
  assert.equal(await app.miseAJour.installerMaintenant(), undefined);
  assert.equal(fake.demandes.length, requests);
  assert.equal(app.installees.length, 1);
});

test("« installer maintenant » sur une app à jour, ou dont l'installeur ne part pas, dit pourquoi elle reste", async (t) => {
  const fake = await oneFakeFlux(t, { "1.0.0": { dmg: DMG } });
  const aDay = oneApp(t, onThe(fake.adresse));
  assert.deepEqual(await aDay.miseAJour.installerMaintenant(), { refus: "this app is up to date (1.0.0): nothing to install" });
  assert.equal(aDay.fermetures(), 0);

  fake.publications.set("1.1.0", { dmg: DMG });
  const blocked = oneApp(t, onThe(fake.adresse), {
    installer: () => {
      throw new Error("spawn /bin/sh ENOENT");
    },
  });
  assert.deepEqual(await blocked.miseAJour.installerMaintenant(), { refus: "the update 1.1.0 could not be installed: spawn /bin/sh ENOENT" });
  assert.equal(blocked.fermetures(), 0);
  assert.equal(blocked.miseAJour.vu().etat, "erreur");
});

test("sans geste du chef, la version prête s'installe au lancement suivant, avant que rien ne démarre", async (t) => {
  const fake = await oneFakeFlux(t, { "1.1.0": { dmg: DMG } });
  const before = oneApp(t, onThe(fake.adresse));
  await before.miseAJour.verifier();
  await jusqua(() => before.miseAJour.vu().etat === "prete");
  before.miseAJour.fermer();

  // Relancée : rien n'est relu, l'installeur part, et c'est à l'app de se fermer sans s'ouvrir.
  const requests = fake.demandes.length;
  const after = oneApp(t, onThe(fake.adresse), { dossier: before.dossier });
  assert.equal(after.miseAJour.auLancement(), true);
  assert.deepEqual(after.installees, [{ version: "1.1.0", installeur: "le dmg publié" }]);
  assert.deepEqual(after.miseAJour.vu(), { etat: "installation", version: "1.0.0", nouvelle: "1.1.0" });
  assert.equal(after.fermetures(), 0);
  assert.equal(fake.demandes.length, requests);
});

test("rouverte sur la nouvelle version, l'app n'installe rien et range ce qui traîne", (t) => {
  const folder = join(repertoireTemporaire(t), "mise-a-jour");
  mkdirSync(folder);
  writeFileSync(join(folder, "Brigade-1.0.0-arm64.dmg"), DMG);
  writeFileSync(join(folder, READY), JSON.stringify({ version: "1.0.0", installeur: "Brigade-1.0.0-arm64.dmg" }));
  const app = oneApp(t, { nom: "un flux", nouvelle: async () => undefined }, { dossier: folder });
  assert.equal(app.miseAJour.auLancement(), false);
  assert.deepEqual(app.installees, []);
  assert.deepEqual(readdirSync(folder), []);
});

test("un installeur qui a échoué : l'app rouverte le dit, sans relancer l'installation ni relire tout de suite", async (t) => {
  const folder = join(repertoireTemporaire(t), "mise-a-jour");
  mkdirSync(folder);
  writeFileSync(join(folder, FAILURE), "the new version is not correctly signed\n");
  writeFileSync(join(folder, "Brigade-1.1.0-arm64.dmg"), DMG);
  let readings = 0;
  const app = oneApp(t, { nom: "un flux", nouvelle: async () => void readings++ }, { dossier: folder });
  assert.equal(app.miseAJour.auLancement(), false);
  app.miseAJour.demarrer();
  assert.deepEqual(app.miseAJour.vu(), { etat: "erreur", version: "1.0.0", raison: "the last update could not be installed: the new version is not correctly signed" });
  assert.equal(readings, 0);
  assert.deepEqual(readdirSync(folder), []);
  // La vue peut demander la vérification plus tôt.
  assert.equal((await app.miseAJour.verifier()).etat, "a-jour");
});

test("au lancement puis à chaque cadence, l'app relit le flux", async (t) => {
  let readings = 0;
  const app = oneApp(t, { nom: "un flux", nouvelle: async () => void readings++ }, { cadenceMs: 20 });
  app.miseAJour.demarrer();
  app.miseAJour.demarrer();
  await jusqua(() => readings >= 3);
  assert.equal(app.miseAJour.vu().etat, "a-jour");
});

test("sous Windows, une version plus haute traverse les mêmes états que sur le Mac, sur son setup .exe, jusqu'à l'installeur", async (t) => {
  const fake = await oneFakeFlux(t, { "1.0.0": { dmg: Buffer.from("a"), exe: Buffer.from("b") }, "1.1.0": { dmg: DMG, exe: EXE } });
  const mac = oneApp(t, onThe(fake.adresse));
  const pc = oneApp(t, underWindows(fake.adresse));
  assert.equal(await mac.miseAJour.installerMaintenant(), undefined);
  assert.equal(await pc.miseAJour.installerMaintenant(), undefined);
  // Les mêmes états, dans le même ordre, avec les mêmes valeurs — seule la taille de l'installeur change.
  const withoutSize = (states: StateOfUpdate[]) => states.filter(({ etat: state }) => state !== "telechargement");
  assert.deepEqual(withoutSize(pc.etats), withoutSize(mac.etats));
  assert.deepEqual(pc.noms(), ["verification", "disponible", "telechargement", "prete", "installation"]);
  assert.deepEqual(pc.etats.find(({ etat: state }) => state === "telechargement"), { etat: "telechargement", version: "1.0.0", nouvelle: "1.1.0", recus: 0, taille: EXE.length });
  // L'installeur de Windows reçoit le setup publié, vérifié ; l'app se ferme.
  assert.deepEqual(pc.installees, [{ version: "1.1.0", installeur: "le setup publié" }]);
  assert.equal(pc.fermetures(), 1);
  assert.ok(fake.demandes.includes(`/benomite/brigade/releases/download/app-v1.1.0/${nameOfSetup("1.1.0")}`));
  assert.ok(fake.demandes.includes("/benomite/brigade/releases/download/app-v1.1.0/latest.yml"));
});

test("sous Windows, un setup qui n'a pas l'empreinte publiée n'est jamais prêt : l'app reste sur sa version et dit l'erreur", async (t) => {
  const fake = await oneFakeFlux(t, { "1.1.0": { exe: EXE, ymlExe: ymlOf("1.1.0", Buffer.alloc(EXE.length, 8), nameOfSetup("1.1.0")) } });
  const app = oneApp(t, underWindows(fake.adresse));
  await app.miseAJour.verifier();
  await jusqua(() => app.miseAJour.vu().etat === "erreur");
  assert.deepEqual(app.miseAJour.vu(), { etat: "erreur", version: "1.0.0", nouvelle: "1.1.0", raison: "the update 1.1.0 could not be downloaded: its sha512 is not the published one" });
  assert.deepEqual(readdirSync(app.dossier), []);
  assert.deepEqual(await app.miseAJour.installerMaintenant(), { refus: "the update 1.1.0 could not be downloaded: its sha512 is not the published one" });
  assert.deepEqual(app.installees, []);
  assert.equal(app.fermetures(), 0);
});

test("sous Windows, un flux injoignable ne retient rien : l'app dit l'erreur, comme sur le Mac", async (t) => {
  const app = oneApp(t, underWindows(await oneAddressSilent()));
  const state = await app.miseAJour.verifier();
  assert.match(state.etat === "erreur" ? state.raison : "", /^the update feed \(the releases of benomite\/brigade\) could not be read: /);
  // « Install now » relit le flux, et dit pourquoi l'app reste sur sa version.
  const rendered = await app.miseAJour.installerMaintenant();
  assert.match(rendered?.refus ?? "", /^the update feed \(the releases of benomite\/brigade\) could not be read: /);
  assert.deepEqual(app.installees, []);
  assert.equal(app.fermetures(), 0);
});

test("une release qui ne porte que l'installeur du Mac n'est pas une nouvelle version pour Windows, ni l'inverse", async (t) => {
  const fake = await oneFakeFlux(t, { "1.1.0": { exe: EXE }, "1.2.0": { dmg: DMG } });
  assert.equal((await underWindows(fake.adresse).nouvelle("1.0.0"))?.version, "1.1.0");
  assert.equal((await onThe(fake.adresse).nouvelle("1.0.0"))?.version, "1.2.0");
  assert.equal(await onThe(fake.adresse).nouvelle("1.2.0"), undefined);
  assert.equal(await underWindows(fake.adresse).nouvelle("1.1.0"), undefined);
});
