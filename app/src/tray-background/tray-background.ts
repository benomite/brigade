// L'état de la cuisine hors de l'app (#3631, epic #3629) : l'icône de la barre des menus du Mac et de la zone de
// notification de Windows (#3269, menu-bar.ts), tenue à côté de la station de fond plutôt que par l'app, pour
// rester là l'app fermée. Ce module en est le cœur, sans Electron : la ligne — combien de projets la station sert —, le
// menu — ouvrir l'app, la quitter — et la confirmation que quitter demande, seul geste qui arrête la cuisine.
//
// Le fond ne lance aucune commande du runtime (ticket 4677) : il ne lit plus `facts`, donc ni cooks, ni questions, ni état
// de la station, ni pause, arrêt ou démarrage.
import type { ProjectRead } from "../menu-bar.ts";
import type { StateOfTheStation } from "../tray/line.ts";

export type Action = "ouvrir" | "quitter";
export type EntryOfBackground =
  | { genre: "texte"; libelle: string }
  | { genre: "separateur" }
  | { genre: "geste"; geste: Action; libelle: string; actif: boolean };

// Un projet tel que le fond le lit : `ProjetLu`, et les stations de cet ordinateur que ses faits déclarent.
const stationsHere = ({ faits: facts }: ProjectRead): { station: string; cuisson?: string }[] => (facts?.stations ?? []).filter(({ distante: remote }) => !remote);

// La station de fond, d'après les faits de ses projets : en pause quand chacun est éteint, arrêtée quand chaque station
// de cet ordinateur l'est sur chacun — ou rien d'elle ne se lit.
export function stateOfTheStation(projects: readonly ProjectRead[]): StateOfTheStation {
  const readOnes = projects.filter(({ faits: facts }) => facts !== undefined);
  if (readOnes.length === 0) return "illisible";
  return {
    pause: readOnes.every(({ faits: facts }) => facts?.etat === "éteinte"),
    arret: readOnes.every((project) => {
      const here = stationsHere(project);
      return here.length > 0 && here.every(({ cuisson: cooking }) => cooking === "stopped");
    }),
  };
}

// La ligne de l'icône de fond : combien de projets la station de cet ordinateur sert. Elle ne dit ni cooks ni questions : le
// fond ne lit plus rien de la cuisine (ticket 4677) — l'app, elle, les lit sur GitHub.
export function lineOfTheStationHere(servedOnes: readonly string[]): string {
  return servedOnes.length === 0 ? "no project on this station" : `${servedOnes.length} project${servedOnes.length === 1 ? "" : "s"} on this station`;
}

// Le menu : la ligne, ouvrir l'app et quitter, toujours. Plus de pause, d'arrêt ni de démarrage : ils s'appuyaient sur ce
// que lisait la commande `facts`, que l'app ne lance plus — le chef les joue dans l'app.
export function menuOfBackground(servedOnes: readonly string[]): EntryOfBackground[] {
  return [
    { genre: "texte", libelle: lineOfTheStationHere(servedOnes) },
    { genre: "separateur" },
    { genre: "geste", geste: "ouvrir", libelle: "Open brigade", actif: true },
    { genre: "separateur" },
    { genre: "geste", geste: "quitter", libelle: "Quit the station…", actif: true },
  ];
}

// Ce que demande « Quit the station » avant d'être fait : quitter arrête la cuisine — ses cooks en cours s'arrêtent, ses
// projets ne cuisent plus. Annuler laisse la station tourner ; seul `quitter` l'arrête.
export function confirmationOfQuit(): { message: string; detail: string; quitter: string; annuler: string } {
  return {
    message: "Quit the station? This stops the kitchen.",
    detail: "The cooks running now stop. Its projects stop cooking on this computer until the station starts again.",
    quitter: "Quit the station",
    annuler: "Cancel",
  };
}

// Un `activate` adressé à l'icône est-il un clic du chef sur l'app (#4071) ? Electron l'émet aussi au lancement du process,
// quand launchd démarre l'agent à l'ouverture de session : celui des premières secondes est ignoré, sans quoi la fenêtre
// s'ouvrirait à chaque connexion.
const ACTIVATE_IGNORE_MS = 2_000;
export const clickOnTheApp = (startup: number, now: number): boolean => now - startup >= ACTIVATE_IGNORE_MS;
