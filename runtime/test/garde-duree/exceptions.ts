// Les fautes tolérées contre la règle des 2 s (#2129) : aucune, depuis #2130. Un test trop lent se réécrit
// sans vrais process ni vraie attente, ou s'en va si un autre couvre ce qu'il éprouve ; une garde se ramène
// à 2 s. Une ligne ajoutée ici serait une faute de plus, pas une solution.
//
//   { file, test }   un test mesuré à plus de 2 s (son titre, tel que le lanceur le donne)
//   { file, garde }  une garde écrite à plus de 2 s : `jusqua(…, <délai>)` ou `<nom>: <délai>` (timeout, délai, plafond, garde)
import type { Exception } from "./regle.ts";

export const EXCEPTIONS: Exception[] = [];
