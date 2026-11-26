// La mise à jour de l'app installée (mise-a-jour/etat.ts) : ses états — à jour, disponible, en
// téléchargement, prête, en erreur —, « installer maintenant », et l'installation au lancement
// suivant. Contre un faux flux local qui répond comme GitHub : ni réseau, ni installeur réel. Sous
// Windows (#1156), le même chemin, sur le `latest.yml` et le setup .exe des mêmes releases.
import assert from "node:assert/strict";
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { test, type TestContext } from "node:test";
import { jusqua, repertoireTemporaire } from "../../../runtime/test/outils.ts";
import { FAILURE, PRETE, holdUpdate, type StateDeUpdate, type OptionsUpdate, type Prete } from "../../src/update/state.ts";
import { fluxGitHub, WINDOWS, type Flux } from "../../src/update/flux.ts";
import { nameDuSetup, unFauxFlux, uneAdresseMuette, ymlDe } from "./faux-flux.ts";

const DMG = Buffer.alloc(300_000, 7);
const EXE = Buffer.alloc(400_000, 9);
// Ce que l'installeur reçoit, dit par ce qu'il est : l'installeur publié de chaque poste, ou son chemin.
const published = (chemin: string) => (readFileSync(chemin).equals(DMG) ? "le dmg publié" : readFileSync(chemin).equals(EXE) ? "le setup publié" : chemin);

// L'app installée, en version `version`, sur un flux : ses états dans l'ordre, ce qu'elle a donné à
// l'installeur, et combien de fois elle s'est fermée.
function uneApp(t: TestContext, flux: Flux, autres: Partial<OptionsUpdate> & { dossier?: string } = {}) {
  const dossier = autres.dossier ?? join(repertoireTemporaire(t), "mise-a-jour");
  const states: StateDeUpdate[] = [];
  const installees: Prete[] = [];
  let closings = 0;
  const update = holdUpdate({
    version: "1.0.0",
    flux,
    dossier,
    installable: () => undefined,
    installer: (prete) => void installees.push({ ...prete, installeur: published(prete.installeur) }),
    quitter: () => void closings++,
    surEtat: (state) => void states.push(state),
    ...autres,
  });
  t.after(() => update.fermer());
  return { miseAJour: update, dossier, etats: states, installees, fermetures: () => closings, noms: () => [...new Set(states.map(({ etat: state }) => state))] };
}

const surLe = (adresse: string) => fluxGitHub({ api: adresse, telechargements: adresse, delaiMs: 60_000 });
// Le même flux, lu par l'app de Windows.
const sousWindows = (adresse: string) => fluxGitHub({ api: adresse, telechargements: adresse, delaiMs: 60_000, format: WINDOWS });

test("lancée depuis le dépôt, l'app ne regarde aucune version : le flux n'est jamais lu", async (t) => {
  let lectures = 0;
  const flux: Flux = { nom: "un flux", nouvelle: async () => void lectures++ };
  const { miseAJour: update, etats: states } = uneApp(t, flux, { inactive: "launched from the repository, it updates through its clone" });
  assert.equal(update.auLancement(), false);
  update.demarrer();
  assert.deepEqual(await update.verifier(), { etat: "inactive", version: "1.0.0", raison: "launched from the repository, it updates through its clone" });
  assert.deepEqual(await update.installerMaintenant(), { refus: "this app does not update itself here: launched from the repository, it updates through its clone" });
  assert.equal(lectures, 0);
  assert.deepEqual(states, []);
});

test("rien de plus haut publié : l'app est à jour, à l'heure de la vérification", async (t) => {
  const faux = await unFauxFlux(t, { "1.0.0": { dmg: DMG } });
  const { miseAJour: update, etats: states } = uneApp(t, surLe(faux.adresse), { maintenant: () => new Date("2026-10-19T12:00:00Z") });
  assert.deepEqual(await update.verifier(), { etat: "a-jour", version: "1.0.0", verifieeLe: "2026-10-19T12:00:00.000Z" });
  assert.deepEqual(states.map(({ etat: state }) => state), ["verification", "a-jour"]);
});

test("une version plus haute est annoncée avec son numéro, téléchargée, vérifiée, puis prête", async (t) => {
  const faux = await unFauxFlux(t, { "1.0.0": { dmg: Buffer.from("a") }, "1.1.0": { dmg: DMG } });
  const app = uneApp(t, surLe(faux.adresse));
  // La vérification rend l'état où elle laisse l'app : le téléchargement est parti.
  assert.equal((await app.miseAJour.verifier()).etat, "telechargement");
  assert.deepEqual(app.etats[1], { etat: "disponible", version: "1.0.0", nouvelle: "1.1.0" });
  await jusqua(() => app.miseAJour.vu().etat !== "telechargement");
  assert.deepEqual(app.miseAJour.vu(), { etat: "prete", version: "1.0.0", nouvelle: "1.1.0" });
  assert.deepEqual(app.noms(), ["verification", "disponible", "telechargement", "prete"]);
  // Le téléchargement se dit par pour-cent gagné, jusqu'au dernier octet.
  const recus = app.etats.flatMap((state) => (state.etat === "telechargement" ? [state] : []));
  assert.deepEqual(recus[0], { etat: "telechargement", version: "1.0.0", nouvelle: "1.1.0", recus: 0, taille: DMG.length });
  assert.equal(recus.at(-1)?.recus, DMG.length);
  assert.ok(recus.length <= 102);
  assert.deepEqual(readdirSync(app.dossier).sort(), ["Brigade-1.1.0-arm64.dmg", PRETE]);
  assert.ok(readFileSync(join(app.dossier, "Brigade-1.1.0-arm64.dmg")).equals(DMG));
  // Prête, la version ne se relit plus : rien ne repart.
  const demandes = faux.demandes.length;
  assert.equal((await app.miseAJour.verifier()).etat, "prete");
  assert.equal(faux.demandes.length, demandes);
});

test("un .dmg qui n'a pas l'empreinte publiée n'est jamais prêt", async (t) => {
  const faux = await unFauxFlux(t, { "1.1.0": { dmg: DMG, yml: ymlDe("1.1.0", Buffer.alloc(DMG.length, 8)) } });
  const app = uneApp(t, surLe(faux.adresse));
  await app.miseAJour.verifier();
  await jusqua(() => app.miseAJour.vu().etat === "erreur");
  assert.deepEqual(app.miseAJour.vu(), { etat: "erreur", version: "1.0.0", nouvelle: "1.1.0", raison: "the update 1.1.0 could not be downloaded: its sha512 is not the published one" });
  assert.deepEqual(readdirSync(app.dossier), []);
});

test("un flux injoignable ne retient rien : l'app dit l'erreur, et la vérification suivante réessaie", async (t) => {
  const app = uneApp(t, surLe(await uneAdresseMuette()));
  assert.equal(app.miseAJour.auLancement(), false);
  const state = await app.miseAJour.verifier();
  assert.equal(state.etat, "erreur");
  assert.match(state.etat === "erreur" ? state.raison : "", /^the update feed \(the releases of benomite\/brigade\) could not be read: /);
  assert.equal((await app.miseAJour.verifier()).etat, "erreur");
  assert.deepEqual(app.etats.map(({ etat: state }) => state), ["verification", "erreur", "verification", "erreur"]);
});

test("une app qui ne pourrait pas se remplacer le dit, et ne télécharge rien", async (t) => {
  const faux = await unFauxFlux(t, { "1.1.0": { dmg: DMG } });
  const app = uneApp(t, surLe(faux.adresse), { installable: () => "this account cannot write to /Applications" });
  assert.deepEqual(await app.miseAJour.verifier(), { etat: "erreur", version: "1.0.0", nouvelle: "1.1.0", raison: "the update 1.1.0 cannot be installed: this account cannot write to /Applications" });
  assert.equal(faux.demandes.some((chemin) => chemin.endsWith(".dmg")), false);
});

test("« installer maintenant » télécharge ce qui manque, lance l'installeur et ferme l'app", async (t) => {
  const faux = await unFauxFlux(t, { "1.1.0": { dmg: DMG } });
  const app = uneApp(t, surLe(faux.adresse));
  assert.equal(await app.miseAJour.installerMaintenant(), undefined);
  assert.deepEqual(app.installees, [{ version: "1.1.0", installeur: "le dmg publié" }]);
  assert.equal(app.fermetures(), 1);
  assert.deepEqual(app.miseAJour.vu(), { etat: "installation", version: "1.0.0", nouvelle: "1.1.0" });
  assert.deepEqual(app.noms(), ["verification", "disponible", "telechargement", "prete", "installation"]);
  // L'installeur part une fois : rouverte, l'app ne le relance pas d'elle-même.
  assert.equal(existsSync(join(app.dossier, PRETE)), false);
});

test("« installer maintenant » sur une version prête l'installe sans rien relire", async (t) => {
  const faux = await unFauxFlux(t, { "1.1.0": { dmg: DMG } });
  const app = uneApp(t, surLe(faux.adresse));
  await app.miseAJour.verifier();
  await jusqua(() => app.miseAJour.vu().etat === "prete");
  const demandes = faux.demandes.length;
  assert.equal(await app.miseAJour.installerMaintenant(), undefined);
  assert.equal(faux.demandes.length, demandes);
  assert.equal(app.installees.length, 1);
});

test("« installer maintenant » sur une app à jour, ou dont l'installeur ne part pas, dit pourquoi elle reste", async (t) => {
  const faux = await unFauxFlux(t, { "1.0.0": { dmg: DMG } });
  const aDay = uneApp(t, surLe(faux.adresse));
  assert.deepEqual(await aDay.miseAJour.installerMaintenant(), { refus: "this app is up to date (1.0.0): nothing to install" });
  assert.equal(aDay.fermetures(), 0);

  faux.publications.set("1.1.0", { dmg: DMG });
  const blocked = uneApp(t, surLe(faux.adresse), {
    installer: () => {
      throw new Error("spawn /bin/sh ENOENT");
    },
  });
  assert.deepEqual(await blocked.miseAJour.installerMaintenant(), { refus: "the update 1.1.0 could not be installed: spawn /bin/sh ENOENT" });
  assert.equal(blocked.fermetures(), 0);
  assert.equal(blocked.miseAJour.vu().etat, "erreur");
});

test("sans geste du chef, la version prête s'installe au lancement suivant, avant que rien ne démarre", async (t) => {
  const faux = await unFauxFlux(t, { "1.1.0": { dmg: DMG } });
  const avant = uneApp(t, surLe(faux.adresse));
  await avant.miseAJour.verifier();
  await jusqua(() => avant.miseAJour.vu().etat === "prete");
  avant.miseAJour.fermer();

  // Relancée : rien n'est relu, l'installeur part, et c'est à l'app de se fermer sans s'ouvrir.
  const demandes = faux.demandes.length;
  const apres = uneApp(t, surLe(faux.adresse), { dossier: avant.dossier });
  assert.equal(apres.miseAJour.auLancement(), true);
  assert.deepEqual(apres.installees, [{ version: "1.1.0", installeur: "le dmg publié" }]);
  assert.deepEqual(apres.miseAJour.vu(), { etat: "installation", version: "1.0.0", nouvelle: "1.1.0" });
  assert.equal(apres.fermetures(), 0);
  assert.equal(faux.demandes.length, demandes);
});

test("rouverte sur la nouvelle version, l'app n'installe rien et range ce qui traîne", (t) => {
  const dossier = join(repertoireTemporaire(t), "mise-a-jour");
  mkdirSync(dossier);
  writeFileSync(join(dossier, "Brigade-1.0.0-arm64.dmg"), DMG);
  writeFileSync(join(dossier, PRETE), JSON.stringify({ version: "1.0.0", installeur: "Brigade-1.0.0-arm64.dmg" }));
  const app = uneApp(t, { nom: "un flux", nouvelle: async () => undefined }, { dossier });
  assert.equal(app.miseAJour.auLancement(), false);
  assert.deepEqual(app.installees, []);
  assert.deepEqual(readdirSync(dossier), []);
});

test("un installeur qui a échoué : l'app rouverte le dit, sans relancer l'installation ni relire tout de suite", async (t) => {
  const dossier = join(repertoireTemporaire(t), "mise-a-jour");
  mkdirSync(dossier);
  writeFileSync(join(dossier, FAILURE), "the new version is not correctly signed\n");
  writeFileSync(join(dossier, "Brigade-1.1.0-arm64.dmg"), DMG);
  let lectures = 0;
  const app = uneApp(t, { nom: "un flux", nouvelle: async () => void lectures++ }, { dossier });
  assert.equal(app.miseAJour.auLancement(), false);
  app.miseAJour.demarrer();
  assert.deepEqual(app.miseAJour.vu(), { etat: "erreur", version: "1.0.0", raison: "the last update could not be installed: the new version is not correctly signed" });
  assert.equal(lectures, 0);
  assert.deepEqual(readdirSync(dossier), []);
  // La vue peut demander la vérification plus tôt.
  assert.equal((await app.miseAJour.verifier()).etat, "a-jour");
});

test("au lancement puis à chaque cadence, l'app relit le flux", async (t) => {
  let lectures = 0;
  const app = uneApp(t, { nom: "un flux", nouvelle: async () => void lectures++ }, { cadenceMs: 20 });
  app.miseAJour.demarrer();
  app.miseAJour.demarrer();
  await jusqua(() => lectures >= 3);
  assert.equal(app.miseAJour.vu().etat, "a-jour");
});

test("sous Windows, une version plus haute traverse les mêmes états que sur le Mac, sur son setup .exe, jusqu'à l'installeur", async (t) => {
  const faux = await unFauxFlux(t, { "1.0.0": { dmg: Buffer.from("a"), exe: Buffer.from("b") }, "1.1.0": { dmg: DMG, exe: EXE } });
  const mac = uneApp(t, surLe(faux.adresse));
  const pc = uneApp(t, sousWindows(faux.adresse));
  assert.equal(await mac.miseAJour.installerMaintenant(), undefined);
  assert.equal(await pc.miseAJour.installerMaintenant(), undefined);
  // Les mêmes états, dans le même ordre, avec les mêmes valeurs — seule la taille de l'installeur change.
  const sansTaille = (states: StateDeUpdate[]) => states.filter(({ etat: state }) => state !== "telechargement");
  assert.deepEqual(sansTaille(pc.etats), sansTaille(mac.etats));
  assert.deepEqual(pc.noms(), ["verification", "disponible", "telechargement", "prete", "installation"]);
  assert.deepEqual(pc.etats.find(({ etat: state }) => state === "telechargement"), { etat: "telechargement", version: "1.0.0", nouvelle: "1.1.0", recus: 0, taille: EXE.length });
  // L'installeur de Windows reçoit le setup publié, vérifié ; l'app se ferme.
  assert.deepEqual(pc.installees, [{ version: "1.1.0", installeur: "le setup publié" }]);
  assert.equal(pc.fermetures(), 1);
  assert.ok(faux.demandes.includes(`/benomite/brigade/releases/download/app-v1.1.0/${nameDuSetup("1.1.0")}`));
  assert.ok(faux.demandes.includes("/benomite/brigade/releases/download/app-v1.1.0/latest.yml"));
});

test("sous Windows, un setup qui n'a pas l'empreinte publiée n'est jamais prêt : l'app reste sur sa version et dit l'erreur", async (t) => {
  const faux = await unFauxFlux(t, { "1.1.0": { exe: EXE, ymlExe: ymlDe("1.1.0", Buffer.alloc(EXE.length, 8), nameDuSetup("1.1.0")) } });
  const app = uneApp(t, sousWindows(faux.adresse));
  await app.miseAJour.verifier();
  await jusqua(() => app.miseAJour.vu().etat === "erreur");
  assert.deepEqual(app.miseAJour.vu(), { etat: "erreur", version: "1.0.0", nouvelle: "1.1.0", raison: "the update 1.1.0 could not be downloaded: its sha512 is not the published one" });
  assert.deepEqual(readdirSync(app.dossier), []);
  assert.deepEqual(await app.miseAJour.installerMaintenant(), { refus: "the update 1.1.0 could not be downloaded: its sha512 is not the published one" });
  assert.deepEqual(app.installees, []);
  assert.equal(app.fermetures(), 0);
});

test("sous Windows, un flux injoignable ne retient rien : l'app dit l'erreur, comme sur le Mac", async (t) => {
  const app = uneApp(t, sousWindows(await uneAdresseMuette()));
  const state = await app.miseAJour.verifier();
  assert.match(state.etat === "erreur" ? state.raison : "", /^the update feed \(the releases of benomite\/brigade\) could not be read: /);
  // « Install now » relit le flux, et dit pourquoi l'app reste sur sa version.
  const rendu = await app.miseAJour.installerMaintenant();
  assert.match(rendu?.refus ?? "", /^the update feed \(the releases of benomite\/brigade\) could not be read: /);
  assert.deepEqual(app.installees, []);
  assert.equal(app.fermetures(), 0);
});

test("une release qui ne porte que l'installeur du Mac n'est pas une nouvelle version pour Windows, ni l'inverse", async (t) => {
  const faux = await unFauxFlux(t, { "1.1.0": { exe: EXE }, "1.2.0": { dmg: DMG } });
  assert.equal((await sousWindows(faux.adresse).nouvelle("1.0.0"))?.version, "1.1.0");
  assert.equal((await surLe(faux.adresse).nouvelle("1.0.0"))?.version, "1.2.0");
  assert.equal(await surLe(faux.adresse).nouvelle("1.2.0"), undefined);
  assert.equal(await sousWindows(faux.adresse).nouvelle("1.1.0"), undefined);
});
