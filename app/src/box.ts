// Ce que l'app dit d'une lecture : ses sorties ou son échec, rendues mot pour mot. L'app ne lance rien du runtime
// que la cuisine (`runtime/src/kitchen/main.ts`) : ces lectures viennent de GitHub (board/rail.ts).
import type { PauseOfReads } from "./board/read.ts";

export type Output = { commande: string; texte: string };
// `atteinte` : la station a été jointe, et c'est la commande qui a échoué, ou qui
// n'a rien rendu. Fausse : rien ne le prouve — la commande n'a pas pu être lancée, ou
// il a fallu l'arrêter sans qu'elle ait dit jusqu'où elle était allée.
// `cas` : toujours nul — la lecture de GitHub ne dit aucun cas de refus de la station. Ce qui a été écrit est dans `erreur`.
// `duTableau` : ce n'est pas la station d'ici qui a échoué, mais la lecture du projet sur GitHub (board/rail.ts,
// #1694) — `erreur` est alors sa raison, en une phrase.
export type Failure = { erreur: string; atteinte: boolean; cas: null; duTableau?: true; pasPublie?: true; horsLigne?: true; pause?: PauseOfReads };
// `demande` : celle à laquelle la lecture répond, telle que `regarder` l'a reçue.
// `a` : l'instant où la lecture a fini. Une lecture a des sorties, ou une
// erreur — jamais les deux.
export type Reading = { projet: string; demande: number; a: string } & ({ sorties: Output[] } | Failure);

// La station de cet ordinateur : le `node` qui la joue, le dossier du runtime et le répertoire de la
// station (`BRIGADE_STATION_DIR`) — ceux avec lesquels l'app la lance (workstation/station.ts).
export type Locale = { node: string; runtime: string; racine: string; env: Record<string, string | undefined> };
// Où se lit la cuisine d'un projet : la station de cet ordinateur.
export type Kitchen = { locale: Locale };

// Ce que dit une proposition de réglage qui ouvre une pull request.
export const PROPOSES = "proposed as a pull request — it applies once merged";
