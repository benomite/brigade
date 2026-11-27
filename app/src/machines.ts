// La machine où « + shell » propose d'ouvrir un shell persistant (persistence.ts) : ce poste. La vue ne
// reçoit que ce qui se montre — un identifiant et un titre — et le rend.
import type { Target } from "./persistence.ts";
import { HERE } from "./platform.ts";

// `id` : ce que la vue rend pour choisir. `titre` : ce qu'elle montre.
export type Machine = { id: string; titre: string; cible: Target };

export const WORKSTATION = "poste";

// Les machines proposées : ce poste.
export function machinesOf(): Machine[] {
  return [{ id: WORKSTATION, titre: HERE, cible: { lieu: "poste" } }];
}

// La machine que la vue a choisie, parmi celles proposées maintenant — rien, pour une autre.
export function machineChosen(machines: readonly Machine[], id: unknown): Machine | undefined {
  return machines.find((machine) => machine.id === id);
}

// Où est un shell, dit comme la liste le dit : « this Mac » (« this PC » sous Windows).
export function placeOf(_target: Target): string {
  return HERE;
}
