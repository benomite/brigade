// La machine où « + shell » propose d'ouvrir un shell persistant (persistance.ts) : ce poste. La vue ne
// reçoit que ce qui se montre — un identifiant et un titre — et le rend.
import type { Cible } from "./persistance.ts";
import { ICI } from "./plateforme.ts";

// `id` : ce que la vue rend pour choisir. `titre` : ce qu'elle montre.
export type Machine = { id: string; titre: string; cible: Cible };

export const POSTE = "poste";

// Les machines proposées : ce poste.
export function machinesDe(): Machine[] {
  return [{ id: POSTE, titre: ICI, cible: { lieu: "poste" } }];
}

// La machine que la vue a choisie, parmi celles proposées maintenant — rien, pour une autre.
export function machineChoisie(machines: readonly Machine[], id: unknown): Machine | undefined {
  return machines.find((machine) => machine.id === id);
}

// Où est un shell, dit comme la liste le dit : « this Mac » (« this PC » sous Windows).
export function lieuDe(_cible: Cible): string {
  return ICI;
}
