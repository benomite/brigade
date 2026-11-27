// L'état de la cuisine hors de l'app (#3631, epic #3629) : l'icône de la barre des menus du Mac et de la zone de
// notification de Windows (#3269, menu-bar.ts), tenue à côté de la station de fond plutôt que par l'app, pour
// rester là l'app fermée. Ce module en est le cœur, sans Electron : la ligne — combien de cooks cuisent, combien de
// questions attendent le chef, et l'état de la station —, le menu — ouvrir l'app, mettre la station en pause ou l'en
// sortir, la quitter —, ce que chaque geste lance sur la station, et la confirmation que
// quitter demande, seul geste qui arrête la cuisine.
//
// Les comptes sont ceux de menu-bar.ts (`etatDeLaCuisine`, `ligneDe`, `enAttente`) : rien n'est recompté ici.
// La pause et son retour sont les commandes du runtime qui existent, projet par projet (docs/runtime/exploitation.md,
// « Piloter ») : la pause, `switch off` — les cooks en cours finissent, rien de neuf n'est pris —, son retour `switch on`.
import { queued, kitchenState, type ProjectRead } from "../menu-bar.ts";
import { lineOfBackground, type StateOfTheStation } from "../tray/line.ts";

export type Action = "ouvrir" | "pause" | "reprise" | "quitter";
export type EntryOfBackground =
  | { genre: "texte"; libelle: string }
  | { genre: "separateur" }
  | { genre: "geste"; geste: Action; libelle: string; actif: boolean };

// La station de fond, d'après les faits de ses projets : en pause quand chacun est éteint — ou rien d'elle ne se lit.
export function stateOfTheStation(projects: readonly ProjectRead[]): StateOfTheStation {
  const readOnes = projects.filter(({ faits: facts }) => facts !== undefined);
  if (readOnes.length === 0) return "illisible";
  return { pause: readOnes.every(({ faits: facts }) => facts?.etat === "éteinte") };
}

// Le menu : la ligne, puis les gestes. Pause devient « Resume » sur une station en pause ; aucun des deux ne se propose sur
// une station qui ne se lit pas. Ouvrir l'app et quitter, toujours.
export function menuOfBackground(projects: readonly ProjectRead[], station: StateOfTheStation): EntryOfBackground[] {
  const readEntry = station !== "illisible";
  const inPause = readEntry && station.pause;
  return [
    { genre: "texte", libelle: lineOfBackground(projects, station) },
    { genre: "separateur" },
    { genre: "geste", geste: "ouvrir", libelle: "Open brigade", actif: true },
    { genre: "separateur" },
    inPause ? { genre: "geste", geste: "reprise", libelle: "Resume the station", actif: true } : { genre: "geste", geste: "pause", libelle: "Pause the station", actif: readEntry },
    { genre: "geste", geste: "quitter", libelle: "Quit the station…", actif: true },
  ];
}

// Ce que pause et reprise lancent, projet par projet : ce qui suit `brigade <projet>` sur la station.
export function commandsOfAction(action: "pause" | "reprise", projects: readonly ProjectRead[]): { projet: string; commande: string }[] {
  return projects.map(({ nom: name }) => ({ projet: name, commande: action === "pause" ? "switch off" : "switch on" }));
}

// Ce que demande « Quit the station » avant d'être fait : quitter arrête la cuisine — ses cooks en cours s'arrêtent, ses
// projets ne cuisent plus. Annuler laisse la station tourner ; seul `quitter` l'arrête.
export function confirmationOfQuit(projects: readonly ProjectRead[]): { message: string; detail: string; quitter: string; annuler: string } {
  const { cuisent: cook } = kitchenState(projects);
  const cooks = cook === 0 ? "No cook is running now." : cook === 1 ? "The cook running now stops." : `The ${cook} cooks running now stop.`;
  return {
    message: "Quit the station? This stops the kitchen.",
    detail: `${cooks} Its projects stop cooking on this computer until the station starts again.`,
    quitter: "Quit the station",
    annuler: "Cancel",
  };
}

// Combien de questions attendent : la pastille de l'icône sous Windows, qui n'a pas de titre.
export const questionsOfBackground = (projects: readonly ProjectRead[]): number => queued(kitchenState(projects));

// Un `activate` adressé à l'icône est-il un clic du chef sur l'app (#4071) ? Electron l'émet aussi au lancement du process,
// quand launchd démarre l'agent à l'ouverture de session : celui des premières secondes est ignoré, sans quoi la fenêtre
// s'ouvrirait à chaque connexion.
const ACTIVATE_IGNORE_MS = 2_000;
export const clickOnTheApp = (startup: number, now: number): boolean => now - startup >= ACTIVATE_IGNORE_MS;
