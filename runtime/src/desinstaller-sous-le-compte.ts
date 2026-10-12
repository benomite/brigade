// Le pas de la désinstallation de la box qui se joue sous le compte du
// service : le clone réservé et les worktrees sont à lui, et root n'y lit ni
// n'y suit rien. Lancé par le geste d'installation (`desinstallateur.ts`), qui
// lui donne l'état et le clone du projet — jamais à la main : la commande du
// chef est `installation desinstaller`.
//   node src/desinstaller-sous-le-compte.ts [--confirmer]
// C'est la désinstallation du runtime, telle quelle, avec tout ce qu'elle
// refuse. Il rend sur une ligne ce qu'elle rend, ou son refus.
import { enProcess, Sortie, type Appel } from "./appel.ts";
import { desinstaller, InstallationRefusee, type Desinstallation } from "./installation.ts";

export type Rendu = ({ ok: true } & Desinstallation) | { ok: false; refus: string };

export function principal({ args, env, dire, redire }: Appel): void {
  const confirme = args.length === 1 && args[0] === "--confirmer";
  if (args.length > 0 && !confirme) {
    redire("usage : node src/desinstaller-sous-le-compte.ts [--confirmer]");
    throw new Sortie(2);
  }
  let rendu: Rendu;
  try {
    rendu = { ok: true, ...desinstaller(env, { confirme }) };
  } catch (erreur) {
    if (!(erreur instanceof InstallationRefusee)) throw erreur;
    rendu = { ok: false, refus: erreur.message };
  }
  dire(JSON.stringify(rendu));
}

if (import.meta.main) await enProcess(principal);
