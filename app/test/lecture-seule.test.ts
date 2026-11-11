// Un projet dont le compte GitHub de cet ordinateur ne peut pas écrire le dépôt s'ouvre en lecture seule (ticket 3163) : le
// rail, les cartes, TODO, les stations et les cooks se voient ; aucun geste n'est offert — ni choix ni champ sur une carte
// de TODO, ni « Relaunch », ni « Add a station » —, absents, pas grisés ; une ligne en tête du projet le dit, avec ses deux
// liens. L'accès gagné, la lecture suivante rend la vue ordinaire, sans rouvrir le projet. La vue est jouée telle qu'elle
// est, devant un faux document et un faux pont ; les faits sont ceux que `facts` porte (tableau/lecture.ts, `lectureSeule`).
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, test } from "node:test";
import type { Faits as FaitsDuRuntime } from "../../runtime/src/etat.ts";
import { ALLUMAGE } from "../src/allumage.ts";
import { pourLaBarre } from "../src/barre.ts";
import { EXEMPLE } from "../src/config.ts";
import { PALETTE } from "../src/couleurs.ts";
import { GESTES_DE_LA_CUISINE } from "../src/cuisine.ts";
import { BANNIERE, tenirFaits, type Faits } from "../src/faits.ts";
import { CONFIRMES, DIRECTS } from "../src/gestes.ts";
import { gestesDeCarte } from "../src/gestes-fiche.ts";
import { ACCES_EN_ECRITURE, pageDeLaLectureSeule } from "../src/lecture-seule.ts";
import { ONGLETS, RUBRIQUES } from "../src/onglets.ts";
import { EFFORTS, MODELES } from "../src/projets/projets.ts";
import type { Terminal } from "../src/terminaux.ts";
import { FORKER, LECTURE_SEULE, OBTENIR_L_ACCES } from "../src/vue/lecture-seule/lecture-seule.js";
import { AJOUTER } from "../src/vue/projet/stations/ListeStations.js";
import { discussionDe } from "./aides/fiches-dites.ts";
import { carteDuTicket, type Faux, type Jouee, jouerLaVue, ouvrirOnglet, type Reponses, repos } from "./aides/fausse-vue.ts";

const PARADE = "parade";
const DEPOT = "chef/parade";
const A = "2026-11-11T10:04:12.000Z";
const ISSUE = (ticket: number) => `https://github.com/${DEPOT}/issues/${ticket}`;
const SECOND: Terminal = { id: 1, projet: PARADE, genre: "second", titre: "second · claude", note: "", arrete: false };
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

// Le rail : #21 attend le chef d'une question à deux choix ; #22 n'est plus pris par aucun cook (Relaunch) ; #23, pris par
// box/claude, son cook au travail.
const PRODUIT = {
  type: "product",
  question: "One journal export per project, or a single one?",
  choix: [
    { texte: "One per project.", suite: "resume" },
    { texte: "A single export.", suite: "resume" },
  ],
  captures: null,
};
type DuRuntime = FaitsDuRuntime["stations"][number];
const BOX: DuRuntime = { station: "box/claude", distante: false, plafond: 2, ordinaires: false, bacASable: null, prendOrdinaires: true, cuisson: "cooking", arreteeDepuis: null, refus: null, cooks: [] };
const faits = (lectureSeule: boolean) => ({
  etat: "ouverte",
  lu: "2026-11-11T10:04:11.000Z",
  dernierTick: "2026-11-11T10:04:11.000Z",
  compteurs: { rail: 3, auTravail: 1, aLaPass: 0, attend: 1, livres24h: 0 },
  dernierEvenement: null,
  rail: [
    { ticket: 21, etat: "en attente", titre: "L'export du journal", url: ISSUE(21), activite: null },
    { ticket: 22, etat: "86", titre: "Le ticket refusé", url: ISSUE(22), activite: null, attente: { raison: "off the kitchen after 3 cooks without a delivery", complete: "off the kitchen after 3 cooks without a delivery", label: "served-elsewhere", colonne: "en attente", retour: null } },
    { ticket: 23, etat: "pris", titre: "La recherche", url: ISSUE(23), station: "box/claude", activite: null },
  ],
  cooks: [{ ticket: 23, titre: "La recherche", station: "box/claude" }],
  stations: [BOX],
  attend: [{ ticket: 21, titre: "L'export du journal", url: ISSUE(21), decision: { quoi: "carte", motif: "product", cause: PRODUIT.question, pr: null }, carte: PRODUIT }],
  ...(lectureSeule ? { lectureSeule: { depot: DEPOT } } : {}),
}) satisfies Faits;

async function ouvrir(reponses: Reponses = {}): Promise<Jouee> {
  const vue = await jouerLaVue({ demarrage, espace: () => [SECOND], machines: () => [{ id: "poste", titre: "this computer" }], projetsServis: () => ({ depots: [] }), ...reponses });
  (vue.element("projets").children.at(1) ?? assert.fail("pas de case pour parade")).click();
  await repos();
  return vue;
}
async function lire(vue: Jouee, lectureSeule: boolean): Promise<void> {
  vue.dire("surFaits", { ...tenirFaits(() => new Map()).recevoir({ projet: PARADE, demande: 0, a: A, sorties: [{ commande: "facts", texte: JSON.stringify(faits(lectureSeule)) }] }), demande: vue.dernier("faits")[0] as number });
  await repos();
}
const bon = (vue: Jouee, ticket: number): Faux => carteDuTicket(vue, ticket) ?? assert.fail(`pas de carte #${ticket}`);
const textes = (ou: Faux) => ou.dessous("button").map(({ textContent }) => textContent);
const ligne = (vue: Jouee) => vue.element("alertes").children.find(({ className }) => className === "lecture-seule");

describe("un projet en lecture seule", () => {
  test("une ligne en tête du projet le dit en mots simples, avec ses deux liens : l'écriture à obtenir, ou le fork", async () => {
    const vue = await ouvrir({ ouvrirLectureSeule: () => true });
    await lire(vue, true);
    const dite = ligne(vue) ?? assert.fail("pas de ligne de lecture seule");
    assert.equal(vue.element("alertes").hidden, false);
    assert.equal(vue.element("alertes").children[0], dite, "en tête de la bande");
    assert.equal(dite.dessous("p")[0]?.textContent, "Read-only: your GitHub account cannot write to chef/parade.");
    assert.equal(dite.dessous("p")[0]?.textContent, LECTURE_SEULE(DEPOT));
    assert.deepEqual(textes(dite), [OBTENIR_L_ACCES, FORKER]);
    (dite.dessous("button").find(({ textContent }) => textContent === FORKER) ?? assert.fail("pas de lien fork")).click();
    await repos();
    assert.deepEqual(vue.dernier("ouvrirLectureSeule"), [PARADE, "fork"]);
    (dite.dessous("button").find(({ textContent }) => textContent === OBTENIR_L_ACCES) ?? assert.fail("pas de lien accès")).click();
    await repos();
    assert.deepEqual(vue.dernier("ouvrirLectureSeule"), [PARADE, "acces"]);
  });

  test("le rail, ses cartes et TODO se voient ; aucun choix, aucun champ, aucun « Relaunch » : absents, pas grisés", async () => {
    const vue = await ouvrir();
    await lire(vue, true);
    const carte = bon(vue, 21);
    assert.ok(carte.dessous("p").some(({ textContent }) => textContent === PRODUIT.question), "la question se lit");
    assert.deepEqual(carte.dessous("button").filter(({ className }) => className === "choix"), [], "aucun choix");
    assert.equal(carte.dessous("textarea").length, 0, "aucun champ");
    for (const absent of ["send", "answer in my own words", ...PRODUIT.choix.map(({ texte }) => texte)]) assert.ok(!textes(carte).includes(absent), `${absent} : ${textes(carte).join(" | ")}`);
    const refusee = bon(vue, 22);
    assert.ok(refusee.dessous("p").some(({ textContent }) => textContent.startsWith("Will not start:")), "la carte refusée dit pourquoi");
    for (const absent of ["Relaunch", "Close as already done"]) assert.ok(!textes(refusee).includes(absent), absent);
    assert.ok(carteDuTicket(vue, 23) !== undefined, "la carte prise se voit");
    assert.ok(!vue.element("rail").dessous("button").some(({ disabled, textContent }) => disabled === true && ["Relaunch", "send", ...PRODUIT.choix.map(({ texte }) => texte)].includes(textContent)), "rien de grisé à la place");
    // Ni l'interrupteur du projet, ni l'arrêt de la cuisine.
    assert.equal(vue.element("interrupteur-projet").hidden, true);
    assert.deepEqual(vue.element("arreter-cuisine").dessous("button"), []);
  });

  test("Stations : ses stations se voient, et pas « Add a station »", async () => {
    const vue = await ouvrir();
    await lire(vue, true);
    await ouvrirOnglet(vue, "Stations");
    assert.ok(vue.element("rail").dessous("li").some(({ dataset }) => dataset.station === "box/claude"), "la station se voit");
    assert.ok(!textes(vue.element("rail")).includes(AJOUTER), textes(vue.element("rail")).join(" | "));
  });

  test("Settings : ce qui se propose au dépôt par une pull request n'est pas posé", async () => {
    const vue = await ouvrir();
    await lire(vue, true);
    assert.equal("lectureSeule" in vue.element("etat").dataset, true);
    const css = readFileSync(join(import.meta.dirname, "..", "src", "vue", "vue.css"), "utf8");
    const regle = /#etat\[data-lecture-seule\] :is\(([^)]*)\) \{\s*display: none !important;/.exec(css)?.[1] ?? assert.fail("pas de règle pour Settings en lecture seule");
    for (const bloc of ["#reglages-du-projet", "#reglages-du-projet-en-plus", "#humains-du-projet", "#stations-contributrices", '[data-bloc="plafonds-duree"]', '[data-bloc="closer"]']) assert.ok(regle.includes(bloc), bloc);
  });

  test("l'accès gagné, la lecture suivante rend la vue ordinaire, sans rouvrir le projet ; perdu, elle redevient seule", async () => {
    const vue = await ouvrir();
    await lire(vue, true);
    assert.ok(ligne(vue) !== undefined);
    await lire(vue, false);
    assert.equal(ligne(vue), undefined, "plus de ligne de lecture seule");
    assert.equal("lectureSeule" in vue.element("etat").dataset, false);
    assert.equal(bon(vue, 21).dessous("button").filter(({ className }) => className === "choix").length, PRODUIT.choix.length, "les choix reviennent");
    assert.ok(textes(bon(vue, 22)).includes("Relaunch"));
    assert.equal(vue.element("interrupteur-projet").hidden, false, "l'interrupteur revient");
    assert.equal(vue.element("arreter-cuisine").dessous("button").length, 1, "l'arrêt de la cuisine revient");
    await ouvrirOnglet(vue, "Stations");
    assert.ok(textes(vue.element("rail")).includes(AJOUTER));
    await ouvrirOnglet(vue, "Rail");
    await lire(vue, true);
    assert.ok(ligne(vue) !== undefined);
    assert.ok(!textes(bon(vue, 22)).includes("Relaunch"));
  });
});

describe("la fiche d'un ticket en lecture seule", () => {
  // Ce que le chef voit sur la fiche de #23, pris : les gestes de la fiche et le champ de la discussion.
  async function fiche(lectureSeule: boolean) {
    const vue = await ouvrir({
      gestesDeFiche: (carte) => gestesDeCarte(carte),
      lireDiscussion: () => discussionDe({ issue: { title: "La recherche", state: "open", body: { author: "chef", at: A, body: "Chercher." }, comments: [] } }),
    });
    await lire(vue, lectureSeule);
    (carteDuTicket(vue, 23) ?? assert.fail("pas de carte #23")).click();
    await repos();
    await repos();
    const posee = vue.element("fiche");
    return { gestes: posee.dessous("section").find(({ className }) => className === "gestes-fiche")?.dessous("li").map(({ dataset }) => dataset.geste) ?? [], commentaire: posee.dessous("button").some(({ dataset }) => dataset.geste === "commentaire"), champs: posee.dessous("textarea").length };
  }

  test("elle ne garde que ce qui ouvre ou demande au second : ni priorité, ni commentaire à poster", async () => {
    const ordinaire = await fiche(false);
    assert.ok(ordinaire.gestes.includes("priorite"), ordinaire.gestes.join(" | "));
    assert.equal(ordinaire.commentaire, true);
    const seule = await fiche(true);
    assert.deepEqual(seule.gestes.filter((id) => !["issue", "pr", "second", "navigateur"].includes(id ?? "")), [], seule.gestes.join(" | "));
    assert.ok(seule.gestes.includes("second"), "le second se demande toujours");
    assert.equal(seule.commentaire, false);
    assert.equal(seule.champs, 0);
  });
});

describe("les pages que la ligne ouvre", () => {
  test("comment obtenir l'écriture, ou le fork du dépôt ; rien pour un dépôt ou une page qui ne se lit pas", () => {
    assert.equal(pageDeLaLectureSeule(DEPOT, "acces"), ACCES_EN_ECRITURE);
    assert.match(ACCES_EN_ECRITURE, /^https:\/\/docs\.github\.com\/.*inviting-collaborators/);
    assert.equal(pageDeLaLectureSeule(DEPOT, "fork"), "https://github.com/chef/parade/fork");
    assert.equal(pageDeLaLectureSeule(undefined, "fork"), undefined);
    assert.equal(pageDeLaLectureSeule("../evil", "fork"), undefined);
    assert.equal(pageDeLaLectureSeule(DEPOT, "https://evil.example"), undefined);
  });
});
