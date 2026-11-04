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
  // La liste de stations-cloud-secrets/ du runtime (#2231), mot pour mot.
  recoit: {
    recoit: [
      { cle: "depot", dit: "The name of the repository to work on (owner/name), and of no other repository of yours." },
      {
        cle: "jetonGithub",
        dit: "A GitHub token limited to that repository: it lets the station claim its tickets, push its branches, and open, review and merge its pull requests — nothing else on your account.",
      },
    ],
    jamais: [
      { cle: "sessionMax", dit: "Your Claude Max session: your login, its token and its quota stay on your machine." },
      { cle: "secretsDuProjet", dit: "The project's development secrets, the values behind `.claude/brigade/secrets`." },
      { cle: "autresJetons", dit: "Any other token or key: your own GitHub login, the GitHub App's private key, tokens for other repositories, API keys." },
      { cle: "machine", dit: "Anything else on your machine: its files, its SSH keys, the kitchen's state and journal." },
    ],
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
