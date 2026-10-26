// Les onglets de contenu d'un espace, en haut, leur page par-dessus le rail — le second, lui,
// est à droite : chacun relaie, en texte, la sortie d'une commande du runtime qui existe
// (docs/runtime/exploitation.md, « Piloter »). Rien ne s'y ajoute et rien n'y est lu — sauf
// dans Manager, où l'état du manager est posé au-dessus de son texte (manager.ts),
// et dans Grants, où l'est celui des grants (grants.ts).
import type { Commande } from "./box.ts";
import { COMMANDES as COMMANDES_DE_FIABILITE } from "./fiabilite.ts";

export type Onglet = { id: string; titre: string; commande: string; precision?: string };

// Le journal d'un projet qui dure ne tient pas dans une lecture : l'onglet Log n'en demande que la fin.
// Le nombre vit ici, une fois — la commande lancée et la phrase de l'onglet le lisent d'ici.
export const EVENEMENTS_DU_LOG = 200;

export const ONGLETS: readonly Onglet[] = [
  { id: "rail", titre: "Rail", commande: "rail" },
  { id: "cooks", titre: "Cooks", commande: "station" },
  { id: "manager", titre: "Manager", commande: "manager" },
  { id: "grants", titre: "Grants", commande: "grant" },
  { id: "log", titre: "Log", commande: `log --last ${EVENEMENTS_DU_LOG}`, precision: `the end of the log only: the latest ${EVENEMENTS_DU_LOG} events, not the whole log` },
];

// Ce que l'écran principal montre en haut : un onglet, Paramètres. Les lectures ci-dessus y sont
// rangées, à côté de l'état du projet — Rail, Cooks (la commande `station`), Manager, Grants. La
// fiabilité des cooks du projet (#987) et son closer (#990) n'y sont plus : ce sont des sections de
// l'onglet Cooks (#1699), lues avec lui (`COMMANDES_DE_COOKS`, ci-dessous). Log n'a pas d'onglet : le
// journal est de l'outillage de panne, il s'ouvre par son geste, en tête de l'espace. Le coût n'est plus
// un onglet de projet (#1022) : il vit au niveau de l'app (`COUTS`, ci-dessous), chaque projet nommé.
// `defaut` : la lecture que l'onglet ouvre — sans commande pour Paramètres, qui pose d'abord l'état.
export type Rubrique = { id: string; titre: string; defaut: string; lectures: readonly string[] };
export const PARAMETRES = "parametres";
export const JOURNAL = "log";
export const RUBRIQUES: readonly Rubrique[] = [
  { id: PARAMETRES, titre: "Settings", defaut: PARAMETRES, lectures: [PARAMETRES, "manager", "grants", "rail", "cooks"] },
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
// et celle des ratios, chaque projet qu'une box sert encore, ou qui cuit sur cet ordinateur (`ici`) — jamais
// un projet qui n'est lu nulle part, ni un projet désinstallé de sa box.
export function projetsLus<P extends { nom: string; box?: unknown; ici?: unknown; desinstalle?: unknown }>(id: unknown, nom: unknown, projets: readonly P[]): P[] {
  if (id === COUTS || id === RATIOS) return projets.filter(({ box, ici, desinstalle }) => (box !== undefined || ici === true) && desinstalle === undefined);
  return projets.filter((projet) => projet.nom === nom);
}

// La vue nomme un onglet, jamais une commande : seule une commande d'ici part vers la box.
export function commandeDe(id: unknown): string | undefined {
  return ONGLETS.find((onglet) => onglet.id === id)?.commande;
}

// L'onglet Cooks lit `station`, puis ce que ses sections de fiabilité et de closer posent (#1699) :
// `measures` sur la fenêtre que `station` dit (fiabilite.ts), et l'objet de `closing --json`
// (vue/closer/section.js). Une seule lecture, relue toutes les trente secondes tant qu'il est montré.
export const CUISINE = "cooks";
export const COMMANDE_DU_CLOSER = "closing --json";
export const COMMANDES_DE_COOKS: readonly Commande[] = [...COMMANDES_DE_FIABILITE, COMMANDE_DU_CLOSER];

// Ce que la lecture d'un onglet lance, dans l'ordre : rien pour un nom qui n'en est pas un.
export function commandesDe(id: unknown): readonly Commande[] {
  if (id === COUTS) return [COMMANDE_DES_COUTS];
  if (id === RATIOS) return [COMMANDE_DES_RATIOS];
  if (id === CUISINE) return COMMANDES_DE_COOKS;
  const commande = commandeDe(id);
  return commande === undefined ? [] : [commande];
}
