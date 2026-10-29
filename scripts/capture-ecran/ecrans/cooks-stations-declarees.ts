// L'onglet Cooks de « parade » et ce que chaque station déclarée fournit (#1509, épique #1506) : sous ses stations, une
// ligne par station que sa box déclare — son nom, son plafond de cooks, ses capacités, et où elle tourne : la box
// (box/claude, atelier/claude) ou un autre poste (mac/claude, pc/claude).
// La déclaration arrive par le contrôle de l'installation, comme dans l'app (service.ts, `installation stations --json`).
import { commandeDeDemarrage, type Guide, type StationsLues } from "../../../app/src/service.ts";
import { configuration, cuisine, demarrage, type Ecran, MAINTENANT, type Rendu } from "./commun.ts";
import { FACTS } from "./cooks-stations.ts";
import { PROJETS, RENDUS } from "./cuisine-figee.ts";

const PARADE = RENDUS.parade as Rendu;

export const DECLAREES: StationsLues = {
  proposees: [{ nom: "box/claude", moteur: "claude", fournit: ["code", "raisonnement"] }],
  absent: null,
  declarees: [
    { nom: "box/claude", moteur: "claude", fournit: ["code", "raisonnement"], cooks: 3, distante: false },
    { nom: "mac/claude", moteur: "claude", fournit: ["navigateur-headless", "chrome-connecté"], cooks: 1, distante: true },
    { nom: "atelier/claude", moteur: "claude", fournit: ["code"], cooks: 2, distante: false },
    { nom: "pc/claude", moteur: "claude", fournit: ["code", "raisonnement"], cooks: 1, distante: true },
  ],
};

// L'installation de parade, finie, et son dernier contrôle : ce que la vue reçoit à l'ouverture de l'espace.
export const guide = (stations: StationsLues): Guide => ({
  projet: "parade",
  deplie: false,
  titre: "parade is installed",
  lecture: { etat: "lue", a: MAINTENANT },
  etapes: [],
  courante: null,
  annonces: { etat: "lues", liste: [] },
  demarrage: commandeDeDemarrage(PROJETS[0]!),
  termine: true,
  controle: { a: MAINTENANT, stations },
});

export const ecran: Ecran = {
  dit: "L'onglet Cooks de « parade » : sous ses stations, chaque station déclarée — son plafond de cooks, ses capacités, la box ou un autre poste",
  largeur: 1440,
  hauteur: 1400,
  etapes: [{ cliquer: '#projets > button[title^="parade — "]' }, { cliquer: "#onglets-du-projet button:nth-child(2)" }],
  donnees: () => ({
    maintenant: MAINTENANT,
    reponses: { demarrage: demarrage(configuration(PROJETS)), espace: [], service: guide(DECLAREES) },
    envois: cuisine({ ...RENDUS, parade: { ...PARADE, facts: FACTS } }),
  }),
};
