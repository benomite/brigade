// Les remèdes des refus de la station, un par geste précis (#1204). Chaque
// fichier en porte un ; le registre (`../registre.ts`) les enregistre tous.
//
// Les refus que ce catalogue ne lève pas — personne ne peut les lever depuis
// l'app — portent, à la place, pourquoi il n'y a pas de bouton
// (`SANS_REMEDE`, `../registre.ts`).
import type { Remede } from "../registre.ts";
import { remedeDeLaLigneAMain } from "./ligne-a-la-main.ts";
import { remedeDeLaLigneDuProjet } from "./ligne-du-projet.ts";
import { remedeDuBacASable } from "./bac-a-sable.ts";
import { remedeDuClone, type OptionsDuClone } from "./clone.ts";
import { remedeDuPort } from "./port.ts";

export type OptionsDuCatalogue = OptionsDuClone & { claudeBin?: string };

export function remedesDuCatalogue(options: OptionsDuCatalogue = {}): Remede[] {
  return [remedeDuPort, remedeDeLaLigneAMain, remedeDeLaLigneDuProjet, remedeDuClone(options), remedeDuBacASable(options.claudeBin)];
}
