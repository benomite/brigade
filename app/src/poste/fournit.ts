// Ce que la station de cet ordinateur fournit, tel que l'installation le dit (#1757) : l'app qui tient
// la station de sa machine (poste/station.ts) l'écrit dans son appairage (stations/document.ts), et le
// reprend dans la demande de chaque projet où la station est ajoutée (projets/projets.ts). La station
// principale du projet le lit là, et la déclare à son journal avec ces capacités
// (runtime/src/projets/secondaires.ts) — sans une commande du chef.
//
// Un Mac fournit toujours `macos` : c'est le système même. S'y ajoute chaque capacité que le runtime
// détecte sur la machine (runtime/src/projets/ajout-de-station.ts, `capacitesDeLaMachine`) — Chrome,
// le SDK Android… —, regardée sans rien y lancer. Une autre machine ne fournit que ce qu'on y détecte.
import { capacitesLues } from "../projets/demande.ts";
import type { CapaciteDeLaMachine } from "../projets/projets.ts";

// La capacité d'un système, par la plateforme de Node : celle qu'un ticket demande pour cuire sur lui.
const DU_SYSTEME: Partial<Record<NodeJS.Platform, string>> = { darwin: "macos" };

export function ceQueFournitCetOrdinateur(plateforme: NodeJS.Platform, detectees: readonly CapaciteDeLaMachine[]): string[] {
  const systeme = DU_SYSTEME[plateforme];
  return capacitesLues([...(systeme === undefined ? [] : [systeme]), ...detectees.filter(({ detectee }) => detectee).map(({ capacite }) => capacite)]);
}
