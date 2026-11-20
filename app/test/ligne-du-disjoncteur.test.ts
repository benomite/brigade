// La ligne du disjoncteur, ligne d'état du rail (#2140, #3523) : une information, sans bouton — le chef ne referme plus le
// disjoncteur, la station le referme d'elle-même (#3911). Elle vient de la ligne `kitchen` de `status`, telle que le runtime
// l'écrit ; la vue est jouée devant un faux document (aides/fausse-vue.ts).
import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { tenirBandes, type Bande } from "../src/alertes.ts";
import { ALLUMAGE } from "../src/allumage.ts";
import { mettreAPart } from "../src/attend.ts";
import { pourLaBarre } from "../src/barre.ts";
import type { Lecture } from "../src/box.ts";
import { EXEMPLE } from "../src/config.ts";
import { PALETTE } from "../src/couleurs.ts";
import { GESTES_DE_LA_CUISINE } from "../src/cuisine.ts";
import { BANNIERE, tenirFaits, type Faits } from "../src/faits.ts";
import { CONFIRMES, DIRECTS } from "../src/gestes.ts";
import { ONGLETS, RUBRIQUES } from "../src/onglets.ts";
import { EFFORTS, MODELES } from "../src/projets/projets.ts";
import { type Faux, FauxEcran, type Jouee, jouerLaVue, ouvrirOnglet, repos } from "./aides/fausse-vue.ts";


const PARADE = "parade";
const DEPOT = "chef/parade";
const A = "2026-11-03T10:00:01.000Z";

// --- La vue -----------------------------------------------------------------------------------------------------------

const FAITS: Faits = {
  etat: "retenue",
  lu: A,
  dernierTick: A,
  compteurs: { rail: 1, auTravail: 0, aLaPass: 0, attend: 0, livres24h: 0 },
  dernierEvenement: null,
  rail: [{ ticket: 21, etat: "en attente", titre: "L'export du journal", url: "https://github.com/chef/parade/issues/21", activite: null }],
  cooks: [],
  attend: [],
};
// La ligne `kitchen` de `status`, telle que le runtime l'écrit (runtime/src/etat.ts) : le disjoncteur ouvert.
const OUVERT = ["project    parade", "kitchen    held · breaker OPEN for 1 h 00 (3 failures in a row)", "", "rail       1 queued", "  #21  queued  -  since 2 h 05  L'export du journal", ""].join("\n");
const REFERME = ["project    parade", "kitchen    open", "", "rail       1 queued", "  #21  queued  -  since 2 h 05  L'export du journal", ""].join("\n");
const lecture = (commande: string, texte: string): Lecture => ({ projet: PARADE, demande: 1, a: A, sorties: [{ commande, texte }] });

// La bande que le process principal dirait, `facts` et `status` lus.
function bandeLue(status: string, etat: Faits["etat"] = "retenue", lectureSeule = false): Bande {
  const bandes = tenirBandes({ etablir: 1, minimum: 0 });
  bandes.ouvrir([PARADE]);
  bandes.faits(lecture("facts", JSON.stringify({ ...FAITS, etat, ...(lectureSeule ? { lectureSeule: { depot: DEPOT } } : {}) })));
  bandes.status(mettreAPart(lecture("status", status)));
  return bandes.manager(lecture("manager", "manager               ALLUMÉ depuis le 2026-11-03T09:25:21.838Z (par chef) — il juge les issues ouvertes\n"));
}

const demarrage = () => ({
  configuration: pourLaBarre({ chemin: "/tmp/app.json", projets: [{ nom: PARADE, dossier: "/tmp/parade", depot: DEPOT }] }, () => true),
  palette: PALETTE,
  exemple: EXEMPLE,
  onglets: ONGLETS,
  rubriques: RUBRIQUES,
  gestes: { allumage: ALLUMAGE, cuisine: GESTES_DE_LA_CUISINE, directs: DIRECTS, confirmes: CONFIRMES },
  banniere: BANNIERE,
  calibrage: { modeles: MODELES, efforts: EFFORTS },
  code: undefined,
});

// L'espace de « parade » ouvert, son rail lu, sa bande dite.
async function ouvrir(status = OUVERT, etat: Faits["etat"] = "retenue", lectureSeule = false): Promise<Jouee> {
  const vue = await jouerLaVue({ demarrage, espace: () => [], geste: () => undefined });
  (vue.element("projets").children.at(1) ?? assert.fail("pas d'entrée")).click();
  await repos();
  const recue = tenirFaits().recevoir(lecture("facts", JSON.stringify({ ...FAITS, ...(lectureSeule ? { lectureSeule: { depot: DEPOT } } : {}) })));
  vue.dire("surFaits", { ...recue, demande: vue.dernier("faits")[0] as number });
  vue.dire("surAlertes", bandeLue(status, etat, lectureSeule));
  await repos();
  return vue;
}


// La ligne du disjoncteur est la ligne d'état du rail (#3523) : au-dessus des colonnes, seule avec le bandeau Backlog.
const ligneDe = (vue: Jouee): Faux | undefined => vue.element("rail").dessous("div").find(({ className }) => className === "ligne-disjoncteur");
const ligne = (vue: Jouee): Faux => ligneDe(vue) ?? assert.fail("pas de ligne du disjoncteur sur le rail");
const boutons = (ou: Faux) => ou.dessous("button").filter(({ className }) => className !== "aide" && className !== "detail");

describe("la ligne du disjoncteur, ligne d'état du rail, au-dessus des colonnes (#3523)", () => {
  test("le disjoncteur ouvert : sa ligne d'état, sans aucun bouton — et la bande ne la redit pas", async () => {
    const vue = await ouvrir();
    const posee = ligne(vue);
    const enfants = vue.element("rail").children;
    assert.ok(enfants.indexOf(posee) >= 0 && enfants.indexOf(posee) < enfants.findIndex(({ className }) => className === "colonnes"), "la ligne n'est pas au-dessus des colonnes");
    assert.ok(!vue.element("rail").dessous("section").some((colonne) => colonne.dessous("div").some(({ className }) => className === "ligne-disjoncteur")), "la ligne est dans une colonne");
    assert.match(posee.textContent, /held: breaker open — 3 launches failed in a row/);
    assert.doesNotMatch(posee.textContent, /takes nothing|no manager|resume/i);
    assert.deepEqual(boutons(posee), []);
    assert.equal(posee.dessous("pre").length, 0);
    // Ce que la station en écrit, au survol de la ligne.
    const survols = posee.dessous("button").filter(({ className }) => className === "aide").map(({ ariaLabel }) => ariaLabel);
    assert.deepEqual(survols, ["breaker OPEN for 1 h 00 (3 failures in a row)"]);
    assert.ok(!vue.element("alertes").textContent.includes("breaker open"), "la bande redit la ligne du disjoncteur");
  });

  test("le disjoncteur refermé : la ligne d'état s'en va ; rouvert, elle revient, toujours sans bouton", async () => {
    const vue = await ouvrir();
    assert.ok(vue.element("rail").children.includes(ligne(vue)), "la ligne n'est pas posée sur le rail, au-dessus des colonnes");
    vue.dire("surAlertes", bandeLue(REFERME, "ouverte"));
    await repos();
    assert.equal(ligneDe(vue), undefined);
    vue.dire("surAlertes", bandeLue(OUVERT));
    await repos();
    assert.deepEqual(boutons(ligne(vue)), []);
  });

  test("sur Stations, sans TODO : la bande porte la ligne, elle aussi sans bouton", async () => {
    const vue = await ouvrir();
    await ouvrirOnglet(vue, "Stations");
    const bande = vue.element("alertes").children.find((pose) => pose.textContent.includes("breaker open")) ?? assert.fail("la bande ne dit pas le disjoncteur");
    assert.deepEqual(boutons(bande), []);
    assert.doesNotMatch(bande.textContent, /resume/i);
  });

  test("à la largeur d'un téléphone : la ligne est en tête de la liste des cartes, avec ce que la station en écrit sous son nom", async () => {
    const vue = await jouerLaVue({ demarrage, espace: () => [], geste: () => undefined } as never, { ecran: new FauxEcran(true) });
    const recue = tenirFaits().recevoir(lecture("facts", JSON.stringify(FAITS)));
    vue.dire("surFaits", { ...recue, demande: vue.dernier("faits")[0] as number });
    vue.dire("surAlertes", bandeLue(OUVERT));
    await repos();
    const posee = vue.element("cartes-du-chef").dessous("div").find(({ className }) => className === "ligne-disjoncteur") ?? assert.fail("pas de ligne du disjoncteur dans la liste");
    assert.deepEqual(boutons(posee), []);
    assert.equal(posee.dessous("p").find(({ className }) => className === "pourquoi")?.textContent, "breaker OPEN for 1 h 00 (3 failures in a row)");
  });

  test("le geste d'une autre ligne reste offert : « resume » de la cuisine arrêtée se presse sur un projet ordinaire, pas en lecture seule", async () => {
    const ordinaire = await ouvrir(REFERME, "arrêtée");
    assert.ok(boutons(ordinaire.element("alertes")).some(({ textContent }) => /resume/i.test(textContent)), "pas de bouton « resume » sur la ligne de la cuisine arrêtée");
    const seule = await ouvrir(REFERME, "arrêtée", true);
    assert.ok(!boutons(seule.element("alertes")).some(({ textContent }) => /resume/i.test(textContent)), "« resume » offert en lecture seule");
  });
});
