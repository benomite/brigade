// La page d'une station, ouverte d'un clic sur sa ligne de « All stations », sur l'accueil (#3195) : ce que la station
// publie sur GitHub (un document figé) passe par les modules de l'app (stations.ts,
// accueil.ts) — la vue reçoit ce qu'elle recevrait, ses mots sont ceux du code.
import { type Home, type LineOfStation, lineOfStation } from "../../../app/src/home.ts";
import type { DocumentStation } from "../../../app/src/stations/document.ts";
import { stateOf, lineOf, lineOfVersion, type StationVue } from "../../../app/src/stations/stations.ts";
import { configuration, cuisine, demarrage, type Ecran, type Etape, MAINTENANT } from "./commun.ts";
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

// Une station en ligne, puis hors ligne.
export const DOCUMENTS = {
  "en-ligne": EN_LIGNE,
  "hors-ligne": { ...EN_LIGNE, signeDeVie: il_y_a(12), connexionMax: null },
} satisfies Record<string, DocumentStation>;

// `plus` : ce que le `status` d'un projet ajoute à la ligne de la station (son plafond de cooks, ce qui la retient).
export function pageDeStation(etat: keyof typeof DOCUMENTS, dit: string, etapes: Etape[] = [], plus: Partial<LineOfStation> = {}): Ecran {
  const document = DOCUMENTS[etat];
  const station: StationVue = {
    id: "box",
    nom: document.nom,
    machine: document.machine,
    ...lineOf(document, instant),
    dit: stateOf(document, instant).dit,
    version: document.version,
    projets: document.projets,
    max: stateOf(document, instant).etat === "en-ligne" ? (document.connexionMax?.etat ?? null) : null,
    versionDit: lineOfVersion(document, instant, il_y_a(3 * 24 * 60)),
  };
  const accueil: Home = {
    projets: [],
    stations: [{ ...lineOfStation(station, 0, []), ...plus }],
    sante: { ton: "gris", dit: "Max ✓  ·  GitHub ✓", survol: "" },
  };
  return {
    dit,
    largeur: 1440,
    hauteur: 900,
    etapes: [{ cliquer: "#toutes-les-stations button.ligne" }, ...etapes],
    donnees: () => ({
      maintenant: MAINTENANT,
      reponses: { demarrage: { ...demarrage(configuration(PROJETS)), stations: { a: MAINTENANT, stations: [station] }, accueil } },
      envois: cuisine(RENDUS),
    }),
  };
}
