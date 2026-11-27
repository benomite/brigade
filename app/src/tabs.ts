// Les onglets de contenu d'un espace, en haut, leur page par-dessus le rail — le second, lui,
// est à droite : chacun relaie, en texte, la sortie d'une commande du runtime qui existe
// (docs/runtime/exploitation.md, « Piloter »). Rien ne s'y ajoute et rien n'y est lu.
import type { Command } from "./box.ts";

export type Tab = { id: string; titre: string; commande: string; precision?: string };

// Le journal d'un projet qui dure ne tient pas dans une lecture : l'onglet Log n'en demande que la fin.
// Le nombre vit ici, une fois — la commande lancée et la phrase de l'onglet le lisent d'ici.
export const EVENTS_OF_LOG = 200;

export const TABS: readonly Tab[] = [
  { id: "log", titre: "Log", commande: `log --last ${EVENTS_OF_LOG}`, precision: `the end of the log only: the latest ${EVENTS_OF_LOG} events, not the whole log` },
];

// Ce que l'écran principal montre en haut : un onglet, Paramètres — une seule page, sans sous-pages
// (#1700) : ce que le chef règle, en trois groupes. Les
// pages Rail, Manager et General n'existent plus, ni leur lecture, ni l'onglet Cooks (#2921). Log n'a ni onglet ni bouton (#3048). Le coût n'est plus
// lu (#4509).
// `defaut` : la lecture que l'onglet ouvre — sans commande pour Paramètres.
export type Heading = { id: string; titre: string; defaut: string; lectures: readonly string[] };
export const PARAMETERS = "parametres";
export const HEADINGS: readonly Heading[] = [
  { id: PARAMETERS, titre: "Settings", defaut: PARAMETERS, lectures: [PARAMETERS] },
];

// Les projets dont une lecture lit la cuisine : pour un onglet, son projet et lui seul.
export function projectsRead<P extends { nom: string }>(name: unknown, projects: readonly P[]): P[] {
  return projects.filter((project) => project.nom === name);
}

// La vue nomme un onglet, jamais une commande : seule une commande d'ici part vers la box.
export function commandOf(id: unknown): string | undefined {
  return TABS.find((tab) => tab.id === id)?.commande;
}

// Ce que la lecture d'un onglet lance, dans l'ordre : rien pour un nom qui n'en est pas un.
export function commandsOf(id: unknown): readonly Command[] {
  const command = commandOf(id);
  return command === undefined ? [] : [command];
}
