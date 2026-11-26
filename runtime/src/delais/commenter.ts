// Le commentaire d'un ticket lent (#4299) : chaque ticket mergé dans les dernières 24 heures plus de 10 minutes
// après sa prise reçoit, sur son issue, un commentaire qui partage ce temps en cook, gates, review, renvois et
// attentes. Une seule fois : le commentaire porte une marque, et un ticket dont l'issue la porte déjà n'en reçoit
// pas d'autre — le job se rejoue sans rien poster deux fois. La station le joue à chaque merge (`brigade-github.ts`).
import { lireLesEvenements } from "./evenements.ts";
import { dansLaFenetre, decomposer, estLent, type Evenement, SEUIL_MIN } from "./mesure.ts";

const MARQUE = "<!-- brigade:delai-de-prise -->";

// Ce que le job lit et écrit sur GitHub : les corps des commentaires d'une issue, et un commentaire posté.
type GitHubDesDelais = { commentaires(issue: number): Promise<string[]>; commenter(issue: number, corps: string): Promise<void> };

function corpsDuCommentaire(e: Evenement): string {
  const { totalMin, parts } = decomposer(e);
  return [
    MARQUE,
    `**Taken to merged: ${totalMin} min**, over the ${SEUIL_MIN} min target. Where the time went:`,
    "",
    `- cook: ${parts.cook} min`,
    `- gates: ${parts.gates} min`,
    `- review: ${parts.review} min`,
    `- send-backs: ${parts["send-back"]} min`,
    `- waits: ${parts.wait} min`,
  ].join("\n");
}

// Un ticket sans phase connue — mesuré avant #2662 — n'a pas de partage à dire : il n'est pas commenté.
// Une issue illisible, ou un commentaire refusé, ne fait pas tomber le job : il le dit (`avertir`) et passe au
// ticket suivant, sans rien poster sur une issue qu'il n'a pas pu lire. `dejaCommentes` retient, d'un tour à
// l'autre, les tickets qui portent leur commentaire : leur issue ne se relit plus.
export async function commenterLesLents({
  evenements,
  maintenant,
  github,
  avertir = () => {},
  dejaCommentes = new Set<number>(),
}: {
  evenements: readonly Evenement[];
  maintenant: string;
  github: GitHubDesDelais;
  avertir?: (texte: string) => void;
  dejaCommentes?: Set<number>;
}): Promise<void> {
  for (const e of dansLaFenetre(evenements, maintenant).filter((e) => estLent(e) && e.phases.length > 0)) {
    if (dejaCommentes.has(e.ticket)) continue;
    let corps: string[];
    try {
      corps = await github.commentaires(e.ticket);
    } catch (erreur) {
      avertir(`brigade : #${e.ticket} — its comments are unreadable, its taken-to-merged breakdown is not posted: ${erreur instanceof Error ? erreur.message : String(erreur)}`);
      continue;
    }
    if (!corps.some((c) => c.includes(MARQUE))) {
      try {
        await github.commenter(e.ticket, corpsDuCommentaire(e));
      } catch (erreur) {
        avertir(`brigade : #${e.ticket} — its taken-to-merged breakdown could not be posted: ${erreur instanceof Error ? erreur.message : String(erreur)}`);
        continue;
      }
    }
    dejaCommentes.add(e.ticket);
  }
}

// Le job sur le clone du projet, tel que la station le joue après chaque merge : elle le branche une fois, sur son
// client GitHub, et il retient d'un merge à l'autre les tickets déjà commentés. Un fichier des temps illisible :
// rien n'est posté, et la station le dit.
export function brancherLesDelais({ github, avertir, maintenant = () => new Date() }: { github: { commentaires(issue: number): Promise<{ body: string }[]>; commenter(issue: number, corps: string): Promise<void> }; avertir: (texte: string) => void; maintenant?: (() => Date) | undefined }): (clone: string) => Promise<void> {
  const dejaCommentes = new Set<number>();
  const client: GitHubDesDelais = { commentaires: async (issue) => (await github.commentaires(issue)).map(({ body }) => body), commenter: (issue, corps) => github.commenter(issue, corps) };
  return async (clone) => {
    const evenements = lireLesEvenements(clone);
    if (evenements === null) {
      avertir("brigade : the ticket times of the clone are unreadable, no taken-to-merged breakdown is posted");
      return;
    }
    await commenterLesLents({ evenements, maintenant: maintenant().toISOString(), github: client, avertir, dejaCommentes });
  };
}
