// #3870, critère 3 : ce qu'une station n'a pas pu — ici, installer les dépendances — se dit en une ligne sur sa carte de
// l'onglet Stations, pour que le chef sache quoi réparer ou décocher.
// Test d'acceptation gelé (#3725) : la ligne de la station dans les `facts` porte `lacks`, et la carte la dit une fois.
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, test } from "node:test";
import { ajouterProjetServi } from "../../../runtime/src/station-ordinateur/projets-servis.ts";
import type { Accueil } from "../../src/accueil.ts";
import { ALLUMAGE } from "../../src/allumage.ts";
import { mettreAPart } from "../../src/attend.ts";
import { pourLaBarre } from "../../src/barre.ts";
import { EXEMPLE, type Projet } from "../../src/config.ts";
import { PALETTE } from "../../src/couleurs.ts";
import { GESTES_DE_LA_CUISINE } from "../../src/cuisine.ts";
import { BANNIERE, tenirFaits, type Faits } from "../../src/faits.ts";
import { CONFIRMES, DIRECTS } from "../../src/gestes.ts";
import { ONGLETS, RUBRIQUES } from "../../src/onglets.ts";
import type { Panne } from "../../src/pannes/pannes.ts";
import { calibrageRecommande, machineProposee, EFFORTS, MODELES, type ProjetVu, type VuDesProjets } from "../../src/projets/projets.ts";
import type { StationVue, VuDesStations } from "../../src/stations/stations.ts";
import { ouvrirOnglet, jouerLaVue, repos } from "../aides/fausse-vue.ts";

const A = "2026-11-19T13:30:00.000Z";
const DEPOT = "benomite/brigade";
const LACUNE = "dependencies cannot be installed";
const MAC: StationVue = { id: "gmac", nom: "macbook", machine: "macOS 25.0.0", coeurs: 12, etat: "en-ligne", ligne: "online", pannes: [] as Panne[], dit: "online", version: "2.4.0", projets: [], max: "connectee" };
const ACCUEIL: Accueil = { projets: [], stations: [], sante: { ton: "vert", dit: "Max ✓  ·  GitHub ✓", survol: "" } };
const PROJET: Projet = { nom: "brigade", dossier: "/tmp/brigade", depot: DEPOT, base: "main" };
const AUTRE: Projet = { nom: "cantine", dossier: "/tmp/cantine", depot: "benomite/cantine", base: "main" };
const VU_PROJET: ProjetVu = { nom: "brigade", depot: DEPOT, base: "main", suiviPar: undefined, stations: [], servi: null, cuitSur: null, demenagement: null } as never;
const VU: VuDesProjets = { a: A, projets: [VU_PROJET], locale: "gmac", recommandee: "gmac", avertissements: {}, machines: { gmac: machineProposee(MAC) }, calibrage: calibrageRecommande([]) };
const ligneDuMac = { station: "macbook/claude", distante: false, plafond: 2, ordinaires: false, bacASable: null, prendOrdinaires: true, cuisson: "idle", arreteeDepuis: null, refus: null, presente: true, cooks: [], lacks: LACUNE };
const FAITS = { etat: "ouverte", lu: A, dernierTick: A, compteurs: { rail: 1, auTravail: 0, aLaPass: 0, attend: 0, livres24h: 0 }, dernierEvenement: null, rail: [], cooks: [], attend: [], livres: [], stations: [ligneDuMac] } as unknown as Faits;

const racines: string[] = [];
after(() => {
  for (const racine of racines) rmSync(racine, { recursive: true, force: true });
});

test("a station that lacked what a ticket needs says it in one line on its card in the Stations tab", async () => {
  const racine = mkdtempSync(join(tmpdir(), "acceptation-3870-"));
  racines.push(racine);
  ajouterProjetServi(racine, AUTRE.depot ?? "");
  ajouterProjetServi(racine, DEPOT);
  const vue = await jouerLaVue({
    demarrage: () => ({
      configuration: pourLaBarre({ chemin: "/tmp/app.json", projets: [PROJET, AUTRE] }, () => true, (nom) => nom === "brigade"),
      palette: PALETTE,
      exemple: EXEMPLE,
      onglets: ONGLETS,
      rubriques: RUBRIQUES,
      gestes: { allumage: ALLUMAGE, cuisine: GESTES_DE_LA_CUISINE, directs: DIRECTS, confirmes: CONFIRMES },
      banniere: BANNIERE,
      calibrage: { modeles: MODELES, efforts: EFFORTS },
      code: undefined,
      stations: { a: A, stations: [MAC] } satisfies VuDesStations,
      accueil: ACCUEIL,
      projetsDesStations: VU,
    }),
    espace: () => [],
  } as never);
  (vue.element("projets").children.at(1) ?? assert.fail("pas de case « brigade »")).click();
  await repos();
  const tenus = tenirFaits();
  const recue = tenus.recevoir({ projet: "brigade", demande: 0, a: A, sorties: [{ commande: "facts", texte: JSON.stringify(FAITS) }] });
  const dessinable = tenus.attendre(mettreAPart({ projet: "brigade", demande: 0, a: A, sorties: [{ commande: "status", texte: "" }] })) ?? recue;
  vue.dire("surFaits", { ...dessinable, demande: vue.dernier("faits")[0] as number });
  await repos();
  await ouvrirOnglet(vue, "Stations");
  const onglet = vue.element("rail").children.find(({ dataset }) => dataset.bloc === "stations-tab") ?? assert.fail("pas d'onglet des stations");
  const carte = onglet.dessous("section").find(({ className }) => className === "carte-de-station") ?? assert.fail("pas de carte de station");
  const lignes = carte.textContent.split("\n").filter((ligne) => ligne.includes(LACUNE));
  assert.equal(lignes.length, 1, `la carte dit « ${LACUNE} » : ${carte.textContent}`);
});
