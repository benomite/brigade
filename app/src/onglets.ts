// Les onglets de contenu d'un espace, à côté du terminal du second : chacun
// relaie, en texte, la sortie d'une commande du runtime qui existe
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

// La vue nomme un onglet, jamais une commande : seule une commande d'ici part vers la box.
export function commandeDe(id: unknown): string | undefined {
  return ONGLETS.find((onglet) => onglet.id === id)?.commande;
}
