// L'écran « since you were away » dans la vue entière (#3305) : posé avant tout autre écran quand la dernière ouverture date
// de plus de trois jours, avec les résumés lus ; refermé par son bouton unique sur l'accueil quand rien n'attend le chef ;
// et à la réouverture suivante, avec le même stockage, il ne revient pas. Au premier lancement, il n'existe pas.
import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { resumeDeLaSemaine } from "../../../runtime/src/resume-hebdomadaire/resume.ts";
import { ALLUMAGE } from "../../src/allumage.ts";
import { pourLaBarre } from "../../src/barre.ts";
import { EXEMPLE, type Projet } from "../../src/config.ts";
import { PALETTE } from "../../src/couleurs.ts";
import { GESTES_DE_LA_CUISINE } from "../../src/cuisine.ts";
import { BANNIERE } from "../../src/faits.ts";
import { CONFIRMES, DIRECTS } from "../../src/gestes.ts";
import { ONGLETS, RUBRIQUES } from "../../src/onglets.ts";
import { EFFORTS, MODELES } from "../../src/projets/projets.ts";
import type { ResumesDuProjet } from "../../src/vue/resume-hebdomadaire/resume-cuisine.ts";
import { CLE_DE_LA_DERNIERE_OUVERTURE, FERMER } from "../../src/vue/absence/absence.js";
import { FauxStockage, jouerLaVue, repos } from "../aides/fausse-vue.ts";

const PROJET: Projet = { nom: "parade", dossier: "/tmp/parade" };
const SEMAINE = resumeDeLaSemaine({
  project: "parade",
  weekStart: new Date(Date.now() - 9 * 24 * 3600_000).toISOString().slice(0, 10),
  weekEnd: new Date(Date.now() - 3 * 24 * 3600_000).toISOString().slice(0, 10),
  servis: [{ number: 12, title: "Show the rail age on the tile", url: "https://github.com/chef/parade/issues/12", labels: [], epic: null }],
  attentes: [],
});
const LU: ResumesDuProjet = { projet: "parade", jour: { jour: "monday", pose: false }, resumes: { resumes: [SEMAINE], illisibles: [] } };
const ouvrir = (stockage: FauxStockage) =>
  jouerLaVue(
    {
      demarrage: () => ({
        configuration: pourLaBarre({ chemin: "/tmp/app.json", projets: [PROJET] }, () => true),
        palette: PALETTE,
        exemple: EXEMPLE,
        onglets: ONGLETS,
        rubriques: RUBRIQUES,
        gestes: { allumage: ALLUMAGE, cuisine: GESTES_DE_LA_CUISINE, directs: DIRECTS, confirmes: CONFIRMES },
        banniere: BANNIERE,
        calibrage: { modeles: MODELES, efforts: EFFORTS },
        code: undefined,
      }),
      espace: () => [],
      lireLesResumesHebdomadaires: () => LU,
    },
    { stockage },
  );

describe("l'écran « since you were away » dans la vue (#3305)", () => {
  test("cinq jours d'absence : l'écran est posé d'abord, son bouton le ferme ; la réouverture ne le remontre pas", async () => {
    const stockage = new FauxStockage();
    stockage.setItem(CLE_DE_LA_DERNIERE_OUVERTURE, new Date(Date.now() - 5 * 24 * 3600_000).toISOString());
    const vue = await ouvrir(stockage);
    await repos();
    const ecran = vue.element("absence");
    assert.equal(ecran.hidden, false);
    assert.match(ecran.textContent, /Since you were away/);
    assert.match(ecran.textContent, /Nothing is waiting for you/);
    const geste = ecran.dessous("button").find(({ textContent }) => textContent === FERMER);
    assert.ok(geste !== undefined, "un seul bouton, qui ferme quand rien n'attend");
    geste.click();
    assert.equal(vue.element("absence").hidden, true);
    assert.ok(Date.now() - Date.parse(stockage.getItem(CLE_DE_LA_DERNIERE_OUVERTURE) ?? "") < 60_000, "la date d'ouverture est celle d'aujourd'hui");
    const rouverte = await ouvrir(stockage);
    await repos();
    assert.equal(rouverte.element("absence").hidden, true);
  });

  test("premier lancement : pas d'écran, la date est posée", async () => {
    const stockage = new FauxStockage();
    const vue = await ouvrir(stockage);
    await repos();
    assert.equal(vue.element("absence").hidden, true);
    assert.notEqual(stockage.getItem(CLE_DE_LA_DERNIERE_OUVERTURE), null);
  });
});
