// Les onglets de contenu d'un espace, en haut, leur page par-dessus le rail — le second, lui,
// est à droite : chacun relaie, en texte, la sortie d'une commande du runtime qui existe
// (docs/runtime.md, « Piloter »). Rien ne s'y ajoute et rien n'y est lu — sauf
// dans Manager, où l'état du manager est posé au-dessus de son texte (manager.ts),
// et dans Grants, où l'est celui des grants (grants.ts).
export type Onglet = { id: string; titre: string; commande: string; precision?: string };

// Le journal d'un projet qui dure ne tient pas dans une lecture : l'onglet Log n'en demande que la fin.
// Le nombre vit ici, une fois — la commande lancée et la phrase de l'onglet le lisent d'ici.
export const EVENEMENTS_DU_LOG = 200;

export const ONGLETS: readonly Onglet[] = [
  { id: "rail", titre: "Rail", commande: "rail" },
  { id: "cooks", titre: "Cooks", commande: "station" },
  { id: "manager", titre: "Manager", commande: "manager" },
  { id: "grants", titre: "Grants", commande: "grant" },
  { id: "log", titre: "Log", commande: `journal --derniers ${EVENEMENTS_DU_LOG}`, precision: `la fin du journal seulement : les ${EVENEMENTS_DU_LOG} derniers événements, pas le journal entier` },
];

// Ce que l'écran principal montre en haut : deux onglets, Coût et Paramètres. Les lectures
// ci-dessus y sont rangées — Cooks (la commande `station`, et son `consommé`) sous Coût ; Rail,
// Manager et Grants sous Paramètres, à côté de l'état du projet. Log n'a pas d'onglet : le
// journal est de l'outillage de panne, il s'ouvre par son geste, en tête de l'espace.
// `defaut` : la lecture que l'onglet ouvre — sans commande pour Paramètres, qui pose d'abord l'état.
export type Rubrique = { id: string; titre: string; defaut: string; lectures: readonly string[] };
export const PARAMETRES = "parametres";
export const JOURNAL = "log";
export const RUBRIQUES: readonly Rubrique[] = [
  { id: "cout", titre: "Coût", defaut: "cooks", lectures: ["cooks"] },
  { id: PARAMETRES, titre: "Paramètres", defaut: PARAMETRES, lectures: [PARAMETRES, "manager", "grants", "rail"] },
];

// La vue nomme un onglet, jamais une commande : seule une commande d'ici part vers la box.
export function commandeDe(id: unknown): string | undefined {
  return ONGLETS.find((onglet) => onglet.id === id)?.commande;
}
