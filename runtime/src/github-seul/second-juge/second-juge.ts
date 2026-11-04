// Le second juge, quand GitHub est le seul état de la cuisine (épique #2209,
// ticket #2212). Une PR dont le diff touche à ce qui juge les livraisons —
// `.github/workflows/` ou `.claude/brigade/` — ne se merge pas sur la seule
// parole du reviewer : un second juge doit l'avoir approuvée.
//
// - Le point d'entrée, `verifierLeSecondJuge`, est celui que l'étape de merge
//   appelle : elle ne merge que si `bloque` est faux.
// - L'approbation du second juge est un commentaire de la PR qui porte la
//   marque `brigade:second-juge` et le verdict `not-weakened`, posté par le
//   propriétaire. Un commentaire d'un autre auteur ne compte pas : c'est la
//   PR elle-même qui l'aurait écrit.
// - Le refus poste un commentaire sur la PR, une fois : tant que ce refus est
//   le dernier mot du fil, il n'est pas répété.
import type { VerdictDuSecondJuge } from "../../events/pass.ts";

// Les dossiers dont le contenu juge les livraisons.
export const DOSSIERS_DES_JUGES = [".github/workflows/", ".claude/brigade/"] as const;

export const touchePeutJuger = (fichier: string): boolean => DOSSIERS_DES_JUGES.some((dossier) => fichier.startsWith(dossier));

export const MARQUE_DU_SECOND_JUGE = "brigade:second-juge";
export const MARQUE_DU_REFUS = "brigade:second-juge-requis";

export const corpsDApprobation = (verdict: VerdictDuSecondJuge): string => `<!-- ${MARQUE_DU_SECOND_JUGE} verdict=${verdict} -->\nSecond judge: ${verdict === "not-weakened" ? "not weakened" : verdict === "weakened" ? "weakened" : "cannot establish"}.`;

export const corpsDuRefus = (fichiers: string[]): string =>
  `<!-- ${MARQUE_DU_REFUS} -->\nA second judge is required before this PR can be merged: it changes what judges deliveries (${fichiers.map((f) => `\`${f}\``).join(", ")}), and the reviewer's approval alone is not enough. The merge is refused until the second judge has approved.`;

export type CommentaireDePR = { body: string; association: string; createdAt: string };

export type GitHubDuSecondJuge = {
  // Les fichiers que la PR change.
  fichiers(pr: number): Promise<string[]>;
  // Les commentaires de la PR, dans l'ordre où GitHub les rend.
  commentaires(pr: number): Promise<CommentaireDePR[]>;
  commenter(pr: number, corps: string): Promise<void>;
};

export type Decision = { bloque: false } | { bloque: true; raison: string; fichiers: string[] };

const verdictDe = (corps: string): string | null => new RegExp(`^<!-- ${MARQUE_DU_SECOND_JUGE} verdict=(\\S+) -->`).exec(corps)?.[1] ?? null;

// Le verdict du second juge sur la PR : le plus récent de ses commentaires
// postés par le propriétaire. Null si aucun.
export function dernierVerdict(commentaires: CommentaireDePR[]): string | null {
  for (const commentaire of [...commentaires].reverse()) {
    if (commentaire.association !== "OWNER") continue;
    const verdict = verdictDe(commentaire.body);
    if (verdict !== null) return verdict;
  }
  return null;
}

// Peut-on merger la PR ? Oui si elle ne touche à aucun juge, ou si le second
// juge l'a approuvée (`not-weakened`). Sinon non, et un commentaire le dit sur
// la PR — sauf si le dernier mot du fil est déjà ce refus.
export async function verifierLeSecondJuge(pr: number, github: GitHubDuSecondJuge): Promise<Decision> {
  const juges = (await github.fichiers(pr)).filter(touchePeutJuger);
  if (juges.length === 0) return { bloque: false };
  const commentaires = await github.commentaires(pr);
  const verdict = dernierVerdict(commentaires);
  if (verdict === "not-weakened") return { bloque: false };
  const raison = verdict === null ? "a second judge is required" : `the second judge said: ${verdict.replace("-", " ")}`;
  const dernier = commentaires.at(-1);
  if (!(dernier && dernier.body.startsWith(`<!-- ${MARQUE_DU_REFUS} -->`))) await github.commenter(pr, corpsDuRefus(juges));
  return { bloque: true, raison, fichiers: juges };
}
