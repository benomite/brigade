// La fiche de #31 sur le téléphone (ticket 1164) : sa PR fermée sans merge, la carte tranchée — « remove from the rail »,
// confirmé et fait.
import { gesteDeLaFiche } from "./telephone-gestes-commun.ts";

export const ecran = gesteDeLaFiche("La fiche de #31 sur le téléphone, tranchée : sortie du rail, en 412 × 915", 31, "retirer", true, { fait: "#31 left the rail" });
