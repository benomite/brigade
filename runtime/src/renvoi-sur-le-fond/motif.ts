// Le motif d'un renvoi tel qu'il se lit sur son commentaire (#4302), pris de la règle de `regle.ts`. Sans E/S.
import { jugerLaPR, MOTIFS_DE_RENVOI, motifsDeLaRelecture, verifierMotifDeRenvoi } from "./regle.ts";

// La ligne qui dit le motif d'un renvoi sur son commentaire : une CI rouge sans remarque de fond est un test qui échoue ;
// une relecture dit le sien par la nature de ses remarques ; une livraison qui ne se fusionne pas avec la base ne tient
// pas son critère. Les motifs viennent de la règle, donc de la liste fermée : un seul vocabulaire sur le commentaire.
export function ligneDuMotif(genre: "conflict" | "red CI" | "review", raison: string): string {
  const motifs = genre === "conflict" ? ["unmet criterion"] : genre === "red CI" ? jugerLaPR({ remarques: [], ci: "red" }).motifs : motifsDeLaRelecture(raison);
  const dits = MOTIFS_DE_RENVOI.filter((m) => motifs.includes(m));
  for (const m of dits) verifierMotifDeRenvoi(m);
  return `Send-back reason: ${dits.join(", ")}`;
}
