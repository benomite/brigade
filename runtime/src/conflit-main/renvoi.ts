// Ce que la station écrit quand la branche d'un ticket ne prend pas
// `origin/<base>` (#3476, épique #3471), et ce qu'elle lit pour reconnaître un
// travail ou une carte qui porte sur la branche d'un cook. Textes et lectures
// seuls : `conflit-main.ts` les enchaîne.
//
// Le 2026-11-13, sur benomite/secondes, la station n'a pas pu fusionner
// origin/main dans cook/18-github (conflits dans MainActivity.kt et
// strings.xml) : elle a ouvert le ticket `fix` #28, dont le cook ne pouvait
// pas écrire la branche de #18 et dont la carte demandait au chef de lancer
// git à la main. Les deux tickets s'attendaient, le projet était gelé. Un
// conflit avec la base revient au cook du ticket lui-même, jamais à un ticket
// neuf ni au chef.
import { lesMotsDuCook } from "../attente-ticket/attente-ticket.ts";

// La marque du renvoi au cook du ticket, suivie des fichiers en conflit.
export const MARQUE_DU_CONFLIT_MAIN = "<!-- brigade:conflit-main";

// Un geste git qu'un texte demande : une commande git (`git merge`, `git
// push`…), ou un verbe de git (merge, rebase, push, fetch, résoudre…) dont le
// texte nomme aussi un objet de git — une branche, `origin/`, `cook/<N>-`, un
// commit, une PR, un conflit de fusion, un fichier du dépôt. Le verbe seul ne
// suffit pas : « should we enable push notifications? » ou « should we merge
// the two screens? » sont des questions de produit, qui restent au chef.
const COMMANDE_GIT = /\bgit\s+(?:merge|rebase|push|pull|fetch|checkout|switch|reset|restore|revert|commit|cherry-pick|stash|add|rm|mv|branch|worktree|clone|status|diff|log|am|apply|tag|mergetool)\b/i;
const VERBE_GIT = /\bmerg(?:e|es|ed|ing)\b|\brebas(?:e|es|ed|ing)\b|\bpush(?:es|ed|ing)?\b|\bpull(?:s|ed|ing)?\b|\bfetch(?:es|ed|ing)?\b|\bcherry-pick|\bcheck\s*out\b|\bresolv\w*|\bfusionn\w*|\brebaser\b|\brésou\w*/i;
const OBJET_GIT = /\bgit\b|\borigin\/|\bcook\/\d+-|\bbranch(?:es)?\b|\bbranches?\b|\bHEAD\b|\bworktree\b|\bcommits?\b|\bupstream\b|\bPR\b|\bpull requests?\b|<<<<<<<|\bmerge conflicts?\b|\bconflict markers?\b|\bconflits? de fusion\b|\bmarqueurs? de conflit\b|`(?:main|master)`|\b(?:into|onto)\s+(?:main|master)\b|\b[\w./-]+\.(?:kt|kts|java|xml|ts|tsx|js|jsx|mjs|json|md|py|go|rs|swift|gradle|ya?ml|toml|css|scss|html|sh|lock)\b/i;

// Un refus du bac à sable ou du système (un port local, un fichier, un réseau
// refusés) : la cause d'un arrêt qui n'est pas git, même quand le texte nomme
// une branche ou un fichier (secondes#21 : `SocketException: Operation not
// permitted`, la carte retirée comme « un geste git », #3543).
const REFUS_DU_BAC = /\bOperation not permitted\b|\bSocketException\b|\bEPERM\b|\bEACCES\b|\bPermission denied\b|\bsandbox(?:ed)?\b|\bbac à sable\b/i;
// Ce qui montre qu'une opération git a vraiment échoué : la sortie même de git.
const ECHEC_DE_GIT = /\bfatal:|\bCONFLICT\b|<<<<<<<|\bmerge conflicts?\b|\bfailed to push\b|\bnon-fast-forward\b|\bgit\s+[\w-]+\b[^.\n]{0,40}\b(?:failed|exited|refused)\b/i;

// La cause du texte est un refus du bac à sable, aucune opération git n'y échoue.
export function refusDuBacSansGit(texte: string): boolean {
  return REFUS_DU_BAC.test(texte) && !ECHEC_DE_GIT.test(texte);
}

// Un réglage du bac à sable à poser dans un fichier de réglages (`allowLocalBinding`,
// un bloc `"sandbox": {…}` dans `settings.json`) : jamais un geste que le chef peut
// réussir, la cuisine ne lui demande rien là-dessus (#3562, épique #3540).
const REGLAGE_DU_BAC = /\ballowLocalBinding\b|"sandbox"\s*:|\bsandbox\.(?:network|filesystem)\b|\bsettings(?:\.local)?\.json\b[^\n]*\bsandbox\b|\bsandbox\b[^\n]*\bsettings(?:\.local)?\.json\b/i;

export function demandeUnReglageDuBac(texte: string): boolean {
  return REGLAGE_DU_BAC.test(texte) && !ECHEC_DE_GIT.test(texte);
}

export function demandeUnGesteGit(texte: string): boolean {
  if (refusDuBacSansGit(texte)) return false;
  return COMMANDE_GIT.test(texte) || (VERBE_GIT.test(texte) && OBJET_GIT.test(texte));
}

// La tête d'une carte du chef (`teteDeCarte`) qui lui demande un geste git :
// une carte de geste (`**Gesture for the chef`) dont le geste est de git, ou
// toute carte qui nomme la branche d'un cook (`cook/<N>-`) ou une commande git.
// Une question de produit qui ne nomme ni l'une ni l'autre reste au chef, quels
// que soient ses mots (#3476).
// La carte du chef (`teteDeCarte`) qui lui demande un réglage du bac à sable.
export function carteDeBacASable(tete: string): boolean {
  return demandeUnReglageDuBac(tete) || (/^\*\*Gesture for the chef\b/.test(tete) && refusDuBacSansGit(tete));
}

export function carteDeGesteGit(tete: string): boolean {
  if (refusDuBacSansGit(tete)) return false;
  return (/^\*\*Gesture for the chef\b/.test(tete) && demandeUnGesteGit(tete)) || COMMANDE_GIT.test(tete) || /\bcook\/[1-9]\d*-/.test(tete);
}

const liste = (fichiers: readonly string[]) => fichiers.map((f) => `\`${f}\``).join(", ");

// Le renvoi du ticket à son propre cook : la branche ne prend pas la base.
// `fichiers` : les chemins en conflit, vides quand la fusion a échoué sans
// conflit (fetch refusé, réseau) — le cook met alors sa branche à jour lui-même.
export function corpsDuRenvoiPourConflit({ station, base, branche, fichiers, detail, question }: { station: string; base: string; branche: string; fichiers: readonly string[]; detail?: string; question?: string }): string {
  const enConflit = fichiers.length > 0;
  return [
    `${MARQUE_DU_CONFLIT_MAIN} origin/${base}: ${fichiers.join(", ")} -->`,
    enConflit
      ? `Station \`${station}\`: \`${branche}\` cannot take \`origin/${base}\` as is: merging it stops on conflicts in ${liste(fichiers)}. The ticket goes back to its own cook: the next cook of this ticket starts on \`${branche}\` with \`origin/${base}\` already merged into it, the conflict markers left in these files. It resolves them in its branch, runs the gates and goes on.`
      : `Station \`${station}\`: the station could not bring \`${branche}\` up to date with \`origin/${base}\`${detail === undefined ? "" : ` (${detail})`}. The ticket goes back to its own cook, which brings its branch up to date, runs the gates and goes on.`,
    "",
    "No other ticket is opened for it, and nothing here is for the chef. This stop is not counted among the ticket's tries.",
    ...(question === undefined ? [] : ["", ...lesMotsDuCook(question)]),
  ].join("\n");
}

// La carte du chef quand le conflit cache un choix de produit : la question,
// dite en mots de produit, jamais un geste git (#3476).
export function carteDuChoixDeProduit({ station, base, fichiers, question, sorte }: { station: string; base: string; fichiers: readonly string[]; question: string; sorte: "produit" | "design" }): string {
  return [
    `**Question for the chef (${sorte === "produit" ? "product" : "design"}):** ${question.trim()}`,
    "",
    `Station \`${station}\`: this ticket's work and what \`${base}\` brought since change the same places (${liste(fichiers)}), and the two do not say the same thing. Only the chef chooses which one the product keeps. Answer on this issue, then remove \`blocked-on-human\`: the ticket's own cook carries your answer into its work.`,
  ].join("\n");
}

// Le ticket dont un ticket a pour travail de changer la branche, ou null : son
// titre nomme la branche d'un autre cook (`cook/<N>-…`) ET un geste sur elle —
// la mettre à jour, la fusionner, la rebaser, y résoudre un conflit, la
// pousser —, comme le titre du `fix` que la station ouvrait avant #3476 ; ou
// c'est le geste git d'un ticket (`Do the git gesture of #N`) dont le corps
// nomme la branche `cook/<N>-…`. La règle ne lit que le titre, et reste une
// heuristique : un titre qui cite seulement la branche (« Wrong naming of
// `cook/12-github` ») ne compte pas. Le corps seul ne compte pas : un ticket
// peut raconter un tel incident sans avoir pour travail de toucher cette
// branche.
const GESTE_SUR_LA_BRANCHE = /\bup to date\b|\bmerg\w*|\brebas\w*|\bresolv\w*|\bconflict\w*|\bpush\w*|\bpull\b|\bsync\w*|\bfusionn\w*|\bconflits?\b|\b(?:mettre|mise) à jour/i;
export function cibleDuTravail({ numero, titre, corps }: { numero?: number; titre: string; corps: string }): number | null {
  const autre = (n: number) => (Number.isSafeInteger(n) && n > 0 && n !== numero ? n : null);
  const branche = /\bcook\/([1-9]\d*)-/.exec(titre);
  if (branche) return GESTE_SUR_LA_BRANCHE.test(titre) ? autre(Number(branche[1])) : null;
  const geste = /^Do the git gesture of #([1-9]\d*)\b/.exec(titre.trim());
  if (geste && new RegExp(`\\bcook/${geste[1]}-`).test(corps)) return autre(Number(geste[1]));
  return null;
}

// Pourquoi la création de cette issue est refusée, ou null : son travail serait
// de changer la branche d'un autre ticket (#3476).
export function refusDeLaCreation(issue: { titre: string; corps: string }): string | null {
  const cible = cibleDuTravail(issue);
  return cible === null ? null : `issue not opened: its work would be to change the branch of #${cible}, which only #${cible}'s own cook changes — the kitchen sends #${cible} back to its cook instead (#3476)`;
}

// Les fichiers en conflit qu'un texte de la station nomme : « conflicts in
// `a`, `b` », comme le corps du `fix` d'avant #3476 les écrivait.
export function fichiersNommes(texte: string): string[] {
  const lu = /conflicts? in ((?:`[^`\n]+`(?:,\s*|\s+and\s+)?)+)/i.exec(texte);
  return lu ? [...(lu[1] ?? "").matchAll(/`([^`\n]+)`/g)].map(([, f]) => f ?? "").filter(Boolean) : [];
}

// La carte du chef qu'une station a posée sur l'issue (`corpsDeLaCarte`,
// blocage-au-manager.ts) : sa première ligne.
export function teteDeCarte(corps: string): string | null {
  const tete = corps.trimStart().split("\n", 1)[0] ?? "";
  return /^\*\*(?:Gesture|Question) for the chef\b/.test(tete) ? tete : null;
}
