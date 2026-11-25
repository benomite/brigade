// Ce que le chef a changé du savoir-faire du projet (#4241), appliqué aux leçons
// provisoires que le journal recalcule (`apprentissage/provisoires.ts`) : un texte
// réécrit remplace le sien, une entrée retirée n'en est plus. Le dernier fait d'une
// entrée l'emporte ; une entrée retirée le reste.
import type { Base } from "../base.ts";

type Ligne = { type: string; payload: string };

export function corriger<L extends { id: string; texte: string }>(base: Base, projet: string, lecons: L[]): L[] {
  const textes = new Map<string, string>();
  const retirees = new Set<string>();
  const lignes = base.lire<Ligne>("SELECT type, payload FROM events WHERE type IN ('know-how.edited', 'know-how.removed') AND project = ? ORDER BY seq", projet);
  for (const { type, payload } of lignes) {
    const { id, text } = JSON.parse(payload) as { id: string; text: string };
    if (type === "know-how.removed") retirees.add(id);
    else textes.set(id, text);
  }
  return lecons.filter((lecon) => !retirees.has(lecon.id)).map((lecon) => ({ ...lecon, texte: textes.get(lecon.id) ?? lecon.texte }));
}
