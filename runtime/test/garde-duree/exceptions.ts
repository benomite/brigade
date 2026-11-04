// Les fautes d'aujourd'hui contre la règle des 2 s (#2129) : une ligne par fautif, avec son fichier. Un ticket
// suivant la vide ; en attendant, la règle ne bloque que ce qui s'y ajoute. Une ligne dont la faute a disparu
// (test retiré, garde ramenée à 2 s) fait échouer le test : retire-la.
//
//   { file, test }   un test mesuré à plus de 2 s, ou de plus de 0,7 s sous forte charge (son titre, tel que le lanceur le donne)
//   { file, garde }  une garde écrite à plus de 2 s : `jusqua(…, <délai>)` ou `<nom>: <délai>` (timeout, délai, plafond, garde)
import type { Exception } from "./regle.ts";

export const EXCEPTIONS: Exception[] = [
];
