// L'appairage du téléphone réussi (#1161) : l'app passe à « Tous les projets », où une ligne dit à quelle
// station il est appairé.
import { apresLeQr } from "./telephone-commun.ts";

export const ecran = apresLeQr("L'appairage du téléphone réussi : « Tous les projets », la station nommée en tête", { paired: true, station: "atelier" });
