// L'invite de mise à jour de l'app Android (#1170) : posée au lancement quand la vérification rend une
// offre — la version, ses notes, « Update » et « Not now » —, absente sans offre ; « Update » remet
// l'`apkUrl` à l'installation, « Not now » ferme l'invite jusqu'au lancement suivant.
import assert from "node:assert/strict";
import { test } from "node:test";
import { tenirAccueil } from "../../src/accueil.ts";
import { ALLUMAGE } from "../../src/allumage.ts";
import { pourLaBarre } from "../../src/barre.ts";
import { EXEMPLE } from "../../src/config.ts";
import { PALETTE } from "../../src/couleurs.ts";
import { GESTES_DE_LA_CUISINE } from "../../src/cuisine.ts";
import { BANNIERE } from "../../src/faits.ts";
import { CONFIRMES, DIRECTS, GRANTS } from "../../src/gestes.ts";
import { GESTES_DES_GRANTS } from "../../src/grants.ts";
import type { UpdateOffer } from "../../src/mise-a-jour/android.ts";
import { ONGLETS, RUBRIQUES } from "../../src/onglets.ts";
import { EFFORTS, MODELES } from "../../src/projets/projets.ts";
import { jouerLaVue, repos } from "../aides/fausse-vue.ts";

const OFFRE: UpdateOffer = { kind: "offer", version: "1.5.0", notes: "Faster launch.\nFixes the pairing code.", apkUrl: "https://github.com/benomite/brigade/releases/download/android-v1.5.0/brigade.apk" };

const demarrage = () => ({
  configuration: pourLaBarre({ chemin: "/tmp/app.json", projets: [{ nom: "brigade", dossier: "/tmp/brigade" }] }, () => true),
  palette: PALETTE,
  exemple: EXEMPLE,
  onglets: ONGLETS,
  rubriques: RUBRIQUES,
  gestes: { allumage: ALLUMAGE, cuisine: GESTES_DE_LA_CUISINE, grants: { gestes: GESTES_DES_GRANTS, nommes: GRANTS }, directs: DIRECTS, confirmes: CONFIRMES },
  banniere: BANNIERE,
  calibrage: { modeles: MODELES, efforts: EFFORTS },
  code: undefined,
  accueil: { projets: [], stations: [], sante: { ton: "vert", dit: "Max ✓  ·  GitHub ✓", survol: "" } } as ReturnType<ReturnType<typeof tenirAccueil>["faits"]> extends infer T ? Exclude<T, undefined> : never,
});


async function auLancement() {
  const vue = await jouerLaVue({ demarrage, espace: () => [], installerApk: () => undefined });
  const invite = () => vue.element("offre-apk");
  const boutons = () => invite().dessous("button").filter(({ className }) => className !== "aide");
  const texte = () => [...invite().descendants()].flatMap((noeud) => (noeud.className === "phrase" || noeud.className === "notes" ? [noeud.textContent] : [])).join(" | ");
  return { vue, invite, boutons, texte };
}

test("une offre : l'invite dit la version et les notes, avec « Update » et « Not now »", async () => {
  const { vue, invite, boutons, texte } = await auLancement();
  vue.dire("surOffreApk", OFFRE);
  assert.equal(invite().hidden, false);
  assert.equal(texte(), "Version 1.5.0 is available | Faster launch.\nFixes the pairing code.");
  assert.deepEqual(boutons().map(({ textContent }) => textContent), ["Update", "Not now"]);
  assert.equal(boutons()[0]?.className, "recommande");
});

test("sans offre : rien n'est posé, l'invite reste cachée", async () => {
  const { invite, boutons } = await auLancement();
  assert.equal(invite().hidden, true);
  assert.deepEqual(boutons(), []);
  assert.equal(invite().children.length, 0);
});

test("« Update » remet l'apkUrl à l'installation", async () => {
  const { vue, boutons } = await auLancement();
  vue.dire("surOffreApk", OFFRE);
  boutons()[0]?.click();
  await repos();
  assert.deepEqual(vue.appels.filter(({ geste }) => geste === "installerApk"), [{ geste: "installerApk", args: [OFFRE.apkUrl] }]);
});

test("« Not now » ferme l'invite, l'app reste utilisable, et une offre répétée ne la rouvre pas", async () => {
  const { vue, invite, boutons } = await auLancement();
  vue.dire("surOffreApk", OFFRE);
  boutons()[1]?.click();
  assert.equal(invite().hidden, true);
  assert.equal(invite().children.length, 0);
  assert.ok(!vue.appels.some(({ geste }) => geste === "installerApk"));
  vue.dire("surOffreApk", OFFRE);
  assert.equal(invite().hidden, true);
  assert.equal(vue.element("tous").dessous("section").includes(vue.element("accueil-app")), true);
});
