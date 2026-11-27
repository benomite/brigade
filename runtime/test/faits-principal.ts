// La lecture des faits comme un process la rendrait : une ligne de JSON, ou le refus de `lireLesFaits` (ticket 4677 : plus
// aucune commande ne les rend, les tests lisent encore leur forme par cette ligne).
import { LectureImpossible, Sortie, type Appel } from "../src/appel.ts";
import { lireLesFaits } from "../src/faits.ts";

export function principal({ env, dire, redire }: Appel): void {
  try {
    dire(JSON.stringify(lireLesFaits(env)));
  } catch (erreur) {
    if (!(erreur instanceof LectureImpossible)) throw erreur;
    redire(`brigade : ${erreur.message}`);
    throw new Sortie(erreur.code);
  }
}
