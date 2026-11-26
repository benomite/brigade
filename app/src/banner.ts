// Le bandeau en tête d'un terminal de shell : où l'on est, et avec quel compte —
// « this Mac · debian ». Il se lit avant de taper. Sa couleur est celle du projet (couleurs.ts), posée par la vue.
import { userInfo } from "node:os";
import { lieuDe } from "./machines.ts";
import type { Cible } from "./persistance.ts";

// Ce que le bandeau dit quand le compte de la session n'est pas connu : il le dit plutôt que de le taire.
export const ACCOUNT_INCONNU = "account unknown";

export const texteBanner = (cible: Cible, account: string): string => `${lieuDe(cible)} · ${account}`;

export function accountDe(_cible: Cible): string {
  try {
    return userInfo().username;
  } catch {
    return process.env.USER ?? ACCOUNT_INCONNU;
  }
}
