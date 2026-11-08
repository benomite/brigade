// Un cook qui s'arrête sur le refus d'une permission pour une commande git que
// le protocole lui impose (`git fetch`, `git merge`, `git rebase`) n'attend
// aucune décision de produit ni de design : c'est un blocage technique, jamais
// un `blocked-on-human` (CLAUDE.md, « Brigade's goal: autonomy » ; #2921).
//
// Ce module est autonome : il classe un arrêt et dit les labels à poser. Aucun
// appelant ne le branche encore ; un autre ticket de l'épique #2949 le fait.
import { A_LA_MAIN } from "./brigade-github.ts";

export type CommandeGit = "fetch" | "merge" | "rebase";

export type ArretDuCook =
  | { genre: "technique"; commande: CommandeGit }
  | { genre: "question" };

// Le refus d'une permission, dans les mots que l'outil ou le cook emploient.
const REFUS = /permission|denied|not allowed|refus|interdit|autoris/i;
const GIT = /\bgit\s+(?:-\S+\s+(?:\S+\s+)?)*(fetch|merge|rebase)\b/i;

// Un arrêt est technique quand son texte nomme un refus de permission ET une
// commande git requise par le protocole ; sinon c'est une question.
export function classerArret(texte: string): ArretDuCook {
  const commande = GIT.exec(texte)?.[1]?.toLowerCase() as CommandeGit | undefined;
  if (commande && REFUS.test(texte)) return { genre: "technique", commande };
  return { genre: "question" };
}

// Les labels à poser sur le ticket pour cet arrêt : jamais `blocked-on-human`
// pour un blocage technique.
export function labelsDeLArret(arret: ArretDuCook): string[] {
  return arret.genre === "technique" ? [] : [A_LA_MAIN];
}
