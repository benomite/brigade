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

// Un geste git qu'un texte demande : une commande git, un merge, un rebase, un
// push, un fetch, une résolution de conflit. Jamais une question pour le chef.
const GESTE_GIT = /\bgit\s+[a-z-]+|\bmerg(?:e|es|ed|ing)\b|\brebas(?:e|es|ed|ing)\b|\bpush(?:es|ed|ing)?\b|\bfetch(?:es|ed|ing)?\b|\bcherry-pick|\bresolv\w*\s+(?:\w+\s+){0,2}conflicts?\b|\bconflict(?:s|ing)?\s+(?:resolution|markers?)\b|\bfusionn|\brebaser\b|\brésou\w*\s+(?:\w+\s+){0,2}conflits?\b/i;

export function demandeUnGesteGit(texte: string): boolean {
  return GESTE_GIT.test(texte);
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
// titre nomme la branche d'un autre cook (`cook/<N>-…`, le titre du `fix` que
// la station ouvrait avant #3476), ou c'est le geste git d'un ticket
// (`Do the git gesture of #N`) dont le corps nomme la branche `cook/<N>-…`.
// Le corps seul ne compte pas : un ticket peut raconter un tel incident sans
// avoir pour travail de toucher cette branche.
export function cibleDuTravail({ numero, titre, corps }: { numero?: number; titre: string; corps: string }): number | null {
  const autre = (n: number) => (Number.isSafeInteger(n) && n > 0 && n !== numero ? n : null);
  const branche = /\bcook\/([1-9]\d*)-/.exec(titre);
  if (branche) return autre(Number(branche[1]));
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
