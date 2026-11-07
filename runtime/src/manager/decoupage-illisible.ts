// Un découpage que le code ne sait pas lire (#2661) : il est redemandé une
// seule fois ; si la seconde réponse est illisible aussi, l'épique cesse
// d'être découpée et se juge comme un ticket seul. Aucune troisième demande.
import type { Reponse } from "../decoupage.ts";

export type SuiteDuDecoupage<T> = { reponse: Reponse<T> | null } | { seul: boolean };

const illisible = <T>(reponse: Reponse<T> | null): boolean => reponse !== null && "illisible" in reponse;

// `demander` : une demande de découpage. `jugerSeul` : juge l'épique comme un
// ticket, et rend vrai si ce jugement a abouti. Une réponse absente (le
// jugement n'a pas abouti) n'est pas une réponse illisible : elle reste à
// refaire au tour suivant, sans relance.
export async function demanderAvecRelance<T>(demander: () => Promise<Reponse<T> | null>, jugerSeul: () => Promise<boolean>): Promise<SuiteDuDecoupage<T>> {
  const premiere = await demander();
  if (!illisible(premiere)) return { reponse: premiere };
  const seconde = await demander();
  if (!illisible(seconde)) return { reponse: seconde };
  return { seul: await jugerSeul() };
}
