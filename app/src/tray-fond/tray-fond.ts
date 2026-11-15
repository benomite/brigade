// L'état de la cuisine hors de l'app (#3631, epic #3629) : l'icône de la barre des menus du Mac et de la zone de
// notification de Windows (#3269, barre-de-menus.ts), tenue par la station de fond plutôt que par l'app, pour rester là
// l'app fermée. Ce module en est le cœur, sans Electron : la ligne — combien de cooks cuisent, combien de questions
// attendent le chef, et l'état de la station —, le menu — ouvrir l'app, mettre la station en pause, l'arrêter, la
// quitter —, et la confirmation que quitter demande, seul geste qui arrête la cuisine.
//
// Les comptes sont ceux de barre-de-menus.ts (`etatDeLaCuisine`, `enAttente`) : rien n'est recompté ici.
// Pas encore branché : ce qui pose l'icône sans l'app, et ce que pause et arrêt font sur la station, attendent la
// décision dite dans le compte-rendu du ticket #3631.
import { enAttente, etatDeLaCuisine, type ProjetLu } from "../barre-de-menus.ts";

// La station de fond : elle cuit, elle est en pause, elle est arrêtée — ou rien d'elle ne se lit.
export type EtatDeLaStation = "en-service" | "en-pause" | "arretee" | "illisible";

export type Geste = "ouvrir" | "pause" | "arret" | "quitter";
export type EntreeDuFond = { genre: "texte"; libelle: string } | { genre: "separateur" } | { genre: "geste"; geste: Geste; libelle: string; actif: boolean };

const ETATS: Record<EtatDeLaStation, string> = {
  "en-service": "",
  "en-pause": " · paused",
  arretee: " · stopped",
  illisible: " · station not read",
};

// « 2 cooking · 1 for you », suivi de l'état de la station quand elle ne cuit pas normalement. Rien de lu, elle le dit.
export function ligneDuFond(projets: readonly ProjetLu[], station: EtatDeLaStation): string {
  const etat = etatDeLaCuisine(projets);
  const comptes = etat.lus === 0 ? "not read yet" : `${etat.cuisent} cooking · ${enAttente(etat)} for you`;
  return `${comptes}${ETATS[station]}`;
}

// Le menu : la ligne, puis les quatre gestes. Pause et arrêt ne se proposent pas sur une station déjà dans cet état, ni
// sur une station qui ne se lit pas ; ouvrir l'app et quitter la station, toujours.
export function menuDuFond(projets: readonly ProjetLu[], station: EtatDeLaStation): EntreeDuFond[] {
  const lue = station !== "illisible";
  return [
    { genre: "texte", libelle: ligneDuFond(projets, station) },
    { genre: "separateur" },
    { genre: "geste", geste: "ouvrir", libelle: "Open brigade", actif: true },
    { genre: "separateur" },
    { genre: "geste", geste: "pause", libelle: "Pause the station", actif: lue && station !== "en-pause" },
    { genre: "geste", geste: "arret", libelle: "Stop the station", actif: lue && station !== "arretee" },
    { genre: "geste", geste: "quitter", libelle: "Quit the station…", actif: true },
  ];
}

// Ce que demande « Quit the station » avant d'être fait : quitter arrête la cuisine — ses cooks en cours s'arrêtent, ses
// projets ne cuisent plus. Annuler laisse la station tourner ; seul `quitter` l'arrête.
export function confirmationDeQuitter(projets: readonly ProjetLu[]): { message: string; detail: string; quitter: string; annuler: string } {
  const { cuisent } = etatDeLaCuisine(projets);
  const cooks = cuisent === 0 ? "No cook is running now." : cuisent === 1 ? "The cook running now stops." : `The ${cuisent} cooks running now stop.`;
  return {
    message: "Quit the station? This stops the kitchen.",
    detail: `${cooks} Its projects stop cooking on this computer until the station starts again.`,
    quitter: "Quit the station",
    annuler: "Cancel",
  };
}
