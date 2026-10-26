// Ce que la station de cet ordinateur fournit, tel que l'installation le dit (#1757) : l'app qui tient
// la station de sa machine (poste/station.ts) l'écrit dans son appairage (document.ts), et le
// reprend dans la demande de chaque projet où la station est ajoutée (projets/projets.ts). La station
// principale du projet le lit là, et la déclare à son journal avec ces capacités
// (runtime/src/projets/secondaires.ts) — sans une commande du chef.
//
// Un Mac fournit toujours `macos` : c'est le système même. S'y ajoute chaque capacité que le runtime
// détecte sur la machine (runtime/src/projets/ajout-de-station.ts, `capacitesDeLaMachine`) — Chrome,
// le SDK Android… —, regardée sans rien y lancer. Une autre machine ne fournit que ce qu'on y détecte.
// La plateforme se lit dans plateforme.ts, comme partout dans l'app.
import { estUnMac } from "../plateforme.ts";
import { capacitesLues } from "../projets/demande.ts";
import type { CapaciteDeLaMachine } from "../projets/projets.ts";

// La capacité que demande un ticket qui doit cuire sur un Mac.
export const MACOS = "macos";

export function ceQueFournitCetOrdinateur(plateforme: string, detectees: readonly CapaciteDeLaMachine[]): string[] {
  return capacitesLues([...(estUnMac(plateforme) ? [MACOS] : []), ...detectees.filter(({ detectee }) => detectee).map(({ capacite }) => capacite)]);
}
