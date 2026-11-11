// La page de « parade » après son premier ticket servi, l'offre du téléphone acceptée (#3303) : sur place, le lien de
// l'app Android que le process principal a lu (`lienDeLApk`) et « Sign in with the same GitHub account » — aucun téléphone
// connecté au compte (`telephoneConnecte`).
import type { Ecran } from "./commun.ts";
import { donnees, OUVRIR, SUR_LA_BOX } from "./cuisine-demenagee.ts";

export const ecran: Ecran = {
  dit: "L'espace de « parade » après son premier ticket servi, l'offre du téléphone acceptée : le lien de l'app Android et le même compte GitHub (#3303)",
  largeur: 1440,
  hauteur: 900,
  etapes: [OUVRIR, { cliquer: "#offre-telephone button[data-bouton=\"recommande\"]" }],
  donnees: () =>
    donnees(
      { ...SUR_LA_BOX, delai: { ajouteLe: "2026-10-20T09:00:00.000Z", serviLe: "2026-10-20T11:34:56.000Z", duree: 9_296_000 } },
      { lienDeLApk: "https://github.com/benomite/brigade/releases/download/android-v1.4.0/brigade.apk", telephoneConnecte: { connecte: false } },
    ),
};
