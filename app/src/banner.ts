// Le bandeau en tête d'un terminal de shell : où l'on est, et avec quel compte —
// « this Mac · debian ». Il se lit avant de taper. Sa couleur est celle du projet (colors.ts), posée par la vue.
import { userInfo } from "node:os";
import { placeOf } from "./machines.ts";
import type { Target } from "./persistence.ts";

// Ce que le bandeau dit quand le compte de la session n'est pas connu : il le dit plutôt que de le taire.
export const ACCOUNT_UNKNOWN = "account unknown";

export const textBanner = (target: Target, account: string): string => `${placeOf(target)} · ${account}`;

export function accountOf(_target: Target): string {
  try {
    return userInfo().username;
  } catch {
    return process.env.USER ?? ACCOUNT_UNKNOWN;
  }
}
