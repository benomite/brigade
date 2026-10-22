// La mise à jour de l'app dans la vue (#1014) : la version qui tourne, toujours dite sur l'accueil, et
// le message d'une version plus haute — installer maintenant, ou plus tard. Ce que la mise à jour
// dit se calcule dans mise-a-jour/etat.ts : ici, ce que la vue en pose.
import assert from "node:assert/strict";
import { test } from "node:test";
import { tenirAccueil } from "../../src/accueil.ts";
import { ALLUMAGE } from "../../src/allumage.ts";
import { pourLaBarre } from "../../src/barre.ts";
import { BOUTONS } from "../../src/boutons.ts";
import { EXEMPLE } from "../../src/config.ts";
import { PALETTE } from "../../src/couleurs.ts";
import { GESTES_DE_LA_CUISINE } from "../../src/cuisine.ts";
import { BANNIERE } from "../../src/faits.ts";
import { CONFIRMES, DIRECTS, GRANTS } from "../../src/gestes.ts";
import { GESTES_DES_GRANTS } from "../../src/grants.ts";
import type { EtatDeMiseAJour } from "../../src/mise-a-jour/etat.ts";
import { ONGLETS, RUBRIQUES } from "../../src/onglets.ts";
import { EFFORTS, MODELES } from "../../src/projets/projets.ts";
import { jouerLaVue, repos } from "../aides/fausse-vue.ts";

const VERSION = "1.4.0";
const NOUVELLE = "1.5.0";
const ETATS: Record<string, EtatDeMiseAJour> & Record<"a-jour" | "disponible" | "telechargement" | "prete" | "erreur" | "erreur-connue", EtatDeMiseAJour> = {
  "a-jour": { etat: "a-jour", version: VERSION, verifieeLe: "2026-10-19T12:00:00.000Z" },
  disponible: { etat: "disponible", version: VERSION, nouvelle: NOUVELLE },
  telechargement: { etat: "telechargement", version: VERSION, nouvelle: NOUVELLE, recus: 25, taille: 100 },
  prete: { etat: "prete", version: VERSION, nouvelle: NOUVELLE },
  erreur: { etat: "erreur", version: VERSION, raison: "GitHub did not answer" },
  "erreur-connue": { etat: "erreur", version: VERSION, raison: "the signature does not match", nouvelle: NOUVELLE },
};

const demarrage = (miseAJour?: EtatDeMiseAJour) => ({
  configuration: pourLaBarre({ chemin: "/tmp/app.json", projets: [{ nom: "brigade", dossier: "/tmp/brigade", box: { hote: "box" } }], hotes: ["box"] }),
  palette: PALETTE,
  exemple: EXEMPLE,
  onglets: ONGLETS,
  rubriques: RUBRIQUES,
  boutons: BOUTONS,
  gestes: { allumage: ALLUMAGE, cuisine: GESTES_DE_LA_CUISINE, grants: { gestes: GESTES_DES_GRANTS, nommes: GRANTS }, directs: DIRECTS, confirmes: CONFIRMES },
  banniere: BANNIERE,
  calibrage: { modeles: MODELES, efforts: EFFORTS },
  code: undefined,
  accueil: { projets: [], stations: [], sante: { ton: "vert", dit: "Max ✓  ·  GitHub ✓", survol: "" } } as ReturnType<ReturnType<typeof tenirAccueil>["faits"]> extends infer T ? Exclude<T, undefined> : never,
  ...(miseAJour === undefined ? {} : { miseAJour }),
});

async function lApp(miseAJour?: EtatDeMiseAJour, reponses: { installerMiseAJour?: () => { refus: string } | undefined } = {}) {
  const vue = await jouerLaVue({ demarrage: () => demarrage(miseAJour), espace: () => [], ...reponses });
  const app = () => vue.element("accueil-app");
  const texte = () => app().children.map(({ textContent }) => textContent).join(" ").replace(/\?/g, "").replace(/\s+/g, " ").trim(); // les « ? » sont les survols
  const gestes = () => app().dessous("button").filter(({ className }) => className !== "aide");
  const boutons = () => gestes().map((bouton) => bouton.textContent);
  return { vue, app, texte, boutons, gestes };
}

test("la version qui tourne est dite sur l'accueil, dans chacun des états", async () => {
  for (const [nom, etat] of Object.entries(ETATS)) {
    const { vue, texte } = await lApp(etat);
    assert.ok(vue.element("tous").dessous("section").includes(vue.element("accueil-app")), nom);
    assert.match(texte(), /^Brigade 1\.4\.0/, nom);
  }
});

test("à jour, ou en erreur : aucun message de mise à jour, ni bouton — la version reste dite", async () => {
  for (const nom of ["a-jour", "erreur", "erreur-connue"]) {
    const { texte, boutons, app } = await lApp(ETATS[nom as keyof typeof ETATS]);
    assert.equal(texte(), "Brigade 1.4.0", nom);
    assert.deepEqual(boutons(), [], nom);
    assert.doesNotMatch(texte(), /available|installing/, nom);
    assert.deepEqual(app().children.map(({ balise }) => balise), ["p"], "rien d'autre que la version");
  }
  // La raison de l'erreur se lit au survol de la version, pas à l'écran.
  const { app } = await lApp(ETATS.erreur);
  assert.equal(app().children[0]?.title, "GitHub did not answer");
});

test("une version disponible, en téléchargement ou prête : son numéro, et deux choix — installer maintenant, ou plus tard", async () => {
  const dits = { disponible: "version 1.5.0 is available", telechargement: "version 1.5.0 is available — downloading it, 25 %", prete: "version 1.5.0 is available" };
  for (const [nom, dit] of Object.entries(dits)) {
    const { texte, boutons } = await lApp(ETATS[nom as keyof typeof ETATS]);
    assert.equal(texte().replace(/^Brigade 1\.4\.0 /, "").replace(/(Install now|Later)/g, "").trim(), dit, nom);
    assert.deepEqual(boutons(), ["Install now", "Later"], nom);
  }
});

test("« Install now » lance l'installation, et la ligne dit que l'app se relance ; un refus se dit en une ligne et rend les choix", async () => {
  const { vue, texte, boutons, gestes } = await lApp(ETATS.prete, { installerMiseAJour: () => ({ refus: "this app cannot replace itself here" }) });
  gestes()[0]?.click();
  assert.deepEqual(vue.dernier("installerMiseAJour"), []);
  await repos();
  assert.match(texte(), /this app cannot replace itself here/);
  assert.deepEqual(boutons(), ["Install now", "Later"]);
  const { gestes: enGestes, texte: dit, boutons: choix } = await lApp(ETATS.prete, { installerMiseAJour: () => undefined });
  enGestes()[0]?.click();
  await repos();
  assert.match(dit(), /installing 1\.5\.0 — the app relaunches itself…/);
  assert.deepEqual(choix(), [], "pendant l'installation, plus de choix");
});

test("« Later » ferme le message jusqu'au lancement suivant, sans rien installer ; une version plus haute le rouvre", async () => {
  const { vue, texte, boutons, gestes } = await lApp(ETATS.disponible);
  gestes()[1]?.click();
  assert.equal(texte(), "Brigade 1.4.0");
  assert.deepEqual(boutons(), []);
  assert.throws(() => vue.dernier("installerMiseAJour"));
  vue.dire("surMiseAJour", ETATS.prete);
  await repos();
  assert.equal(texte(), "Brigade 1.4.0", "la même version, devenue prête, reste fermée");
  vue.dire("surMiseAJour", { etat: "disponible", version: VERSION, nouvelle: "1.6.0" });
  await repos();
  assert.match(texte(), /version 1\.6\.0 is available/);
});

test("l'état suit ce que l'app redit : disponible puis à jour fait disparaître le message", async () => {
  const { vue, texte, boutons } = await lApp(ETATS["a-jour"]);
  vue.dire("surMiseAJour", ETATS.disponible);
  await repos();
  assert.deepEqual(boutons(), ["Install now", "Later"]);
  vue.dire("surMiseAJour", ETATS["a-jour"]);
  await repos();
  assert.equal(texte(), "Brigade 1.4.0");
});

test("lancée depuis le dépôt, ou avant toute lecture : la version est dite, rien d'autre ; sans état, la section reste vide", async () => {
  const { texte, boutons } = await lApp({ etat: "inactive", version: VERSION, raison: "launched from a clone" });
  assert.equal(texte(), "Brigade 1.4.0");
  assert.deepEqual(boutons(), []);
  const { texte: vide } = await lApp(undefined);
  assert.equal(vide(), "");
});
