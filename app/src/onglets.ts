// Les onglets de contenu d'un espace, en haut, leur page par-dessus le rail — le second, lui,
// est à droite : chacun relaie, en texte, la sortie d'une commande du runtime qui existe
// (docs/runtime/exploitation.md, « Piloter »). Rien ne s'y ajoute et rien n'y est lu.
import type { Commande } from "./box.ts";

export type Onglet = { id: string; titre: string; commande: string; precision?: string };

// Le journal d'un projet qui dure ne tient pas dans une lecture : l'onglet Log n'en demande que la fin.
// Le nombre vit ici, une fois — la commande lancée et la phrase de l'onglet le lisent d'ici.
export const EVENEMENTS_DU_LOG = 200;

export const ONGLETS: readonly Onglet[] = [
  { id: "log", titre: "Log", commande: `log --last ${EVENEMENTS_DU_LOG}`, precision: `the end of the log only: the latest ${EVENEMENTS_DU_LOG} events, not the whole log` },
];

// Ce que l'écran principal montre en haut : un onglet, Paramètres — une seule page, sans sous-pages
// (#1700) : ce que le chef règle, en trois groupes. Les
// pages Rail, Manager et General n'existent plus, ni leur lecture, ni l'onglet Cooks (#2921). Log n'a pas d'onglet : le
// journal est de l'outillage de panne, il s'ouvre par son geste, en tête de l'espace. Le coût n'est plus
// un onglet de projet (#1022) : il vit au niveau de l'app (`COUTS`, ci-dessous), chaque projet nommé.
// `defaut` : la lecture que l'onglet ouvre — sans commande pour Paramètres.
export type Rubrique = { id: string; titre: string; defaut: string; lectures: readonly string[] };
export const PARAMETRES = "parametres";
export const JOURNAL = "log";
export const RUBRIQUES: readonly Rubrique[] = [
  { id: PARAMETRES, titre: "Settings", defaut: PARAMETRES, lectures: [PARAMETRES] },
];

// Le coût de tous les projets, au niveau de l'app (#1022) : une page ouverte depuis « Tous les projets »,
// sans ouvrir aucun projet. Elle n'est l'onglet d'aucun espace : sa lecture lance `station` sur la box de
// chaque projet qu'elle sert encore, tant que la page est affichée.
export const COUTS = "couts";
export const COMMANDE_DES_COUTS = "station";
// La tendance du rapport ajouté / retiré de tous les projets (#1682), de même : une page ouverte depuis « Tous les
// projets », qui lit `closing --json` sur la box de chaque projet qu'elle sert encore (vue/closer/tendance/).
export const RATIOS = "ratios";
export const COMMANDE_DES_RATIOS = "closing --json";

// Les projets dont une lecture lit la cuisine : pour un onglet, son projet et lui seul ; pour la page des coûts
// et celle des ratios, chaque projet qu'une station sert (`servi`), ou qui cuit sur cet ordinateur (`ici`) — jamais
// un projet qui n'est lu nulle part.
export function projetsLus<P extends { nom: string; servi?: unknown; ici?: unknown }>(id: unknown, nom: unknown, projets: readonly P[]): P[] {
  if (id === COUTS || id === RATIOS) return projets.filter(({ servi, ici }) => servi === true || ici === true);
  return projets.filter((projet) => projet.nom === nom);
}

// La vue nomme un onglet, jamais une commande : seule une commande d'ici part vers la box.
export function commandeDe(id: unknown): string | undefined {
  return ONGLETS.find((onglet) => onglet.id === id)?.commande;
}

// Ce que la lecture d'un onglet lance, dans l'ordre : rien pour un nom qui n'en est pas un.
export function commandesDe(id: unknown): readonly Commande[] {
  if (id === COUTS) return [COMMANDE_DES_COUTS];
  if (id === RATIOS) return [COMMANDE_DES_RATIOS];
  const commande = commandeDe(id);
  return commande === undefined ? [] : [commande];
}
