// Ce que `facts` dit d'un ticket en WAITING faute de capacité, et de sa tâche quand le chef l'a confié à un humain
// (runtime/src/sortie-attente-capacite/, ticket 1958), tel que l'app le lit (faits.ts) — rien n'y est cru sur parole :
//   - `requiert`, sur une carte du rail : toutes les capacités que sa ligne `requiert` demande — la station à qui le
//     chef le donne doit les fournir toutes ;
//   - `tache`, sur une entrée de TODO : à qui elle revient, ce qu'aucune station ne fournit, et le titre, le contexte
//     et les critères d'acceptation de sa carte.
// Un champ absent, ou d'une autre forme, n'est pas donné : la carte n'a ni sortie, ni tâche.

export type TacheHumaine = { assignee: string; missing: string[]; title: string; context: string; criteria: string[] };

const textes = (valeur: unknown): valeur is string[] => Array.isArray(valeur) && valeur.every((un) => typeof un === "string");

// `requiert`, d'une ligne du rail.
export function requisLus(valeur: unknown): { requiert?: string[] } {
  return textes(valeur) && valeur.length > 0 ? { requiert: valeur } : {};
}

// `tache`, d'une entrée de TODO.
export function tacheLue(valeur: unknown): { tache?: TacheHumaine } {
  if (typeof valeur !== "object" || valeur === null) return {};
  const { assignee, missing, title, context, criteria } = valeur as Record<string, unknown>;
  if (typeof assignee !== "string" || assignee === "" || !textes(missing) || typeof title !== "string" || typeof context !== "string" || !textes(criteria)) return {};
  return { tache: { assignee, missing, title, context, criteria } };
}
