// L'espace de « parade », son disjoncteur ouvert, « Resume » cliqué (#2140) : l'app a posté `/resume` sur l'issue
// `brigade:breaker-open` de la cuisine, et la ligne du disjoncteur, en tête de TODO, dit « Resume requested ».
import type { Ecran } from "./commun.ts";
import { todoDisjoncteur } from "./todo-disjoncteur.ts";

export const ecran: Ecran = todoDisjoncteur("Le même, « Resume » cliqué (#2140) : `/resume` posté sur l'issue `brigade:breaker-open`, la ligne dit « Resume requested »", {
  demandee: { issue: 2150, url: "https://github.com/chef/parade/issues/2150#issuecomment-1" },
});
