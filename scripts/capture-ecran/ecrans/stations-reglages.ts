// L'onglet Stations de « parade » et les réglages de chacune de ses stations (#2488, épique #2484) : son plafond de cooks,
// ses capacités, si elle prend les tickets ordinaires et si elle sert le projet — chacun avec son niveau. « parade » cuit
// sur ce Mac (mac/claude) ; deux autres postes le servent, l'un en prenant les tickets ordinaires (pc/claude), l'autre non
// (studio/claude). La déclaration arrive par le contrôle de l'installation, comme dans l'app (service.ts).
import { blocDesOrdinaires, type StationDesFaits } from "../../../app/src/ordinaires.ts";
import type { Faits } from "../../../app/src/faits.ts";
import type { StationsLues } from "../../../app/src/service.ts";
import { configuration, cuisine, demarrage, type Ecran, MAINTENANT, type Rendu } from "./commun.ts";
import { guide } from "./cooks-stations-commun.ts";
import { PROJETS, RENDUS } from "./cuisine-figee.ts";

const PARADE = { ...PROJETS[0]!, ordinaires: true, limiteCooks: 2 };
const RENDU = RENDUS.parade as Rendu;

export const DECLAREES: StationsLues = {
  proposees: [{ nom: "mac/claude", moteur: "claude", fournit: ["code", "macos"] }],
  absent: null,
  declarees: [
    { nom: "mac/claude", moteur: "claude", fournit: ["code", "macos"], cooks: 2, distante: false },
    { nom: "pc/claude", moteur: "claude", fournit: ["code", "navigateur-headless"], cooks: 1, distante: true },
    { nom: "studio/claude", moteur: "claude", fournit: ["macos", "chrome-connecté"], cooks: 3, distante: true },
  ],
};

const base = { plafond: null, bacASable: null, prendOrdinaires: false, cuisson: "cooking", cooks: [] };
const STATIONS: StationDesFaits[] = [
  { ...base, station: "mac/claude", distante: false, ordinaires: true, prendOrdinaires: true },
  { ...base, station: "pc/claude", distante: true, ordinaires: true, prendOrdinaires: true },
  { ...base, station: "studio/claude", distante: true, ordinaires: false },
];

export const ecran: Ecran = {
  dit: "L'onglet Stations de « parade » : pour chaque station, son plafond de cooks, ses capacités, les tickets ordinaires et si elle sert le projet, chacun avec son niveau",
  largeur: 1440,
  hauteur: 1300,
  etapes: [{ cliquer: '#projets > button[title^="parade"]' }, { cliquer: "#onglets-du-projet button:nth-child(2)" }],
  donnees: () => ({
    maintenant: MAINTENANT,
    reponses: {
      demarrage: demarrage(configuration([PARADE, ...PROJETS.slice(1)]), (nom) => nom === "parade"),
      espace: [],
      service: guide(DECLAREES),
      ordinaires: blocDesOrdinaires(PARADE, "darwin", STATIONS, true),
    },
    envois: cuisine({ ...RENDUS, parade: { ...RENDU, facts: { ...RENDU.facts, stations: STATIONS } as Faits } }),
  }),
};
