// Ce que les écrans de « undo » (ticket 3274) partagent : l'espace de « parade », assez large pour que sa colonne Served
// se voie — #9 et #7 y sont servis, leur PR mergée.
import type { Terminal } from "../../../app/src/terminaux.ts";
import { configuration, cuisine, demarrage, type Donnees, MAINTENANT } from "./commun.ts";
import { PROJETS, RENDUS } from "./cuisine-figee.ts";

const SECOND: Terminal = { id: 1, projet: "parade", genre: "second", titre: "second · claude", note: "fil repris : la session d'hier", arrete: false };

export const OUVRIR_PARADE = { cliquer: '#projets > button[title^="parade — "]' };
// Le bouton « undo » de la carte de #9, dans Served.
export const ANNULER_9 = { cliquer: '#rail li.bon[data-ticket="9"] button.annuler-servi' };

// `annulerServi` : ce que le process principal rend au clic sur « undo ».
export const donnees = (reponses: Record<string, unknown> = {}): Donnees => ({
  maintenant: MAINTENANT,
  reponses: { demarrage: demarrage(configuration(PROJETS)), espace: [SECOND], ...reponses },
  envois: cuisine(RENDUS),
});
