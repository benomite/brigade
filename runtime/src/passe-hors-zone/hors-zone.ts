// Les fichiers qu'une livraison touche hors de la zone annoncée par son ticket (#3511) : la pass
// le dit sur la PR, en une ligne, comme un conseil. Rien ici ne renvoie ni ne retient la livraison :
// la ligne est posée à côté du verdict, jamais dedans, et une lecture ou une écriture qui échoue
// est dite à `avertir` sans toucher au jugement.
import { horsZone } from "../zones.ts";

// La ligne postée sur la PR, ou null si tout est dans la zone — ou si le ticket n'en annonce aucune.
function ligneHorsZone(zone: string[], fichiers: string[]): string | null {
  if (zone.length === 0) return null;
  const dehors = horsZone(zone, fichiers);
  return dehors.length === 0 ? null : `**Pass — advice**: this delivery touches ${dehors.length === 1 ? "a file" : "files"} outside the zone announced by its ticket: ${dehors.map((fichier) => `\`${fichier}\``).join(", ")}. This does not block the merge.`;
}

export type SignalHorsZone = {
  // La zone annoncée, lue du ticket : une lecture qui échoue ne pose rien.
  zone: () => Promise<string[]>;
  fichiers: string[];
  pr: number;
  // Les corps des commentaires déjà sur la PR : la même ligne ne s'y pose qu'une fois.
  commentaires: () => Promise<string[]>;
  commenter: (numero: number, corps: string) => Promise<void>;
  avertir: (texte: string) => void;
};

// Pose la ligne s'il y a lieu. Ne lève jamais : une PR dont les commentaires ne se lisent pas n'en reçoit pas,
// plutôt qu'une ligne en double.
export async function signalerHorsZone({ zone, fichiers, pr, commentaires, commenter, avertir }: SignalHorsZone): Promise<void> {
  try {
    const ligne = ligneHorsZone(await zone(), fichiers);
    if (ligne === null) return;
    if ((await commentaires()).includes(ligne)) return;
    await commenter(pr, ligne);
  } catch (erreur) {
    avertir(`brigade : the out-of-zone line of PR #${pr} was not posted — ${erreur instanceof Error ? erreur.message : String(erreur)}`);
  }
}
