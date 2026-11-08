// L'onglet Stations (#2487, épique #2484) : la liste des stations du projet, celle que pose stations-de-cuisson.js,
// et « Add a station », qui ouvre sur place l'étape « Who cooks this project? » — cet ordinateur d'abord, recommandé, puis
// les stations appairées à qui le projet n'est pas choisi. L'étape et son état sont joués seuls, puis la vue telle qu'elle
// est, devant un faux document (aides/fausse-vue.ts) : le chef ouvre l'onglet, ajoute une station, et la voit dans la liste.
import assert from "node:assert/strict";
import { describe, test } from "node:test";
import type { Faits as FaitsDuRuntime } from "../../../../../runtime/src/etat.ts";
import * as contrat from "../../../../../runtime/src/enregistrement-station/contrat.ts";
import { stationDuGist } from "../../../../../runtime/src/enregistrement-station/stations-du-compte.ts";
import { ALLUMAGE } from "../../../../src/allumage.ts";
import { pourLaBarre } from "../../../../src/barre.ts";
import { EXEMPLE } from "../../../../src/config.ts";
import { PALETTE } from "../../../../src/couleurs.ts";
import { GESTES_DE_LA_CUISINE } from "../../../../src/cuisine.ts";
import { BANNIERE, tenirFaits, type Faits } from "../../../../src/faits.ts";
import { CONFIRMES, DIRECTS } from "../../../../src/gestes.ts";
import { ONGLETS, RUBRIQUES } from "../../../../src/onglets.ts";
import { EFFORTS, MODELES } from "../../../../src/projets/projets.ts";
import type { Choix, StationEnregistree, StationsDuCompte } from "../../../../src/stations-du-compte.ts";
import type { Terminal } from "../../../../src/terminaux.ts";
import { ANNULER, AUCUNE, ENVOI, FAIT, HORS_LIGNE, ICI, poserEtapeStation, stationsAProposer, tenirLAjoutDeStation, TITRE, type EtatDeLAjout } from "../../../../src/vue/projet/stations/AjoutStation.js";
import { AJOUTER, poserBlocListeStations } from "../../../../src/vue/projet/stations/ListeStations.js";
import { Faux, type Jouee, jouerLaVue, ouvrirOnglet, repos } from "../../../aides/fausse-vue.ts";

const doc = { createElement: (balise: string) => new Faux(balise) };
const PARADE = "parade";
const DEPOT = "chef/parade";
const VU = "2026-11-05T21:00:00.000Z";

// Une station du compte, telle que le lecteur du runtime la tire de son gist.
function appairee(id: string, name: string, repositories: string[], enLigne = true): StationEnregistree {
  const instant = Date.parse(VU) + (enLigne ? 1_000 : 3_600_000);
  const station = stationDuGist(
    id,
    {
      [contrat.FICHIER_ENREGISTREMENT]: JSON.stringify({ brigade: "station-registration", format: 1, name, platform: "linux", machine: "Linux 6.1.0", version: "2.4.0", registeredAt: "2026-11-01T08:00:00.000Z", lastSeen: VU, refreshMs: 120_000, stoppedAt: null }),
      [contrat.FICHIER_SELECTION]: JSON.stringify({ brigade: "station-selection", format: 1, repositories, updatedAt: VU }),
    },
    "chef",
    instant,
  );
  return "illisible" in station ? assert.fail(station.illisible) : station;
}
const BOX = appairee("a1b2", "parade-box", ["Chef/Parade"]);
const ATELIER = appairee("c3d4", "atelier", ["chef/cantine"]);
const MAC = appairee("e5f6", "macbook", []);

const boutons = (racine: Faux) => racine.dessous("button").filter((bouton) => bouton.className !== "aide");
const bouton = (racine: Faux, texte: string) => boutons(racine).find((pose) => pose.textContent === texte) ?? assert.fail(`pas de bouton « ${texte} »`);
const gestesNuls = { servirIci: () => {}, confier: () => {}, annuler: () => {} };

describe("l'étape « Who cooks this project? »", () => {
  test("les stations à proposer : celles à qui le dépôt n'est pas choisi, sans égard à la casse, hors celle de cet ordinateur", () => {
    assert.deepEqual(stationsAProposer([BOX, ATELIER, MAC], DEPOT, MAC.id).map(({ name }) => name), ["atelier"]);
    assert.deepEqual(stationsAProposer([BOX, ATELIER, MAC], DEPOT, null).map(({ name }) => name), ["atelier", "macbook"]);
  });

  test("ce qu'on attend du chef en tête ; cet ordinateur d'abord, recommandé ; une station hors ligne le dit ; cancel", () => {
    const hors = appairee("g7h8", "vieux-pc", [], false);
    const pose = poserEtapeStation(doc, { projet: PARADE, ici: "this Mac", iciOffert: true, stations: [ATELIER, hors] }, { ouvert: true }, gestesNuls) as Faux;
    assert.equal(pose.children[0]?.textContent, TITRE(PARADE));
    assert.deepEqual(boutons(pose).map(({ textContent }) => textContent), ["this Mac", "atelier", "vieux-pc", ANNULER]);
    assert.equal(bouton(pose, "this Mac").className, "recommande");
    assert.equal(bouton(pose, "atelier").className, "");
    assert.ok(pose.dessous("li").find((li) => li.dataset.choix === "g7h8")?.textContent.includes(HORS_LIGNE));
    // Chaque choix dit au survol ce qu'il fait : rien n'est écrit à plat sous le bouton.
    assert.equal(pose.dessous("button").filter((aide) => aide.className === "aide").length, 3);
  });

  test("sans choix, une ligne le dit ; un choix qui s'écrit grise les boutons ; un refus se dit en une ligne, sa suite au survol", () => {
    const vide = poserEtapeStation(doc, { projet: PARADE, ici: "this Mac", iciOffert: false, stations: [] }, { ouvert: true }, gestesNuls) as Faux;
    assert.ok(vide.textContent.includes(AUCUNE(PARADE)));
    assert.deepEqual(boutons(vide).map(({ textContent }) => textContent), [ANNULER]);

    const enCours = poserEtapeStation(doc, { projet: PARADE, ici: "this Mac", iciOffert: true, stations: [ATELIER] }, { ouvert: true, enCours: ICI }, gestesNuls) as Faux;
    assert.ok(boutons(enCours).every(({ disabled }) => disabled));
    assert.ok(enCours.dessous("li")[0]?.textContent.includes(ENVOI));

    const refus = poserEtapeStation(doc, { projet: PARADE, ici: "this Mac", iciOffert: true, stations: [] }, { ouvert: true, refus: { ligne: "nothing was written: GitHub did not take the change", detail: "HTTP 502" } }, gestesNuls) as Faux;
    const ligne = refus.dessous("p").find(({ className }) => className === "refus") ?? assert.fail("pas de refus");
    assert.equal(ligne.children[0]?.textContent, "nothing was written: GitHub did not take the change");
    assert.equal(ligne.dessous("button")[0]?.ariaLabel, "HTTP 502");
  });

  test("l'état : un choix à la fois ; écrit, l'étape se referme et dit qui a reçu le projet ; refusé, elle reste ouverte", async () => {
    const servis: string[] = [];
    const choisis: [string, string[]][] = [];
    let rendus = 0;
    let lacher = (_rendu: Choix) => {};
    const ajout = tenirLAjoutDeStation({
      servirIci: async (depot) => (servis.push(depot), { depots: [depot] }),
      choisir: (id, depots) => (choisis.push([id, depots]), new Promise<Choix>((rendre) => (lacher = rendre))),
      rendre: () => void (rendus += 1),
    });
    assert.deepEqual(ajout.etatDe(PARADE), { ouvert: false });
    ajout.ouvrir(PARADE);
    ajout.confier(PARADE, DEPOT, ATELIER);
    assert.deepEqual(ajout.etatDe(PARADE), { ouvert: true, enCours: ATELIER.id });
    // Tant qu'atelier s'écrit, rien d'autre ne part ; cancel attend aussi.
    ajout.servirIci(PARADE, DEPOT, "this Mac");
    ajout.annuler(PARADE);
    assert.deepEqual(servis, []);
    assert.deepEqual(choisis, [[ATELIER.id, ["chef/cantine", DEPOT]]]);
    lacher({ refus: "not saved: GitHub did not take the change", detail: "HTTP 502" });
    await repos();
    assert.deepEqual(ajout.etatDe(PARADE), { ouvert: true, refus: { ligne: "nothing was written: GitHub did not take the change", detail: "HTTP 502" } });

    ajout.servirIci(PARADE, DEPOT, "this Mac");
    await repos();
    assert.deepEqual(servis, [DEPOT]);
    assert.deepEqual(ajout.etatDe(PARADE), { ouvert: false, fait: "this Mac" } satisfies EtatDeLAjout);
    assert.deepEqual(ajout.etatDe("cantine"), { ouvert: false }, "l'état est celui d'un projet");
    assert.ok(rendus >= 5);
  });

  test("le bloc : la liste qu'on lui donne, telle quelle, puis « Add a station » ; ouvert, l'étape à sa place ; fait, une ligne", () => {
    const liste = new Faux("div");
    const donnees = { projet: PARADE, ici: "this Mac", iciOffert: true, stations: [ATELIER] };
    const gestes = { ...gestesNuls, ouvrir: () => {} };
    const ferme = poserBlocListeStations(doc, { liste, ajout: { donnees, etat: { ouvert: false }, gestes } });
    assert.equal(ferme.children[1], liste);
    assert.deepEqual(boutons(ferme).map(({ textContent }) => textContent), [AJOUTER]);
    assert.deepEqual(boutons(poserBlocListeStations(doc, { liste })), [], "sans ajout, pas de bouton");
    const ouvert = poserBlocListeStations(doc, { liste, ajout: { donnees, etat: { ouvert: true }, gestes } });
    assert.deepEqual(boutons(ouvert).map(({ textContent }) => textContent), ["this Mac", "atelier", ANNULER]);
    const fait = poserBlocListeStations(doc, { liste, ajout: { donnees, etat: { ouvert: false, fait: "atelier" }, gestes } });
    assert.ok(fait.textContent.includes(FAIT("atelier", PARADE)));
  });
});

// La vue telle qu'elle est : parade, son dépôt connu, cuit sur la box ; ce Mac a sa station, qui ne sert pas parade.
type DuRuntime = FaitsDuRuntime["stations"][number];
const station = (nom: string): DuRuntime => ({ station: nom, distante: false, plafond: 2, ordinaires: false, bacASable: null, prendOrdinaires: true, cuisson: "cooking", arreteeDepuis: null, refus: null, cooks: [] });
const FAITS: Faits = {
  etat: "ouverte",
  lu: "2026-11-05T21:04:11.000Z",
  dernierTick: "2026-11-05T21:04:02.000Z",
  compteurs: { rail: 1, auTravail: 0, aLaPass: 0, attend: 0, livres24h: 0 },
  dernierEvenement: null,
  rail: [{ ticket: 21, etat: "en attente", titre: "L'export du journal", url: "https://github.com/chef/parade/issues/21", activite: null }],
  cooks: [],
  attend: [],
};
const SECOND: Terminal = { id: 1, projet: PARADE, genre: "second", titre: "second · claude", note: "fil repris", arrete: false };
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
const COMPTE: StationsDuCompte = { state: "listed", stations: [BOX, ATELIER], unreadable: [] };

function recevoir(vue: Jouee, stations: DuRuntime[]): void {
  vue.dire("surFaits", { ...tenirFaits(() => new Map()).recevoir({ projet: PARADE, demande: 0, a: VU, sorties: [{ commande: "facts", texte: JSON.stringify({ ...FAITS, stations }) }] }), demande: vue.dernier("faits")[0] as number });
}
async function ouvrir() {
  const vue = await jouerLaVue({
    demarrage,
    espace: () => [SECOND],
    machines: () => [{ id: "poste", titre: "this Mac" }],
    projetsServis: () => ({ depots: [] }),
    servirUnProjet: (depot, servi) => ({ depots: servi ? [depot] : [] }),
    stationsDuCompte: () => COMPTE,
    choisirLesProjets: (_id, depots) => ({ selection: depots }),
  });
  (vue.element("projets").children.at(1) ?? assert.fail("pas de case pour parade")).click();
  await repos();
  recevoir(vue, [station("box/claude")]);
  await repos();
  return vue;
}
const lignes = (vue: Jouee) =>
  vue
    .element("rail")
    .dessous("li")
    .filter((li) => li.className === "station-de-cuisson")
    .map((li) => li.dataset.station);
const bloc = (vue: Jouee) => vue.element("rail").children.find((pose) => pose.dataset.bloc === "liste-stations") ?? assert.fail("pas de bloc « liste-stations »");

describe("l'onglet Stations de la vue", () => {
  test("la liste est celle des stations du projet, ligne pour ligne ; « Add a station » est dessous", async () => {
    const vue = await ouvrir();
    await ouvrirOnglet(vue, "Stations");
    assert.equal(vue.element("rail").dataset.onglet, "stations");
    assert.deepEqual(lignes(vue), ["box/claude"]);
    assert.ok(bloc(vue).dessous("div").some(({ id }) => id === "cuisson-du-projet"), "l'élément des stations du projet");
    assert.deepEqual(boutons(bloc(vue)).at(-1)?.textContent, AJOUTER);
  });

  test("« Add a station » ouvre l'étape dans l'onglet, ce Mac en premier ; choisi, il sert parade, et sa station entre dans la liste", async () => {
    const vue = await ouvrir();
    await ouvrirOnglet(vue, "Stations");
    bouton(bloc(vue), AJOUTER).click();
    await repos();
    // L'étape est dans l'onglet : le menu marque toujours Stations.
    assert.equal(vue.element("rail").dataset.onglet, "stations");
    assert.ok(bloc(vue).textContent.includes(TITRE(PARADE)));
    // Ce Mac d'abord ; parade-box, à qui parade est déjà choisi, n'est pas proposée.
    assert.deepEqual(boutons(bloc(vue)).slice(-3).map(({ textContent }) => textContent), ["this Mac", "atelier", ANNULER]);

    bouton(bloc(vue), "this Mac").click();
    await repos();
    assert.deepEqual(vue.dernier("servirUnProjet"), [DEPOT, true]);
    assert.ok(!bloc(vue).textContent.includes(TITRE(PARADE)), "l'étape se referme");
    assert.ok(bloc(vue).textContent.includes(FAIT("this Mac", PARADE)));
    // La station de ce Mac prend parade : la lecture suivante la porte, et la liste la montre.
    recevoir(vue, [station("box/claude"), station("mac/claude")]);
    await repos();
    assert.deepEqual(lignes(vue), ["box/claude", "mac/claude"]);
  });

  test("une station appairée choisie reçoit parade dans sa sélection ; cancel referme sans rien écrire", async () => {
    const vue = await ouvrir();
    await ouvrirOnglet(vue, "Stations");
    bouton(bloc(vue), AJOUTER).click();
    await repos();
    bouton(bloc(vue), ANNULER).click();
    await repos();
    assert.ok(!bloc(vue).textContent.includes(TITRE(PARADE)));
    assert.equal(vue.appels.filter(({ geste }) => geste === "servirUnProjet" || geste === "choisirLesProjets").length, 0);

    bouton(bloc(vue), AJOUTER).click();
    await repos();
    bouton(bloc(vue), "atelier").click();
    await repos();
    assert.deepEqual(vue.dernier("choisirLesProjets"), [ATELIER.id, ["chef/cantine", DEPOT]]);
    assert.ok(bloc(vue).textContent.includes(FAIT("atelier", PARADE)));
  });
});
