// La ligne que dit l'icône unique de la barre des menus (#4079) : les comptes — « 0 cooking · 0 for you » — et l'état de la
// station — « no project on this station » —, au survol et à côté de l'icône, qu'elle soit posée par l'app ou par la station.
import { etatDeLaCuisine, ligneDe, type ProjetLu } from "../barre-de-menus.ts";
import type { EtatDeLaStation } from "../tray-fond/tray-fond.ts";

// « 2 cooking · 1 for you », suivi de l'état de la station quand elle ne cuit pas normalement. Rien de lu, elle le dit.
export function ligneDuFond(projets: readonly ProjetLu[], station: EtatDeLaStation): string {
  if (projets.length === 0) return "no project on this station";
  const ligne = ligneDe(etatDeLaCuisine(projets));
  // Rien de lu : `ligneDe` dit déjà « not read yet ».
  if (station === "illisible") return ligne;
  return `${ligne}${station.pause ? " · paused" : ""}${station.arret ? " · stopped" : ""}`;
}
