// L'espace de « parade », son disjoncteur ouvert, « Resume » cliqué et GitHub refuse le commentaire (#2140) : la ligne
// du disjoncteur le dit en une ligne, la réponse de GitHub au survol, et « Resume » est rendu pour réessayer.
import type { Ecran } from "./commun.ts";
import { todoDisjoncteur } from "./todo-disjoncteur.ts";

export const ecran: Ecran = todoDisjoncteur("Le même, « Resume » cliqué et GitHub refuse le commentaire (#2140) : la ligne le dit en une ligne, la réponse de GitHub au survol, « Resume » rendu", {
  refus: "resume not requested: GitHub did not take the comment",
  detail: "GitHub refused the comment (HTTP 403): Resource not accessible by integration",
});
