// Les onglets de contenu d'un espace, à côté du terminal du second : chacun
// relaie, en texte, la sortie d'une commande du runtime qui existe
// (docs/runtime.md, « Piloter »). Rien ne s'y ajoute et rien n'y est lu.
export type Onglet = { id: string; titre: string; commande: string };

export const ONGLETS: readonly Onglet[] = [
  { id: "rail", titre: "Rail", commande: "rail" },
  { id: "cooks", titre: "Cooks", commande: "station" },
  { id: "grants", titre: "Grants", commande: "grant" },
  { id: "log", titre: "Log", commande: "journal" },
];

// La vue nomme un onglet, jamais une commande : seule une commande d'ici part vers la box.
export function commandeDe(id: unknown): string | undefined {
  return ONGLETS.find((onglet) => onglet.id === id)?.commande;
}
