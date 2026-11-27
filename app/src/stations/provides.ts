// Ce que la station de cet ordinateur fournit, tel que l'installation le dit (#1757) : l'app qui tient
// la station de sa machine (workstation/station.ts) l'écrit dans son appairage (document.ts), et le
// reprend dans la demande de chaque projet où la station est ajoutée (projects/projects.ts). La station
// principale du projet le lit là, et la déclare à son journal avec ces capacités
// (retiré par #2713) — sans une commande du chef.
//
// Un Mac fournit toujours `macos` : c'est le système même. S'y ajoute chaque capacité que le runtime
// détecte sur la machine (`capacitesDeLaMachine`) — Chrome,
// le SDK Android… —, regardée sans rien y lancer. Une autre machine ne fournit que ce qu'on y détecte.
// La plateforme se lit dans platform.ts, comme partout dans l'app.
import { isOneMac } from "../platform.ts";
import { capacitiesRead } from "../projects/request.ts";
import type { CapacityOfTheMachine } from "../projects/projects.ts";

// La capacité que demande un ticket qui doit cuire sur un Mac.
export const MACOS = "macos";

export function whatProvidesThisComputer(platform: string, detected: readonly CapacityOfTheMachine[]): string[] {
  return capacitiesRead([...(isOneMac(platform) ? [MACOS] : []), ...detected.filter(({ detectee }) => detectee).map(({ capacite: capacity }) => capacity)]);
}
