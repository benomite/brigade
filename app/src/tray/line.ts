// La ligne que dit l'icône unique de la barre des menus (#4079) : les comptes — « 0 cooking · 0 for you » — et l'état de la
// station — « no project on this station » —, au survol et à côté de l'icône, qu'elle soit posée par l'app ou par la station.
import { kitchenState, lineOf, type ProjectRead } from "../menu-bar.ts";

// La station de fond, d'après les faits de ses projets (tray-background.ts) : en pause — ou rien d'elle ne se lit.
export type StateOfTheStation = { pause: boolean } | "illisible";

// « 2 cooking · 1 for you », suivi de l'état de la station quand elle ne cuit pas normalement. Rien de lu, elle le dit.
export function lineOfBackground(projects: readonly ProjectRead[], station: StateOfTheStation): string {
  if (projects.length === 0) return "no project on this station";
  const line = lineOf(kitchenState(projects));
  // Rien de lu : `ligneDe` dit déjà « not read yet ».
  if (station === "illisible") return line;
  return `${line}${station.pause ? " · paused" : ""}`;
}
