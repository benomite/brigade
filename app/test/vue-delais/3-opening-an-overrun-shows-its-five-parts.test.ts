// Test d'acceptation (#4309). Critère 3 : ouvrir un dépassement montre ses cinq parts (cook, gates, review, send-backs, waits) en minutes.
import assert from "node:assert/strict";
import { test } from "node:test";
import type { Accueil } from "../../src/accueil.ts";
import { ALLUMAGE } from "../../src/allumage.ts";
import { pourLaBarre } from "../../src/barre.ts";
import { EXEMPLE, type Projet } from "../../src/config.ts";
import { PALETTE } from "../../src/couleurs.ts";
import { GESTES_DE_LA_CUISINE } from "../../src/cuisine.ts";
import { BANNIERE } from "../../src/faits.ts";
import { CONFIRMES, DIRECTS } from "../../src/gestes.ts";
import { ONGLETS, RUBRIQUES } from "../../src/onglets.ts";
import { calibrageRecommande, EFFORTS, machineProposee, MODELES, type ProjetVu, type VuDesProjets } from "../../src/projets/projets.ts";
import type { Panne } from "../../src/pannes/pannes.ts";
import type { VuDesStations } from "../../src/stations/stations.ts";
import { jouerLaVue, repos, type Jouee } from "../aides/fausse-vue.ts";

const A = "2026-10-22T12:00:00.000Z";
const BOX = { id: "g1", nom: "box", machine: "Linux 6.1.0", coeurs: 8, etat: "en-ligne", ligne: "online · version 1.4.0 · no project", pannes: [] as Panne[], dit: "online", version: "1.4.0", projets: [] as string[], max: null } as const;
const ACCUEIL: Accueil = { projets: [], stations: [], sante: { ton: "vert", dit: "Max ✓  ·  GitHub ✓", survol: "" } };
const PARADE: Projet = { nom: "parade", dossier: "/tmp/parade", depot: "benomite/parade", base: "main" };

// The `delais` object of `brigade <project> status --json`, as the ticket fixes it.
const pire = (ticket: number, titre: string, attendu_min: number, reel_min: number, repartition_min: object) => ({ ticket, titre, attendu_min, reel_min, modele: "opus", effort: "medium", repartition_min });
const DELAIS = {
  fenetre_heures: 24,
  fusionnes: 24,
  dans_les_temps: 20,
  part_dans_les_temps: 20 / 24,
  sans_temps_attendu: 0,
  pires_depassements: [
    pire(4401, "Slowest overrun alpha", 10, 91, { cook: 31, gates: 7, review: 12, renvois: 37, attentes: 4 }),
    pire(4402, "Middle overrun bravo", 20, 52, { cook: 21, gates: 5, review: 9, renvois: 13, attentes: 4 }),
    pire(4403, "Mild overrun charlie", 30, 47, { cook: 25, gates: 6, review: 8, renvois: 3, attentes: 5 }),
  ],
};

// The view is played against the fake bridge; `delais` rides on the project's published status data, next to `temps`.
async function ouvrir(delais: object | undefined): Promise<Jouee> {
  const projet = {
    nom: "parade", depot: "benomite/parade", base: "main", suiviPar: { id: "g1", nom: "box" },
    stations: [{ id: "g1", nom: "box", etat: "en-preparation", dit: "", autoriser: [] }],
    servi: null, cuitSur: { id: "g1", nom: "box", ici: false },
    ...(delais === undefined ? {} : { delais }),
  } as unknown as ProjetVu;
  const vus: VuDesProjets = { a: A, projets: [projet], recommandee: "g1", avertissements: {}, machines: { g1: machineProposee(BOX) }, calibrage: calibrageRecommande([]) };
  const demarrage = () => ({
    configuration: pourLaBarre({ chemin: "/tmp/app.json", projets: [PARADE] }),
    palette: PALETTE, exemple: EXEMPLE, onglets: ONGLETS, rubriques: RUBRIQUES,
    gestes: { allumage: ALLUMAGE, cuisine: GESTES_DE_LA_CUISINE, directs: DIRECTS, confirmes: CONFIRMES },
    banniere: BANNIERE, calibrage: { modeles: MODELES, efforts: EFFORTS }, code: undefined,
    stations: { a: A, stations: [BOX] } satisfies VuDesStations, accueil: ACCUEIL, projetsDesStations: vus,
  });
  const vue = await jouerLaVue({ demarrage, espace: () => [], autoriserSurGitHub: () => true });
  (vue.element("projets").children.at(1) ?? assert.fail("pas de case « parade »")).click();
  await repos();
  return vue;
}
const page = (vue: Jouee) => vue.poses().map(({ textContent }) => textContent).join("\n");

test("opening an overrun shows its five parts in minutes", async () => {
  const vue = await ouvrir(DELAIS);
  const titre = DELAIS.pires_depassements[0]!.titre;
  // Open it as the chef would: click what carries the title, smallest element first, then its ancestors.
  const porteurs = vue.poses().filter(({ textContent }) => textContent.includes(titre)).sort((a, b) => a.textContent.length - b.textContent.length);
  assert.ok(porteurs.length > 0, "the overrun is shown");
  for (const pose of porteurs.slice(0, 3)) pose.click();
  await repos();
  const texte = page(vue);
  for (const [nom, valeur] of [["cook", 31], ["gates", 7], ["review", 12], ["send-?backs?", 37], ["waits?", 4]] as const) {
    assert.match(texte, new RegExp(`${nom}\\D{0,12}${valeur}\\s*min`, "i"), `${nom}: ${valeur} min`);
  }
});
