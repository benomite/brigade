// Les étapes de la pass d'une livraison (#4276, règle 6 de
// docs/superpowers/specs/2026-11-24-simplified-process.md) : un cook peut être un
// humain, et ce qu'il livre passe la même pass que ce qu'un cook livre. Les mêmes
// étapes, dans le même ordre — celui de la station GitHub seul, que mesure
// `ETAPES_DE_LA_PASSE` (temps-ticket/mesure.ts) : la relecture, les gates du projet,
// sa CI, le merge —, quels que soient l'auteur de la PR et les labels de son
// ticket : aucune n'est sautée, aucune n'est ajoutée.
export const ETAPES_DE_LA_PASS = ["review", "gates", "CI", "merge"] as const;

export function etapesDeLaPass(_livraison: { auteur: string; labels: readonly string[] }): string[] {
  return [...ETAPES_DE_LA_PASS];
}
