// L'onglet Cooks de « parade » et ses stations cloud (#2232, épique #2223) : sous ses stations, leur coût par ticket
// servi — « not available yet », aucun ticket servi —, ses trois plafonds, vides, et « Add a cloud station ». Ce que le
// process principal lit des stations cloud arrive par `stationsCloud` (vue/pont.d.ts) : ici, un projet qui n'en a
// aucune, dont la liste de ce qu'une station reçoit n'est pas encore approuvée.
import type { VuDuCloud } from "../../../app/src/stations-cloud/stations-cloud.ts";
import type { Ecran } from "./commun.ts";
import { ecran as declarees } from "./cooks-stations-declarees.ts";

export const SANS_STATION: VuDuCloud = {
  projet: "parade",
  ajoutees: 0,
  plafonds: {},
  recoit: {
    recoit: ["A GitHub token scoped to benomite/parade: read the code, push branches, open and merge pull requests", "The repository to work on: benomite/parade", "The project's ceilings and its calibration"],
    jamais: ["Your Max session", "Any other secret of this computer or of your stations", "Your other repositories"],
  },
  approuvee: false,
  cout: { projet: "parade", coutTotal: 0, ticketsServis: 0, coutParTicket: "n/a" },
  periode: "this month",
};

// Le bloc des stations cloud, et ses gestes : ses champs, son bouton.
export const CHAMP = (borne: "aLaFois" | "heuresParJour" | "heuresParMois") => `#cloud-du-projet input[data-champ="${borne}"]`;
export const AJOUTER = { cliquer: "#cloud-du-projet .plafonds button.recommande" };

export const cloud = (vu: VuDuCloud, reponses: Record<string, unknown> = {}) => () => {
  const lues = declarees.donnees();
  return { ...lues, reponses: { ...lues.reponses, stationsCloud: vu, ...reponses } };
};

export const ecran: Ecran = {
  dit: "L'onglet Cooks de « parade » : ses stations cloud — « not available yet » pour le coût par ticket, ses trois plafonds vides et « Add a cloud station »",
  largeur: 1440,
  hauteur: 1800,
  etapes: declarees.etapes,
  donnees: cloud(SANS_STATION),
};
