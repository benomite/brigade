// La page d'un projet en deux onglets (#1184) : Rail — ce qui t'attend, le kanban entier, Taken et Pass compris — et
// Cooks — ce qui tourne : la carte du projet et ses cooks, les stations, la
// lecture de `station` (plafond, saturation, consommation). Un seul est montré au centre ; le second reste à droite,
// le même, quel que soit l'onglet. L'app rouvre un projet sur le dernier onglet que le chef y a ouvert.
// La vue est jouée telle qu'elle est, devant un faux document (aides/fausse-vue.ts).
import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { ALLUMAGE } from "../../../src/allumage.ts";
import { mettreAPart } from "../../../src/attend.ts";
import { pourLaBarre } from "../../../src/barre.ts";
import { EXEMPLE } from "../../../src/config.ts";
import { PALETTE } from "../../../src/couleurs.ts";
import { GESTES_DE_LA_CUISINE } from "../../../src/cuisine.ts";
import { BANNIERE, tenirFaits, type Dessinable, type Faits } from "../../../src/faits.ts";
import { CONFIRMES, DIRECTS, GRANTS } from "../../../src/gestes.ts";
import { GESTES_DES_GRANTS } from "../../../src/grants.ts";
import { ONGLETS, RUBRIQUES } from "../../../src/onglets.ts";
import { EFFORTS, MODELES } from "../../../src/projets/projets.ts";
import type { Terminal } from "../../../src/terminaux.ts";
import { type Faux, FauxStockage, type Jouee, jouerLaVue, ouvrirOnglet, repos } from "../../aides/fausse-vue.ts";

const A = "2026-10-20T10:04:12.000Z";
const PARADE = "parade";
const FANFARE = "fanfare";
const SECOND: Terminal = { id: 1, projet: PARADE, genre: "second", titre: "second · claude", note: "fil repris", arrete: false };
const SECOND_DE_FANFARE: Terminal = { id: 7, projet: FANFARE, genre: "second", titre: "second · claude", note: "session neuve", arrete: false };
const PROJETS = [
  { nom: PARADE, dossier: "/tmp/parade" },
  { nom: FANFARE, dossier: "/tmp/fanfare" },
];
const demarrage = () => ({
  configuration: pourLaBarre({ chemin: "/tmp/app.json", projets: PROJETS }, () => true),
  palette: PALETTE,
  exemple: EXEMPLE,
  onglets: ONGLETS,
  rubriques: RUBRIQUES,
  gestes: { allumage: ALLUMAGE, cuisine: GESTES_DE_LA_CUISINE, grants: { gestes: GESTES_DES_GRANTS, nommes: GRANTS }, directs: DIRECTS, confirmes: CONFIRMES },
  banniere: BANNIERE,
  calibrage: { modeles: MODELES, efforts: EFFORTS },
  code: undefined,
});

// Un rail où chaque colonne a sa carte : #14 pris, #30 à la pass, #12 qui t'attend, #31 servi, #21 et #22 en attente.
const FAITS: Faits = {
  etat: "ouverte",
  lu: "2026-10-20T10:04:11.000Z",
  dernierTick: "2026-10-20T10:04:02.000Z",
  compteurs: { rail: 2, auTravail: 1, aLaPass: 1, attend: 1, livres24h: 1 },
  dernierEvenement: null,
  rail: [
    { ticket: 14, etat: "pris", titre: "Le journal en ajout seul", url: "https://github.com/benomite/brigade/issues/14", activite: { fait: "écrit", cible: "app/src/bon.ts", depuis: "2026-10-20T10:02:11.000Z" } },
    { ticket: 21, etat: "en attente", titre: "L'export du journal", url: "https://github.com/benomite/brigade/issues/21", activite: null },
    { ticket: 22, etat: "en attente", titre: "Un ticket libre", url: "https://github.com/benomite/brigade/issues/22", activite: null },
    { ticket: 30, etat: "en pass", titre: "La pass verte", url: "https://github.com/benomite/brigade/issues/30", activite: { fait: "gates en cours", cible: null, depuis: "2026-10-20T10:03:41.000Z" } },
    { ticket: 31, etat: "servi", titre: "Servi hier", url: "https://github.com/benomite/brigade/issues/31", activite: null },
    { ticket: 12, etat: "en pass", titre: "Validation SIRET", url: "https://github.com/benomite/brigade/issues/12", activite: null },
  ],
  cooks: [{ ticket: 14, titre: "Le journal en ajout seul", station: "box/claude" }],
  attend: [{ ticket: 12, titre: "Validation SIRET", url: "https://github.com/benomite/brigade/issues/12" }],
};
const STATUS = [
  "projet     parade",
  "cuisine    ouverte",
  "",
  "attend     1 décision attend le chef depuis 2 j",
  "  #12  depuis 2 j  livraison verte, non mergée faute de grant `merge`",
  "fin attend",
  "",
  "rail       2 en attente · 1 pris · 2 en pass · 1 servi",
  "",
].join("\n");
// Ce que `station` rend : le plafond de cooks, la machine et sa saturation, le quota consommé.
const STATION = "cooks      1 running — box: 3 at most — 8 cores\nmachine    saturée · charge 7.9\nquota      62 % consommé\n";

function dessinable(): Dessinable {
  const tenus = tenirFaits(() => new Map());
  tenus.recevoir({ projet: PARADE, demande: 0, a: A, sorties: [{ commande: "facts", texte: JSON.stringify(FAITS) }] });
  return tenus.attendre(mettreAPart({ projet: PARADE, demande: 0, a: A, sorties: [{ commande: "status", texte: STATUS }] })) ?? assert.fail("rien à redessiner");
}

async function jouer(stockage?: FauxStockage): Promise<Jouee> {
  return jouerLaVue({ demarrage, espace: (projet) => (projet === FANFARE ? [SECOND_DE_FANFARE] : [SECOND]), machines: () => [{ id: "poste", titre: "this Mac" }] }, { stockage });
}
// La case de la barre : « T », puis les projets dans l'ordre du fichier.
async function entrer(vue: Jouee, nom: string): Promise<void> {
  (vue.element("projets").children.at(PROJETS.findIndex((projet) => projet.nom === nom) + 1) ?? assert.fail(`pas de case pour ${nom}`)).click();
  await repos();
}
// L'espace de parade, ses faits lus.
async function ouvrir(stockage?: FauxStockage): Promise<Jouee> {
  const vue = await jouer(stockage);
  await entrer(vue, PARADE);
  vue.dire("surFaits", { ...dessinable(), demande: vue.dernier("faits")[0] as number });
  await repos();
  return vue;
}


const menu = (vue: Jouee) => vue.element("onglets-du-projet").children;
const sous = (vue: Jouee) => vue.element("onglets-cuisine").children;
const marques = (ou: Faux[]) => ou.filter((onglet) => onglet.ariaSelected === "true").map((onglet) => onglet.textContent);
const blocs = (vue: Jouee) => vue.element("rail").children.map((pose) => pose.dataset.bloc);

describe("le menu de la page d'un projet (#2485)", () => {
  test("exactement quatre entrées, Rail · Stations · Kitchen · Settings ; Rail est ouvert par défaut", async () => {
    const vue = await ouvrir();

    assert.deepEqual(menu(vue).map((onglet) => onglet.textContent), ["Rail", "Stations", "Kitchen", "Settings"]);
    assert.deepEqual(marques(menu(vue)), ["Rail"]);
    assert.equal(vue.element("rail").dataset.onglet, "rail");
    // Les sous-onglets de Kitchen ne se montrent que sous Kitchen.
    assert.equal(vue.element("onglets-cuisine").hidden, true);
  });

  test("Kitchen a deux sous-onglets, Health et Cooks, chacun ouvert d'un clic", async () => {
    const vue = await ouvrir();

    await ouvrirOnglet(vue, "Kitchen");
    assert.equal(vue.element("onglets-cuisine").hidden, false);
    assert.deepEqual(sous(vue).map((onglet) => onglet.textContent), ["Health", "Cooks"]);
    assert.deepEqual(marques(menu(vue)), ["Kitchen"]);
    assert.deepEqual(marques(sous(vue)), ["Health"]);

    await ouvrirOnglet(vue, "Cooks");
    assert.deepEqual(marques(menu(vue)), ["Kitchen"]);
    assert.deepEqual(marques(sous(vue)), ["Cooks"]);
    assert.equal(vue.element("rail").dataset.onglet, "cooks");

    await ouvrirOnglet(vue, "Health");
    assert.deepEqual(marques(sous(vue)), ["Health"]);
    assert.equal(vue.element("rail").dataset.onglet, "sante");
  });

  test("chaque bloc est monté dans son onglet", async () => {
    const vue = await ouvrir();
    assert.deepEqual(vue.element("bande-du-rail").children.map((pose) => pose.dataset.bloc), ["bande-rail"]);

    await ouvrirOnglet(vue, "Stations");
    assert.deepEqual(blocs(vue), ["liste-stations", "reglages-station", "station-locale"]);
    assert.deepEqual(vue.element("bande-du-rail").children, []);

    await ouvrirOnglet(vue, "Health");
    assert.deepEqual(blocs(vue), ["temps-tickets", "plafonds-duree", "closer"]);

    await ouvrirOnglet(vue, "Cooks");
    const poses = blocs(vue).filter((bloc) => bloc !== undefined);
    assert.deepEqual(poses, ["specialisations", "cahier"]);
  });

  test("Settings s'ouvre par-dessus, depuis le même menu, et garde son contenu", async () => {
    const vue = await ouvrir();
    (menu(vue).find((onglet) => onglet.textContent === "Settings") ?? assert.fail("pas d'entrée Settings")).click();
    await repos();
    assert.deepEqual(marques(menu(vue)), ["Settings"]);
    assert.equal(vue.element("etat").hidden, false);
  });
});
