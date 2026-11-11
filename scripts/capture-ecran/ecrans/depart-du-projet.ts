// Le premier écran d'un projet qu'« Add a project » vient d'ouvrir, quand il a des issues ouvertes (#3268) : « Brigade read
// your 12 open issues — here are the ones to cook first ». Les lignes sont celles que le second propose : titre, priorité, une
// raison. Les issues et leurs raisons sont figées ici ; rien n'est lu.
import { parcoursPremierProjet } from "./parcours-premier-projet-commun.ts";

const LIGNES = [
  { ticket: 14, titre: "Checkout fails when the cart holds a sold-out item", priorite: 1, raison: "A bug on the path that takes the money." },
  { ticket: 9, titre: "Menu page shows yesterday's prices", priorite: 1, raison: "Wrong prices reach customers every morning." },
  { ticket: 21, titre: "Add allergen labels to every dish", priorite: 2, raison: "Asked for by several customers; self-contained." },
  { ticket: 17, titre: "Order confirmation email is sent twice", priorite: 2, raison: "Visible and annoying, with a clear single cause." },
  { ticket: 3, titre: "Rename the 'plats' folder to 'dishes'", priorite: 3, raison: "Cosmetic; no one is blocked by it." },
];

export const ecran = parcoursPremierProjet("Le départ d'un projet de 12 issues ouvertes (#3268) : les cinq que le second propose d'abord", false, [], false, { ouvertes: 12, lignes: LIGNES });
