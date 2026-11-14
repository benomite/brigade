// De quoi un cook s'est arrêté : d'un geste git qui a échoué, ou du bac à sable
// qui a refusé quelque chose (#3552, épique #3540). Sur secondes, un refus de
// port (`java.net.SocketException: Operation not permitted`) a été lu comme « a
// git gesture » et a envoyé le chef sur la mauvaise piste. Git n'est nommé que
// lorsqu'une commande git a elle-même échoué.
import { demandeUnGesteGit } from "../conflit-main/renvoi.ts";

export type NatureDeLArret = "bac-a-sable" | "git" | "autre";

// Ce que dit un refus du bac à sable : un port ou un chemin refusé.
const REFUS_DU_BAC = /\bOperation not permitted\b|\bSocketException\b|\bEPERM\b|\bEACCES\b|\bConnection refused\b|\bsandbox-exec\b|\bdenied by the sandbox\b/i;
// Ce que dit git quand c'est lui qui échoue.
const ECHEC_DE_GIT = /\bfatal:|\berror: failed to push\b|\[rejected\]|\bnon-fast-forward\b|\bCONFLICT\b|\bAutomatic merge failed\b|\bcould not apply\b|\bmerge conflicts?\b|\bYou have unmerged paths\b/i;
const COMMANDE_GIT = /\bgit\s+(?:merge|rebase|push|pull|fetch|checkout|switch|reset|revert|commit|cherry-pick|stash|add|worktree|clone)\b/i;

// La nature de l'arrêt que `texte` (l'erreur ou la raison du cook) dit.
export function natureDeLArret(texte: string): NatureDeLArret {
  const gitEchoue = COMMANDE_GIT.test(texte) && ECHEC_DE_GIT.test(texte);
  if (REFUS_DU_BAC.test(texte) && !gitEchoue) return "bac-a-sable";
  if (gitEchoue || demandeUnGesteGit(texte)) return "git";
  return "autre";
}

// Ce que la station dit d'un arrêt du bac à sable : la cuisine ajoute le besoin
// à la déclaration du projet ; rien n'est demandé au chef.
export const DECLARATION_DU_BAC = ".claude/brigade/bac-a-sable.json";
export const DIT_L_ARRET_DU_BAC = `the sandbox refused something the cook needed (not a git gesture). The kitchen will add the need to the project's declaration (\`${DECLARATION_DU_BAC}\`, \`reseau\`) and the ticket goes back to a cook.`;
