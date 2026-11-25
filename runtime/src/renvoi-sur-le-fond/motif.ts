// Le motif d'un renvoi tel qu'il se lit sur son commentaire (#4302), pris de la règle de `regle.ts`. Sans E/S.
import { jugerLaPR, MOTIFS_DE_RENVOI, motifsDeLaRelecture, verifierMotifDeRenvoi } from "./regle.ts";

// La ligne qui dit le motif d'un renvoi sur son commentaire : une CI rouge sans remarque de fond est un test qui échoue ;
// une relecture dit le sien par la nature de ses remarques. Un renvoi pour conflit n'a aucun des trois motifs : null.
export function ligneDuMotif(genre: "conflict" | "red CI" | "review", raison: string): string | null {
  if (genre === "conflict") return null;
  const motifs = genre === "red CI" ? jugerLaPR({ remarques: [], ci: "red" }).motifs : motifsDeLaRelecture(raison);
  motifs.forEach(verifierMotifDeRenvoi);
  return `Send-back reason: ${MOTIFS_DE_RENVOI.filter((m) => motifs.includes(m)).join(", ")}`;
}
