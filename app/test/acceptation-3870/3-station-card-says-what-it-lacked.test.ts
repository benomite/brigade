// #3870, critère 3 : ce qu'une station n'a pas pu — ici, installer les dépendances — se dit en une ligne sur sa carte de
// l'onglet Stations, pour que le chef sache quoi réparer ou décocher.
// Test d'acceptation gelé (#3725) : la ligne de la station dans les `facts` porte `lacks`, et la carte la dit une fois.
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, test } from "node:test";
import { ajouterProjetServi } from "../../../runtime/src/station-ordinateur/projets-servis.ts";
import type { Home } from "../../src/home.ts";
import { ALLUMAGE } from "../../src/allumage.ts";
import { mettreAPart } from "../../src/awaiting.ts";
import { pourLaBar } from "../../src/bar.ts";
import { EXEMPLE, type Project } from "../../src/config.ts";
import { PALETTE } from "../../src/couleurs.ts";
import { KITCHEN_ACTIONS } from "../../src/kitchen.ts";
import { BANNIERE, holdFacts, type Facts } from "../../src/facts.ts";
import { CONFIRMES, DIRECTS } from "../../src/actions.ts";
import { ONGLETS, RUBRIQUES } from "../../src/onglets.ts";
import type { Outage } from "../../src/outages/outages.ts";
import { calibrationRecommande, machineProposee, EFFORTS, MODELES, type ProjectVu, type VuDesProjects } from "../../src/projects/projects.ts";
import type { StationVue, VuDesStations } from "../../src/stations/stations.ts";
import { ouvrirOnglet, jouerLaVue, repos } from "../aides/fausse-vue.ts";

const A = "2026-11-19T13:30:00.000Z";
const REPOSITORY = "benomite/brigade";
const LACUNE = "dependencies cannot be installed";
const MAC: StationVue = { id: "gmac", nom: "macbook", machine: "macOS 25.0.0", coeurs: 12, etat: "en-ligne", ligne: "online", pannes: [] as Outage[], dit: "online", version: "2.4.0", projets: [], max: "connectee" };
const HOME: Home = { projets: [], stations: [], sante: { ton: "vert", dit: "Max ✓  ·  GitHub ✓", survol: "" } };
const PROJECT: Project = { nom: "brigade", dossier: "/tmp/brigade", depot: REPOSITORY, base: "main" };
const AUTRE: Project = { nom: "cantine", dossier: "/tmp/cantine", depot: "benomite/cantine", base: "main" };
const VU_PROJECT: ProjectVu = { nom: "brigade", depot: REPOSITORY, base: "main", suiviPar: undefined, stations: [], servi: null, cuitSur: null, demenagement: null } as never;
const VU: VuDesProjects = { a: A, projets: [VU_PROJECT], locale: "gmac", recommandee: "gmac", avertissements: {}, machines: { gmac: machineProposee(MAC) }, calibrage: calibrationRecommande([]) };
const lineDuMac = { station: "macbook/claude", distante: false, plafond: 2, ordinaires: false, bacASable: null, prendOrdinaires: true, cuisson: "idle", arreteeDepuis: null, refus: null, presente: true, cooks: [], lacks: LACUNE };
const FACTS = { etat: "ouverte", lu: A, dernierTick: A, compteurs: { rail: 1, auTravail: 0, aLaPass: 0, attend: 0, livres24h: 0 }, dernierEvenement: null, rail: [], cooks: [], attend: [], livres: [], stations: [lineDuMac] } as unknown as Facts;

const racines: string[] = [];
after(() => {
  for (const racine of racines) rmSync(racine, { recursive: true, force: true });
});

test("a station that lacked what a ticket needs says it in one line on its card in the Stations tab", async () => {
  const racine = mkdtempSync(join(tmpdir(), "acceptation-3870-"));
  racines.push(racine);
  ajouterProjetServi(racine, AUTRE.depot ?? "");
  ajouterProjetServi(racine, REPOSITORY);
  const vue = await jouerLaVue({
    demarrage: () => ({
      configuration: pourLaBar({ chemin: "/tmp/app.json", projets: [PROJECT, AUTRE] }, () => true, (name) => name === "brigade"),
      palette: PALETTE,
      exemple: EXEMPLE,
      onglets: ONGLETS,
      rubriques: RUBRIQUES,
      gestes: { allumage: ALLUMAGE, cuisine: KITCHEN_ACTIONS, directs: DIRECTS, confirmes: CONFIRMES },
      banniere: BANNIERE,
      calibrage: { modeles: MODELES, efforts: EFFORTS },
      code: undefined,
      stations: { a: A, stations: [MAC] } satisfies VuDesStations,
      accueil: HOME,
      projetsDesStations: VU,
    }),
    espace: () => [],
  } as never);
  (vue.element("projets").children.at(1) ?? assert.fail("pas de case « brigade »")).click();
  await repos();
  const tenus = holdFacts();
  const recue = tenus.recevoir({ projet: "brigade", demande: 0, a: A, sorties: [{ commande: "facts", texte: JSON.stringify(FACTS) }] });
  const dessinable = tenus.attendre(mettreAPart({ projet: "brigade", demande: 0, a: A, sorties: [{ commande: "status", texte: "" }] })) ?? recue;
  vue.dire("surFaits", { ...dessinable, demande: vue.dernier("faits")[0] as number });
  await repos();
  await ouvrirOnglet(vue, "Stations");
  const onglet = vue.element("rail").children.find(({ dataset }) => dataset.bloc === "stations-tab") ?? assert.fail("pas d'onglet des stations");
  const card = onglet.dessous("section").find(({ className }) => className === "carte-de-station") ?? assert.fail("pas de carte de station");
  const lines = card.textContent.split("\n").filter((line) => line.includes(LACUNE));
  assert.equal(lines.length, 1, `la carte dit « ${LACUNE} » : ${card.textContent}`);
});
