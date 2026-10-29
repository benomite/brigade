// Le bouton qui règle le closer : sa commande est écrite dans le second du projet, et n'envoie
// rien — le chef fait Entrée. Un geste du socle (gestes.ts), direct ou confirmé, n'est pas ici.
// Ce qui s'écrit est la forme de docs/runtime/exploitation.md, « Piloter », depuis le poste
// (`brigade <projet> <commande>`), lancée par le geste de la station de cet ordinateur et préfixée
// du `!` qui la lance sur le Mac depuis une session `claude`.
import type { Cuisine } from "./box.ts";
import type { Projet } from "./config.ts";
import { enPoste } from "./gestes.ts";
import { EFFORTS, MODELES } from "./projets/projets.ts";

// Régler le closer (#990) : son modèle et son effort, choisis ensemble sur la partie closer de la page
// — l'un sans l'autre fait refuser le démarrage (docs/runtime/fermeture.md, « Le closer se règle, ou il
// n'y en a pas »). `station` ne prend qu'une décision par appel : les deux s'écrivent sur une ligne,
// l'une après l'autre, et rien ne part — le chef fait Entrée. Il ne
// s'écrit qu'avec ses deux valeurs, que la vue donne, et que seules les listes de la station admettent.
export const REGLER_LE_CLOSER = "regler-closer";
export function ecritPourLeCloser(cuisine: Cuisine | undefined, projet: Projet, modele: unknown, effort: unknown): { commande: string } | { refus: string } | undefined {
  if (cuisine === undefined) return undefined;
  if (!(MODELES as readonly unknown[]).includes(modele) || !(EFFORTS as readonly unknown[]).includes(effort)) {
    return { refus: `nothing is written: the closer takes a model (${MODELES.join(", ")}) and an effort (${EFFORTS.join(", ")}), both` };
  }
  const premier = enPoste(cuisine, projet.nom, `station closer-modele ${modele}`);
  const second = enPoste(cuisine, projet.nom, `station closer-effort ${effort}`);
  if ("refus" in premier) return premier;
  if ("refus" in second) return second;
  return { commande: `!${premier.commande} && ${second.commande}` };
}
