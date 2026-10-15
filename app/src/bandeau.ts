// Le bandeau en tête d'un terminal de shell : où l'on est, et avec quel compte —
// « box parade-box · debian ». Il se lit avant de taper, pour ne jamais lancer une commande
// à la mauvaise place. Sa couleur est celle du projet (couleurs.ts), posée par la vue.
import { execFileSync } from "node:child_process";
import { userInfo } from "node:os";
import { lieuDe } from "./machines.ts";
import type { Cible } from "./persistance.ts";

// Ce que le bandeau dit quand `ssh` ne dit pas le compte : il le dit plutôt que de le taire.
export const COMPTE_INCONNU = "account set by ssh";

export const texteBandeau = (cible: Cible, compte: string): string => `${lieuDe(cible)} · ${compte}`;

// Le compte que `ssh` donne à cet hôte : `ssh -G` ne joint personne, il imprime la configuration résolue.
export function compteDeSsh(ssh: string, hote: string): string {
  try {
    const sortie = execFileSync(ssh, ["-G", "--", hote], { encoding: "utf8", timeout: 3000, stdio: ["ignore", "pipe", "ignore"] });
    return /^user (\S+)$/m.exec(sortie)?.[1] ?? COMPTE_INCONNU;
  } catch {
    return COMPTE_INCONNU;
  }
}

export function compteDe(cible: Cible, ssh = "ssh"): string {
  if (cible.lieu === "poste") {
    try {
      return userInfo().username;
    } catch {
      return process.env.USER ?? COMPTE_INCONNU;
    }
  }
  return compteDeSsh(ssh, cible.hote);
}
