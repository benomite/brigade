// La carte de #23 dans la colonne WAITING de « parade » : « it arrived, back to the kitchen » cliqué (#1740) — GitHub a
// refusé le commentaire : rien n'est posté, la carte reste dans WAITING et le dit en une ligne.
import type { Ecran } from "./commun.ts";
import { carteWaitingArrivee } from "./carte-waiting-arrivee.ts";

export const ecran: Ecran = carteWaitingArrivee(
  "La carte de #23 dans WAITING de « parade » : « it arrived, back to the kitchen » cliqué (#1740) — GitHub refuse le commentaire, la carte reste et dit pourquoi",
  { refus: "The gesture could not be posted on the Kitchen board of chef/parade: GitHub refused the comment (HTTP 403): Resource not accessible by integration.", detail: "" },
);
