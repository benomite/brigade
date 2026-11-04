// Les fautes tolérées contre la règle des 2 s (#2129) : une ligne par fautif, avec son fichier. Vide depuis #2192 :
// tout test de plus de 2 s, toute garde écrite à plus de 2 s font échouer la suite. Une ligne dont la faute a
// disparu (test retiré, garde ramenée à 2 s) fait échouer le test : retire-la.
// Le sort de chacune des 1491 lignes qu'elle portait à #2129 est dans `anciens-fautifs.md`.
//
//   { file, test }   un test mesuré à plus de 2 s, ou de plus de 0,7 s sous forte charge (son titre, tel que le lanceur le donne)
//   { file, garde }  une garde écrite à plus de 2 s : `jusqua(…, <délai>)` ou `<nom>: <délai>` (timeout, délai, plafond, garde)
import type { Exception } from "./regle.ts";

export const EXCEPTIONS: Exception[] = [
];
