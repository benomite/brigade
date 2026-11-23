// L'état de la cuisine hors de l'app (#3631, epic #3629) : l'icône de la barre des menus du Mac et de la zone de
// notification de Windows (#3269, barre-de-menus.ts), tenue à côté de la station de fond plutôt que par l'app, pour
// rester là l'app fermée. Ce module en est le cœur, sans Electron : la ligne — combien de cooks cuisent, combien de
// questions attendent le chef, et l'état de la station —, le menu — ouvrir l'app, mettre la station en pause ou l'en
// sortir, l'arrêter ou la démarrer, la quitter —, ce que chaque geste lance sur la station, et la confirmation que
// quitter demande, seul geste qui arrête la cuisine.
//
// Les comptes sont ceux de barre-de-menus.ts (`etatDeLaCuisine`, `ligneDe`, `enAttente`) : rien n'est recompté ici.
// Pause, arrêt et leur retour sont les commandes du runtime qui existent, projet par projet (docs/runtime/exploitation.md,
// « Piloter ») : la pause, `switch off` — les cooks en cours finissent, rien de neuf n'est pris — ; l'arrêt,
// `station stop <station>` sur chaque station de cet ordinateur — elle ne prend plus rien, ses cooks finissent.
import { enAttente, etatDeLaCuisine, ligneDe, type ProjetLu } from "../barre-de-menus.ts";
import { menuDeVeille, type Veille } from "../vue/veille-machine/veille-machine.js";

// La station de fond, d'après les faits de ses projets : en pause quand chacun est éteint, arrêtée quand chaque station
// de cet ordinateur l'est sur chacun — ou rien d'elle ne se lit.
type EtatDeLaStation = { pause: boolean; arret: boolean } | "illisible";

export type Geste = "ouvrir" | "pause" | "reprise" | "arret" | "demarrage" | "quitter" | "veille";
// `case` : un réglage qui se coche — garder ce Mac éveillé tant qu'un cook cuit (#3642).
export type EntreeDuFond =
  | { genre: "texte"; libelle: string }
  | { genre: "separateur" }
  | { genre: "geste"; geste: Geste; libelle: string; actif: boolean }
  | { genre: "case"; geste: "veille"; libelle: string; coche: boolean; actif: boolean };

// Un projet tel que le fond le lit : `ProjetLu`, et les stations de cet ordinateur que ses faits déclarent.
const stationsIci = ({ faits }: ProjetLu): { station: string; cuisson?: string }[] => (faits?.stations ?? []).filter(({ distante }) => !distante);

export function etatDeLaStation(projets: readonly ProjetLu[]): EtatDeLaStation {
  const lus = projets.filter(({ faits }) => faits !== undefined);
  if (lus.length === 0) return "illisible";
  return {
    pause: lus.every(({ faits }) => faits?.etat === "éteinte"),
    arret: lus.every((projet) => {
      const ici = stationsIci(projet);
      return ici.length > 0 && ici.every(({ cuisson }) => cuisson === "stopped");
    }),
  };
}

// « 2 cooking · 1 for you », suivi de l'état de la station quand elle ne cuit pas normalement. Rien de lu, elle le dit.
export function ligneDuFond(projets: readonly ProjetLu[], station: EtatDeLaStation): string {
  if (projets.length === 0) return "no project on this station";
  const ligne = ligneDe(etatDeLaCuisine(projets));
  // Rien de lu : `ligneDe` dit déjà « not read yet ».
  if (station === "illisible") return ligne;
  return `${ligne}${station.pause ? " · paused" : ""}${station.arret ? " · stopped" : ""}`;
}

// Le menu : la ligne, puis les gestes. Pause devient « Resume » sur une station en pause, arrêt devient « Start » sur une
// station arrêtée ; aucun des deux ne se propose sur une station qui ne se lit pas. Ouvrir l'app et quitter, toujours.
// Sur un Mac (#3642), la ligne qui dit qu'il est gardé éveillé, tant qu'il l'est, et la case qui en décide
// (veille-machine.js) ; hors d'un Mac, ni l'une ni l'autre.
export function menuDuFond(projets: readonly ProjetLu[], station: EtatDeLaStation, veille?: Veille): EntreeDuFond[] {
  const lue = station !== "illisible";
  const enPause = lue && station.pause;
  const arretee = lue && station.arret;
  const { ligne, interrupteur } = menuDeVeille(veille);
  return [
    { genre: "texte", libelle: ligneDuFond(projets, station) },
    ...(ligne === null ? [] : [{ genre: "texte", libelle: ligne } as const]),
    { genre: "separateur" },
    { genre: "geste", geste: "ouvrir", libelle: "Open brigade", actif: true },
    { genre: "separateur" },
    enPause ? { genre: "geste", geste: "reprise", libelle: "Resume the station", actif: true } : { genre: "geste", geste: "pause", libelle: "Pause the station", actif: lue },
    arretee ? { genre: "geste", geste: "demarrage", libelle: "Start the station", actif: true } : { genre: "geste", geste: "arret", libelle: "Stop the station", actif: lue },
    ...(interrupteur === null ? [] : [{ genre: "case", geste: "veille", ...interrupteur } as const]),
    { genre: "geste", geste: "quitter", libelle: "Quit the station…", actif: true },
  ];
}

// Ce que pause, reprise, arrêt et démarrage lancent, projet par projet : ce qui suit `brigade <projet>` sur la station.
// L'arrêt et le démarrage visent chaque station de cet ordinateur que les faits du projet déclarent ; un projet dont
// rien n'est lu n'en reçoit aucun.
export function commandesDuGeste(geste: "pause" | "reprise" | "arret" | "demarrage", projets: readonly ProjetLu[]): { projet: string; commande: string }[] {
  if (geste === "pause" || geste === "reprise") return projets.map(({ nom }) => ({ projet: nom, commande: geste === "pause" ? "switch off" : "switch on" }));
  return projets.flatMap((projet) => stationsIci(projet).map(({ station }) => ({ projet: projet.nom, commande: `station ${geste === "arret" ? "stop" : "start"} ${station}` })));
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

// Combien de questions attendent : la pastille de l'icône sous Windows, qui n'a pas de titre.
export const questionsDuFond = (projets: readonly ProjetLu[]): number => enAttente(etatDeLaCuisine(projets));

// Un `activate` adressé à l'icône est-il un clic du chef sur l'app (#4071) ? Electron l'émet aussi au lancement du process,
// quand launchd démarre l'agent à l'ouverture de session : celui des premières secondes est ignoré, sans quoi la fenêtre
// s'ouvrirait à chaque connexion.
export const ACTIVATE_IGNORE_MS = 2_000;
export const clicSurLApp = (demarrage: number, maintenant: number): boolean => maintenant - demarrage >= ACTIVATE_IGNORE_MS;
