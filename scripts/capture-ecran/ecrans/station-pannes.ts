// La page d'une station en panne, ouverte d'un clic sur sa ligne de l'accueil : ce que la station
// publie sur GitHub (un document figé) passe par les modules de l'app (stations.ts, pannes.ts,
// accueil.ts) — la vue reçoit ce qu'elle recevrait, la panne et ses mots sont ceux du code.
import { type Accueil, ligneDeStation } from "../../../app/src/accueil.ts";
import { pannesDe } from "../../../app/src/pannes/pannes.ts";
import type { DocumentStation } from "../../../app/src/stations/document.ts";
import { etatDe, ligneDe, type StationVue } from "../../../app/src/stations/stations.ts";
import { configuration, cuisine, demarrage, type Ecran, MAINTENANT } from "./commun.ts";
import { PROJETS, RENDUS } from "./cuisine-figee.ts";

const instant = Date.parse(MAINTENANT);
const il_y_a = (minutes: number) => new Date(instant - minutes * 60_000).toISOString();

const EN_LIGNE: DocumentStation = {
  nom: "box",
  machine: "Debian 12 · 8 cores",
  version: "1.4.0",
  projets: ["parade", "cantine"],
  signeDeVie: il_y_a(0),
  cadenceMs: 60_000,
  arreteeLe: null,
  appairage: null,
  echus: [],
  miseAJour: null,
  connexionMax: { etat: "connectee", depuis: il_y_a(180) },
};

// Les trois pannes, chacune sur sa station.
export const DOCUMENTS = {
  "hors-ligne": { ...EN_LIGNE, signeDeVie: il_y_a(12), connexionMax: null },
  "mise-a-jour": { ...EN_LIGNE, miseAJour: { visee: "1.5.0", restauree: "1.4.0", le: il_y_a(4), retourRate: false } },
  "connexion-max": { ...EN_LIGNE, connexionMax: { etat: "perdue", depuis: il_y_a(12) } },
} satisfies Record<string, DocumentStation>;

export function pageDeStation(panne: keyof typeof DOCUMENTS, dit: string): Ecran {
  const document = DOCUMENTS[panne];
  const station: StationVue = {
    id: "box",
    nom: document.nom,
    machine: document.machine,
    ...ligneDe(document, instant),
    pannes: pannesDe(document, instant),
    dit: etatDe(document, instant).dit,
    version: document.version,
    projets: document.projets,
    max: etatDe(document, instant).etat === "en-ligne" ? (document.connexionMax?.etat ?? null) : null,
  };
  const accueil: Accueil = {
    projets: [],
    stations: [ligneDeStation(station, 0, false)],
    sante: { ton: "gris", dit: "Max ✓  ·  GitHub ✓", survol: "" },
  };
  return {
    dit,
    largeur: 1440,
    hauteur: 900,
    etapes: [{ cliquer: "#accueil-stations button.ligne" }],
    donnees: () => ({
      maintenant: MAINTENANT,
      reponses: { demarrage: { ...demarrage(configuration(PROJETS)), stations: { a: MAINTENANT, stations: [station] }, accueil } },
      envois: cuisine(RENDUS),
    }),
  };
}
