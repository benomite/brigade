// Les machines où « + shell » propose d'ouvrir un shell persistant (persistance.ts) : ce poste,
// la box du projet, et chaque station que sa box déclare — chacune sous le nom que le chef lui
// connaît. La vue ne reçoit que ce qui se montre — un identifiant et un titre — et le rend :
// l'hôte joint, lui, se décide ici, d'après le fichier des projets et ce que la box a dit.
//
// Une station se nomme `<machine>/<moteur>` : la machine est ce qui précède la barre. Celle que la
// box fait tourner chez elle (non `distante`) est sur la box ; celle que ce poste joue (« stations »
// du projet) est ce poste. Les autres — des stations `distante` jouées par une autre machine — sont
// jointes par `ssh <machine>` : le nom que la box leur donne est celui que le `ssh` du chef doit
// connaître. Deux stations d'une même machine n'en font qu'une.
import type { Projet } from "./config.ts";
import type { Cible } from "./persistance.ts";

// Ce que la box déclare d'une station, tel que `installation stations --json` le rend (service.ts).
export type Declaree = { nom: string; distante: boolean };
// `id` : ce que la vue rend pour choisir. `titre` : ce qu'elle montre.
export type Machine = { id: string; titre: string; cible: Cible };

export const POSTE = "poste";
export const BOX = "box";
const STATION = "station:";

const machineDe = (station: string) => station.slice(0, station.indexOf("/"));

// Les machines proposées, dans l'ordre : ce poste, la box, puis les stations dans l'ordre où la box
// les déclare. `declarees` : ce que la box a dit de ses stations — absent tant qu'elle ne l'a pas dit,
// et seuls ce poste et la box sont alors proposés.
export function machinesDe(projet: Pick<Projet, "box" | "stations">, declarees: readonly Declaree[] = []): Machine[] {
  const jouees = new Set(projet.stations ?? []);
  const surLaBox = projet.box === undefined ? [] : declarees.filter(({ distante }) => !distante).map(({ nom }) => nom);
  const ailleurs = new Map<string, string[]>();
  for (const { nom, distante } of declarees) {
    if (!distante || jouees.has(nom) || !nom.includes("/")) continue;
    const machine = machineDe(nom);
    ailleurs.set(machine, [...(ailleurs.get(machine) ?? []), nom]);
  }
  const et = (stations: readonly string[]) => (stations.length === 0 ? "" : ` — station ${stations.join(", ")}`);
  return [
    { id: POSTE, titre: `this Mac${et([...jouees])}`, cible: { lieu: "poste" } },
    ...(projet.box === undefined ? [] : [{ id: BOX, titre: `box ${projet.box.hote}${et(surLaBox)}`, cible: { lieu: "box", nom: projet.box.hote, hote: projet.box.hote } as const }]),
    // Une station se joue auprès d'une box : sans elle, aucune n'est jointe.
    ...(projet.box === undefined ? [] : [...ailleurs].map(([machine, stations]) => ({ id: `${STATION}${machine}`, titre: `station ${stations.join(", ")}`, cible: { lieu: "station", nom: machine, hote: machine } as const }))),
  ];
}

// La machine que la vue a choisie, parmi celles proposées maintenant — rien, pour une autre.
export function machineChoisie(machines: readonly Machine[], id: unknown): Machine | undefined {
  return machines.find((machine) => machine.id === id);
}

// Où est un shell, dit comme la liste le dit : « this Mac », « box parade-box », « station studio ».
export function lieuDe(cible: Cible): string {
  return cible.lieu === "poste" ? "this Mac" : `${cible.lieu} ${cible.nom}`;
}
