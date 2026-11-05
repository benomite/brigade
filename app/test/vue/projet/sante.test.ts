// Kitchen > Health (#2490) : le temps des tickets en détail — le ticket et sa pass, par ticket et dans le temps — et les
// plafonds de durée, réglés là et nulle part ailleurs dans la page du projet. Les blocs sont joués avec le faux élément
// de l'app (aides/fausse-vue.ts), puis la vue entière, telle qu'elle est.
import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { ALLUMAGE } from "../../../src/allumage.ts";
import { pourLaBarre } from "../../../src/barre.ts";
import { EXEMPLE } from "../../../src/config.ts";
import { PALETTE } from "../../../src/couleurs.ts";
import { GESTES_DE_LA_CUISINE } from "../../../src/cuisine.ts";
import { BANNIERE } from "../../../src/faits.ts";
import { CONFIRMES, DIRECTS, GRANTS } from "../../../src/gestes.ts";
import { GESTES_DES_GRANTS } from "../../../src/grants.ts";
import { ONGLETS, RUBRIQUES } from "../../../src/onglets.ts";
import { PLAFONDS, type LectureDesPlafonds, type RenduDuPlafond } from "../../../src/plafonds-duree.ts";
import { EFFORTS, MODELES } from "../../../src/projets/projets.ts";
import { CLES as CLES_DES_REGLAGES } from "../../../src/reglages-du-projet.ts";
import { poserBlocPlafondsDuree } from "../../../src/vue/projet/cuisine/sante/PlafondsDuree.js";
import { lireLesTemps, poserBlocTempsTickets } from "../../../src/vue/projet/cuisine/sante/TempsTickets.js";
import { Faux, jouerLaVue, ouvrirOnglet, repos, type Jouee } from "../../aides/fausse-vue.ts";

const doc = { createElement: (balise: string) => new Faux(balise) };
const MIN = 60;

// Un ticket mesuré : `total` minutes, dont `pass` d'attente de la pass et de revue, mergé le `jour` d'octobre.
const ticket = (n: number, total: number, pass: number, jour = n - 100) => ({
  ticket: n,
  claimedAt: "2026-10-01T00:00:00.000Z",
  mergedAt: `2026-10-${String(jour).padStart(2, "0")}T10:00:00.000Z`,
  cuisson: (total - pass) * MIN * 0.8,
  cuissonTests: (total - pass) * MIN * 0.1,
  attentePasse: pass * MIN * 0.5,
  revue: pass * MIN * 0.5,
  ci: (total - pass) * MIN * 0.05,
  merge: (total - pass) * MIN * 0.05,
});
const TEMPS = { enregistrements: [ticket(103, 9, 3), ticket(101, 10, 2), ticket(102, 20, 6)], tempsMaxTicketMin: 15 };

const texte = (racine: Faux) => racine.textContent;
const parClasse = (racine: Faux, classe: string) => [...racine.descendants()].filter((pose) => pose.className.split(" ").includes(classe));

describe("le temps des tickets, sur Health", () => {
  test("le ticket et sa pass en médiane, dans le temps du plus ancien au plus récent, et par ticket du plus récent", () => {
    const lu = lireLesTemps(TEMPS) ?? assert.fail("rien de lu");
    assert.equal(lu.mediane, 10 * MIN);
    assert.equal(lu.medianePasse, 3 * MIN);
    assert.deepEqual(lu.dansLeTemps.map(({ ticket: n }) => n), [101, 102, 103]);
    assert.deepEqual(lu.parTicket.map(({ ticket: n, total, passe }) => [n, total / MIN, passe / MIN]), [
      [103, 9, 3],
      [102, 20, 6],
      [101, 10, 2],
    ]);

    const bloc: Faux = poserBlocTempsTickets(doc, TEMPS);
    assert.equal(bloc.dataset.temps, "normal");
    assert.deepEqual(parClasse(bloc, "temps-chiffre").map(texte), ["10 minticket, median of the last 3 tickets", "3 minpass, median of the last 3 tickets", "15 minmax of a ticket"]);
    const colonnes = parClasse(bloc, "temps-colonne");
    assert.deepEqual(colonnes.map(({ title }) => title), ["#101 · Oct 1 · 10 min, pass 2 min", "#102 · Oct 2 · 20 min, pass 6 min", "#103 · Oct 3 · 9 min, pass 3 min"]);
    assert.deepEqual(colonnes.map(({ dataset }) => dataset.depasse), [undefined, "oui", undefined], "le ticket au-delà du plafond est marqué");
    const lignes = bloc.dessous("tr").filter(({ dataset }) => dataset.ticket !== undefined);
    assert.deepEqual(lignes.map((ligne) => ligne.children.map(texte)), [
      ["#103", "Oct 3", "9 min", "3 min"],
      ["#102", "Oct 2", "20 min", "6 min"],
      ["#101", "Oct 1", "10 min", "2 min"],
    ]);
  });

  test("la médiane au-delà du plafond passe le bloc en « depasse »", () => {
    assert.equal(poserBlocTempsTickets(doc, { ...TEMPS, tempsMaxTicketMin: 5 }).dataset.temps, "depasse");
  });

  test("jamais un blanc ni un zéro : aucun ticket mesuré, ou une station qui ne publie pas encore ses temps", () => {
    const vide = poserBlocTempsTickets(doc, { enregistrements: [], tempsMaxTicketMin: 15 });
    assert.equal(vide.dataset.temps, "vide");
    assert.match(texte(vide), /No ticket measured yet/);
    const muet = poserBlocTempsTickets(doc, undefined);
    assert.match(texte(muet), /Ticket times not available yet/);
  });
});

const LECTURE: LectureDesPlafonds = {
  branche: "main",
  plafonds: PLAFONDS.map((plafond) => ({ cle: plafond.cle, nom: plafond.nom, unite: plafond.unite, entier: plafond.entier, duree: plafond.duree, defaut: "defaut" in plafond ? plafond.defaut : null, valeur: plafond.cle === "gatesSeconds" ? 120 : null })),
};
const ligneDe = (racine: Faux, cle: string) => [...racine.descendants()].find((pose) => pose.className === "plafond" && pose.dataset.cle === cle) ?? assert.fail(`pas de ligne ${cle}`);
const champDe = (ligne: Faux) => ligne.dessous("input")[0] ?? assert.fail("pas de champ");
const boutonDe = (ligne: Faux) => ligne.dessous("button").find((bouton) => bouton.textContent === "save" || bouton.textContent === "saving…") ?? assert.fail("pas de bouton");

describe("les plafonds de durée, sur Health", () => {
  test("le temps maximum d'un ticket tel que la station le publie, sans champ ; les durées du dépôt ; les autres repliés", () => {
    const bloc = poserBlocPlafondsDuree(doc, { lecture: LECTURE, tempsMaxTicketMin: 15 });
    const tempsMax = ligneDe(bloc, "tempsMaxTicketMin");
    assert.match(texte(tempsMax), /^Ticket duration15 minpublished by the stationnot editable here yet/);
    assert.equal(tempsMax.dessous("input").length, 0);
    assert.match(texte(ligneDe(bloc, "gatesSeconds")), /^Gates duration120 sin the repository/);
    assert.match(texte(ligneDe(bloc, "testsSeconds")), /^Test suite durationnot setthe station's, if any/);
    const replie = bloc.dessous("details")[0] ?? assert.fail("pas de repli");
    assert.match(texte(replie), /Other drift thresholdsnone set in the repository/);
    assert.equal(replie.dessous("input").length, PLAFONDS.filter(({ duree }) => !duree).length);
  });

  test("« save » n'est cliquable qu'une fois la valeur changée, et donne la clé et ce qui est tapé", () => {
    const changes: [string, string][] = [];
    const bloc = poserBlocPlafondsDuree(doc, { lecture: LECTURE, changer: (cle, saisie) => changes.push([cle, saisie]) });
    const ligne = ligneDe(bloc, "gatesSeconds");
    assert.equal(boutonDe(ligne).disabled, true);
    const champ = champDe(ligne);
    champ.value = " 150 ";
    champ.declencher("input");
    assert.equal(boutonDe(ligne).disabled, false);
    boutonDe(ligne).click();
    assert.deepEqual(changes, [["gatesSeconds", "150"]]);
  });

  test("ce que l'écriture a rendu se dit sous le champ ; un refus garde son détail au survol", () => {
    const bloc = poserBlocPlafondsDuree(doc, {
      lecture: LECTURE,
      etats: new Map([
        ["gatesSeconds", { dit: { fait: "saved in the repository — the station applies it at its next fetch" } }],
        ["testsSeconds", { choisi: "abc", dit: { refus: "nothing was changed: test suite duration must be a number greater than zero", detail: "" } }],
      ]),
    });
    assert.match(texte(ligneDe(bloc, "gatesSeconds")), /saved in the repository/);
    const refusee = ligneDe(bloc, "testsSeconds");
    assert.match(texte(refusee), /nothing was changed/);
    assert.equal(champDe(refusee).value, "abc", "ce que le chef a tapé reste dans le champ");
  });

  test("tant que rien n'est lu, une ligne le dit ; une lecture ratée tient en une ligne", () => {
    assert.match(texte(poserBlocPlafondsDuree(doc, {})), /reading the caps of the repository…/);
    const rate = poserBlocPlafondsDuree(doc, { lecture: { sans: "duration caps unavailable", detail: "GitHub refused (HTTP 401)" } });
    assert.match(texte(rate), /duration caps unavailable/);
    assert.doesNotMatch(texte(rate), /HTTP 401/, "le détail est au survol, pas à l'écran");
  });
});

// La vue entière : parade, ouvert sur Kitchen > Health, devant un GitHub qui garde ce qu'on lui écrit.
const demarrage = () => ({
  configuration: pourLaBarre({ chemin: "/tmp/app.json", projets: [{ nom: "parade", dossier: "/tmp/parade" }] }, () => true),
  palette: PALETTE,
  exemple: EXEMPLE,
  onglets: ONGLETS,
  rubriques: RUBRIQUES,
  gestes: { allumage: ALLUMAGE, cuisine: GESTES_DE_LA_CUISINE, grants: { gestes: GESTES_DES_GRANTS, nommes: GRANTS }, directs: DIRECTS, confirmes: CONFIRMES },
  banniere: BANNIERE,
  calibrage: { modeles: MODELES, efforts: EFFORTS },
  code: undefined,
});

async function jouer(): Promise<{ vue: Jouee; ecrits: [string, string, string][] }> {
  let lecture = LECTURE;
  const ecrits: [string, string, string][] = [];
  const vue = await jouerLaVue({
    demarrage,
    espace: () => [],
    machines: () => [],
    plafondsDuree: async () => lecture,
    changerPlafondDuree: async (projet, cle, saisie): Promise<RenduDuPlafond> => {
      ecrits.push([projet, cle, saisie]);
      if ("plafonds" in lecture) lecture = { ...lecture, plafonds: lecture.plafonds.map((plafond) => (plafond.cle === cle ? { ...plafond, valeur: Number(saisie) } : plafond)) };
      return { fait: "saved in the repository — the station applies it at its next fetch", cle: cle as "gatesSeconds", valeur: Number(saisie) };
    },
  });
  (vue.element("projets").children.at(1) ?? assert.fail("pas de case pour parade")).click();
  await repos();
  return { vue, ecrits };
}
const bloc = (vue: Jouee) => vue.element("rail").children.find(({ dataset }) => dataset.bloc === "plafonds-duree") ?? assert.fail("pas de plafonds");

describe("Health, dans la vue", () => {
  test("un plafond changé sur Health part au process principal, et la ligne dit la valeur écrite", async () => {
    const { vue, ecrits } = await jouer();
    await ouvrirOnglet(vue, "Health");
    await repos();
    assert.deepEqual(vue.dernier("plafondsDuree"), ["parade"]);
    const ligne = ligneDe(bloc(vue), "gatesSeconds");
    const champ = champDe(ligne);
    champ.value = "150";
    champ.declencher("input");
    boutonDe(ligne).click();
    await repos();
    await repos();

    assert.deepEqual(ecrits, [["parade", "gatesSeconds", "150"]]);
    const apres = ligneDe(bloc(vue), "gatesSeconds");
    assert.match(texte(apres), /^Gates duration150 sin the repository/);
    assert.match(texte(apres), /saved in the repository — the station applies it at its next fetch/);
  });

  test("les plafonds ne se règlent nulle part ailleurs dans la page du projet", async () => {
    const { vue } = await jouer();
    for (const onglet of ["Rail", "Stations", "Cooks"] as const) {
      await ouvrirOnglet(vue, onglet);
      const plafonds = [...vue.element("rail").descendants()].filter(({ dataset }) => dataset.bloc === "plafonds-duree" || (dataset.cle !== undefined && PLAFONDS.some(({ cle }) => cle === dataset.cle)));
      assert.deepEqual(plafonds, [], onglet);
    }
    // Settings : ses réglages du projet n'en portent aucun.
    assert.deepEqual(CLES_DES_REGLAGES.filter((cle) => /drift|temps|duration|tests|gates/i.test(cle)), []);
  });
});
