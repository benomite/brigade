// Ce que `facts` dit d'un ticket en WAITING faute de capacité, et de sa tâche quand le chef l'a confié à un humain
// (ticket 1958), tel que l'app le lit (facts.ts) — rien n'y est cru sur parole :
//   - `requiert`, sur une carte du rail : toutes les capacités que sa ligne `requiert` demande — la station à qui le
//     chef le donne doit les fournir toutes ;
//   - `tache`, sur une entrée de TODO : à qui elle revient, ce qu'aucune station ne fournit, et le titre, le contexte
//     et les critères d'acceptation de sa carte.
// Un champ absent, ou d'une autre forme, n'est pas donné : la carte n'a ni sortie, ni tâche.

export type TaskHuman = { assignee: string; missing: string[]; title: string; context: string; criteria: string[] };

const texts = (value: unknown): value is string[] => Array.isArray(value) && value.every((oneOf) => typeof oneOf === "string");

// `requiert`, d'une ligne du rail.
export function requiredRead(value: unknown): { requiert?: string[] } {
  return texts(value) && value.length > 0 ? { requiert: value } : {};
}

// `tache`, d'une entrée de TODO.
export function taskRead(value: unknown): { tache?: TaskHuman } {
  if (typeof value !== "object" || value === null) return {};
  const { assignee, missing, title, context, criteria } = value as Record<string, unknown>;
  if (typeof assignee !== "string" || assignee === "" || !texts(missing) || typeof title !== "string" || typeof context !== "string" || !texts(criteria)) return {};
  return { tache: { assignee, missing, title, context, criteria } };
}
