// Ce que l'app sait d'un projet, tel qu'elle l'a lu : une lecture a des sorties, ou une erreur, et l'heure
// où elle a fini. Plus aucune commande n'est lancée par la station de cet ordinateur (#4684) : les lectures
// viennent de GitHub (board/rail.ts).
import type { PauseOfReads } from "./board/read.ts";

export type Output = { commande: string; texte: string };
// `atteinte` : la station a été jointe, et c'est la commande qui a échoué, ou qui
// n'a rien rendu. Fausse : rien ne le prouve — la commande n'a pas pu être lancée, ou
// il a fallu l'arrêter sans qu'elle ait dit jusqu'où elle était allée.
// `cas` : ce que le code de sortie prouve à lui seul, quand il prouve quelque
// chose — jamais ce que le texte dit. Ce qui a été écrit est dans `erreur`, comme le reste.
//   `projet-inconnu`  le geste a refusé le projet : la station ne le connaît pas sous ce nom
//   `sans-droit`      le geste a refusé celui qui le lance : son compte n'en a pas le droit
//   `commande-manque` une commande manque à la station — le geste lui-même
//   `node-inapte`     le geste a refusé de lancer le runtime : le `node` de la station ne démarre pas, ou n'est pas la version réclamée
export type Case = "projet-inconnu" | "sans-droit" | "commande-manque" | "node-inapte";
// `duTableau` : ce n'est pas la station d'ici qui a échoué, mais la lecture du projet sur GitHub (board/rail.ts,
// #1694) — `erreur` est alors sa raison, en une phrase.
export type Failure = { erreur: string; atteinte: boolean; cas: Case | null; duTableau?: true; pasPublie?: true; horsLigne?: true; pause?: PauseOfReads };
// `demande` : celle à laquelle la lecture répond, telle que `regarder` l'a reçue.
// `a` : l'instant où la lecture a fini. Une lecture a des sorties, ou une
// erreur — jamais les deux.
export type Reading = { projet: string; demande: number; a: string } & ({ sorties: Output[] } | Failure);

// La station de cet ordinateur, telle que l'app la lance : le `node` qui le joue,
// le dossier du runtime et le répertoire de la station (`BRIGADE_STATION_DIR`) — ceux avec
// lesquels l'app la lance.
export type Locale = { node: string; runtime: string; racine: string; env: Record<string, string | undefined> };
// Où se lit la cuisine d'un projet : la station de cet ordinateur.
export type Kitchen = { locale: Locale };
// Un projet tel qu'il se lit : son nom, et là où sa cuisine tourne à cet instant.
export type Read = { nom: string; cuisine: Kitchen };

// Ce que dit une proposition de réglage qui ouvre une pull request.
export const PROPOSES = "proposed as a pull request — it applies once merged";
