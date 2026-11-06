// Le texte d'un commentaire pour un cook qui s'arrête sans livrer : pourquoi
// (son dernier message), après combien de tours, avec quel code de sortie (#2591).
const MESSAGE_MAX = 800;

export type ArretDuCook = { message: string | null; turns: number; code: number | null };

export function motifArretCook(raison: string, { message, turns, code }: ArretDuCook): string {
  const dit = (message ?? "").trim().replace(/\s+/g, " ").slice(0, MESSAGE_MAX);
  const dernier = dit === "" ? "the cook produced no last message" : `last message of the cook: ${dit}`;
  return `${raison} (${turns} turn${turns === 1 ? "" : "s"}, exit code ${code ?? "none"}); ${dernier}`;
}
