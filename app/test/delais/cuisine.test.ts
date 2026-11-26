// La part et la médiane de la vue cuisine (#4299) : le process principal les tire des temps que les stations du projet
// publient, et la bande du haut de la vue cuisine les pose — la ligne même de `brigade <project> status`.
import assert from "node:assert/strict";
import { test } from "node:test";
import { ENREGISTREMENTS } from "../../../runtime/test/delais/jeu.ts";
import { ALLUMAGE } from "../../src/allumage.ts";
import { pourLaBarre } from "../../src/barre.ts";
import { EXEMPLE } from "../../src/config.ts";
import { PALETTE } from "../../src/couleurs.ts";
import { GESTES_DE_LA_CUISINE } from "../../src/cuisine.ts";
import { delaiDuProjet } from "../../src/delais/cuisine.ts";
import { BANNIERE, tenirFaits, type Faits } from "../../src/faits.ts";
import { gestesDeCarte } from "../../src/gestes-fiche.ts";
import { CONFIRMES, DIRECTS } from "../../src/gestes.ts";
import { ONGLETS, RUBRIQUES } from "../../src/onglets.ts";
import { documentDeDemande, FICHIER_PROJETS, FICHIER_SUIVI, type ProjetDemande } from "../../src/projets/demande.ts";
import { calibrageRecommande, EFFORTS, MODELES, tenirProjets, type ProjetVu, type VuDesProjets } from "../../src/projets/projets.ts";
import type { Fichiers, GitHubDesStations } from "../../src/stations/github.ts";
import type { StationVue } from "../../src/stations/stations.ts";
import type { Terminal } from "../../src/terminaux.ts";
import { type Jouee, jouerLaVue, repos } from "../aides/fausse-vue.ts";

const MAINTENANT = Date.parse("2026-11-25T12:00:00.000Z");
const LIGNE = "taken-to-merged 24 h: 50% in 10 min or less (1 of 2), median 16.5 min";
const BOX: StationVue = { id: "g1", nom: "parade-box", machine: "Linux 6.1.0", etat: "en-ligne", ligne: "online", pannes: [], dit: "online", version: "1.4.0", projets: [], max: null };
const PARADE: ProjetDemande = { nom: "parade", depot: "benomite/parade", base: "main", principale: true, cooks: 2, manager: { modele: "sonnet", effort: "medium" }, reviewer: { modele: "opus", effort: "high" }, ouvertLe: null, demandeLe: null };

test("the published ticket times give the same line as `status`", () => {
  assert.equal(delaiDuProjet({ enregistrements: ENREGISTREMENTS }, new Date(MAINTENANT)), LIGNE);
  assert.equal(delaiDuProjet({ enregistrements: [] }, new Date(MAINTENANT)), "taken-to-merged 24 h: no merged ticket in the last 24 h");
});

async function lire(temps: object | undefined): Promise<ProjetVu | undefined> {
  const suivi = { nom: "parade", etat: "servi", dit: "", autoriser: [], serviLe: null, cuitSur: BOX.nom, ici: false, bascule: null, ...(temps === undefined ? {} : { temps }) };
  const gists = new Map<string, Fichiers>([[BOX.id, { [FICHIER_PROJETS]: documentDeDemande([PARADE]), [FICHIER_SUIVI]: JSON.stringify({ brigade: "projets-suivi", format: 1, a: new Date(MAINTENANT).toISOString(), projets: [suivi] }) }]]);
  const github: GitHubDesStations = { lister: async () => [], lire: async (id) => gists.get(id) ?? null, ecrire: async () => {}, supprimer: async () => {} };
  const vu = await tenirProjets({ github, stations: () => [BOX], depots: async () => [], surLecture: () => {}, maintenant: () => MAINTENANT, locale: () => null }).relire();
  return vu.projets.find(({ nom }) => nom === "parade");
}

test("the main process reads the line from the times a station publishes; without published times, no line", async () => {
  assert.equal((await lire({ enregistrements: ENREGISTREMENTS, lostTimeMaxMin: 2 }))?.delaiDePrise, LIGNE);
  const sans = await lire(undefined);
  assert.notEqual(sans, undefined);
  assert.equal(sans?.delaiDePrise, undefined);
});

const SECOND: Terminal = { id: 1, projet: "parade", genre: "second", titre: "second · claude", note: "session neuve", arrete: false };
const A = "2026-11-25T12:00:00.000Z";
const projetsDesStations = (projet: Partial<ProjetVu>): VuDesProjets => ({
  a: A,
  projets: [{ nom: "parade", depot: "benomite/parade", base: "main", suiviPar: { id: "g1", nom: "parade-box" }, stations: [{ id: "g1", nom: "parade-box", etat: "servi", dit: "", autoriser: [] }], servi: null, ...projet }],
  recommandee: "g1",
  avertissements: {},
  machines: {},
  calibrage: calibrageRecommande([]),
});

async function cuisine(projet: Partial<ProjetVu>): Promise<Jouee> {
  const demarrage = () => ({
    configuration: pourLaBarre({ chemin: "/tmp/app.json", projets: [{ nom: "parade", dossier: "/tmp/parade" }] }, () => true),
    palette: PALETTE, exemple: EXEMPLE, onglets: ONGLETS, rubriques: RUBRIQUES,
    gestes: { allumage: ALLUMAGE, cuisine: GESTES_DE_LA_CUISINE, directs: DIRECTS, confirmes: CONFIRMES },
    banniere: BANNIERE, calibrage: { modeles: MODELES, efforts: EFFORTS }, code: undefined,
    projetsDesStations: projetsDesStations(projet),
  });
  const vue = await jouerLaVue({ demarrage, espace: () => [SECOND], ouvrirIssue: () => true, gestesDeFiche: (carte) => gestesDeCarte(carte) });
  (vue.element("projets").children.at(1) ?? assert.fail("pas d'entrée")).click();
  await repos();
  const faits: Faits = { etat: "ouverte", lu: A, dernierTick: A, compteurs: { rail: 0, auTravail: 0, aLaPass: 0, attend: 0, livres24h: 0 }, dernierEvenement: null, cooks: [], attend: [], rail: [] };
  const recue = tenirFaits().recevoir({ projet: "parade", demande: 0, a: A, sorties: [{ commande: "facts", texte: JSON.stringify(faits) }] });
  vue.dire("surFaits", { ...recue, demande: vue.dernier("faits")[0] as number });
  await repos();
  return vue;
}

const bandeDuHaut = (vue: Jouee) => vue.element("rail").children.find(({ className }) => className === "bande-du-haut") ?? assert.fail("pas de bande du haut");

test("the top band of the kitchen view shows the share and the median, under the supervisor and closer lines", async () => {
  const lignes = bandeDuHaut(await cuisine({ delaiDePrise: LIGNE })).children.map(({ className, textContent }) => [className, textContent]);
  assert.deepEqual(lignes.at(-1), ["ligne-du-delai", LIGNE]);
  assert.match(lignes.map(([, texte]) => texte).join("\n"), /Supervisor[\s\S]*Closer[\s\S]*50% in 10 min or less[\s\S]*median 16\.5 min/);
});

test("without published times the band has no such line", async () => {
  const classes = bandeDuHaut(await cuisine({})).children.map(({ className }) => className);
  assert.equal(classes.includes("ligne-du-delai"), false);
});
