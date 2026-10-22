// La même page (#1400), « Provide it on box » cliqué sur la carte du Postgres : l'issue s'écrit dans la demande de
// la box, la carte part ; celle de Docker reste, seule.
import type { Ecran } from "./commun.ts";
import { donnees, OUVRIR, SUR_LA_BOX } from "./cuisine-demenagee.ts";
import { BLOCAGES, CHOIX } from "./projet-choix.ts";

export const ecran: Ecran = {
  dit: "L'espace de « parade », l'issue « Provide it on box » retenue pour le Postgres : sa carte est partie, celle de Docker reste (#1400)",
  largeur: 1440,
  hauteur: 900,
  etapes: [OUVRIR, { cliquer: '#choix-du-projet section[data-choix="need:postgres"] li[data-issue="provide-here"] button' }],
  donnees: () => donnees({ ...SUR_LA_BOX, blocages: BLOCAGES, choix: CHOIX }, { choisirUneIssue: { fait: "“Provide it on box” is recorded: box applies it at its next read" } }),
};
