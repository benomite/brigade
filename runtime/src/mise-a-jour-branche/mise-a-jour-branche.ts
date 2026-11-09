// La cuisine tient la branche d'un cook à jour de `origin/<base>` (#3001,
// épique #2989). Le 2026-11-09, les cartes #2910, #2914 et #2915 demandaient
// au chef de merger ou de mettre à jour des branches : le worktree d'un cook
// était parti d'une base plus ancienne que le merge dont il avait besoin, et
// son `git merge origin/main` lui était refusé. Rien n'y était à décider.
//
// `cuisinerLeTicket` (brigade-github.ts) l'appelle à deux endroits :
// - au départ du cook : la station rapatrie la base et la fusionne dans la
//   branche si elle ne la porte pas déjà ;
// - quand le cook s'arrête en disant qu'il lui manque des commits de la base
//   (`demandeLaBase`) : la station rapatrie et fusionne `origin/<base>` dans
//   sa branche, puis le ticket repart à un cook depuis elle (`apresLaMiseAJour`).
//   Si elle n'y arrive pas — conflit, refus, réseau —, elle ouvre un ticket
//   `fix` sous les labels de réparation du manager (`renvois.ts`), et le ticket
//   l'attend sur le rail : jamais de carte TODO, jamais `blocked-on-human`.
//
// Différent de #2953 (`renvoi-conflit.ts`) : là, la PR est déjà en conflit et
// la fusion, non commitée, est laissée au cook ; ici, la fusion est commitée
// par la station ou défaite, et le worktree reste propre. Différent de #2968
// (`attente-ticket.ts`) : là, le travail attendu n'est pas encore mergé.
import { lesMotsDuCook, MARQUE_D_ATTENTE_DE_TICKET } from "../attente-ticket/attente-ticket.ts";
import { LABEL_FIX, marqueDeFix, PRIO_DU_FIX } from "../github-seul/renvois/renvois.ts";
import { LABEL } from "../github.ts";
import type { LanceurGit, SortieGit } from "../integration-base.ts";
import { CALIBRAGE_REPARATION } from "../reparation.ts";

export type MiseAJourDeLaBranche =
  // La branche portait déjà la tête de `origin/<base>` : rien n'a bougé.
  | { etat: "deja" }
  // La station a fusionné `origin/<base>` dans la branche, et commité la fusion.
  | { etat: "fusionnee" }
  // Elle n'a pas pu : `etape` dit où, `detail` ce que git a dit, `fichiers`
  // les chemins en conflit. La fusion tentée est défaite.
  | { etat: "echec"; etape: "recolte" | "fetch" | "merge"; detail: string; fichiers: string[] };

const SUJET_DE_LA_FUSION = (base: string) => `brigade : la branche mise à jour de origin/${base}`;

const detail = (sortie: SortieGit) => sortie.stderr.trim() || sortie.stdout.trim() || `git exited with ${sortie.code}`;

// Rapatrie `origin/<base>` dans le worktree d'un cook, et la fusionne dans sa
// branche si elle ne la porte pas déjà. Le worktree doit être propre : ce que
// le cook y a laissé est récolté avant. Une fusion qui bute est défaite —
// `merge --abort`, sinon `reset --hard` —, pour que rien de ses marqueurs ne
// soit récolté ensuite. Un git qui ne se lance pas est un `echec`, jamais une
// panne du tour.
export async function mettreAJourLaBranche(git: LanceurGit, worktree: string, base: string): Promise<MiseAJourDeLaBranche> {
  const lancer = (args: string[]) => git(args, worktree).catch((erreur: unknown): SortieGit => ({ code: 1, stdout: "", stderr: erreur instanceof Error ? erreur.message : String(erreur) }));
  const rapatriee = await lancer(["fetch", "origin", base]);
  if (rapatriee.code !== 0) return { etat: "echec", etape: "fetch", detail: detail(rapatriee), fichiers: [] };
  // 0 : la tête de la base est déjà dans la branche ; 1 : elle n'y est pas ;
  // autre chose : git n'a pas pu le dire, et la fusion le dira.
  if ((await lancer(["merge-base", "--is-ancestor", "FETCH_HEAD", "HEAD"])).code === 0) return { etat: "deja" };
  const fusion = await lancer(["merge", "--no-edit", "--no-verify", "-m", SUJET_DE_LA_FUSION(base), "FETCH_HEAD"]);
  if (fusion.code === 0) return { etat: "fusionnee" };
  const nonFusionnes = await lancer(["diff", "--name-only", "--diff-filter=U"]);
  const fichiers = nonFusionnes.code === 0 ? nonFusionnes.stdout.split("\n").map((ligne) => ligne.trim()).filter(Boolean) : [];
  if ((await lancer(["merge", "--abort"])).code !== 0) await lancer(["reset", "--hard", "--quiet", "HEAD"]);
  return { etat: "echec", etape: "merge", detail: detail(fusion), fichiers };
}

const echapper = (texte: string) => texte.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

// Ce qui, dans les mots du cook, dit qu'il lui faut la base : il la nomme
// (`origin/<base>`, `` `<base>` ``, « on <base> », « the <base> branch »…)
// dans une phrase qui parle de la récupérer, de la fusionner, ou de commits
// qui manquent à sa branche.
const BESOIN = /merg|fetch|rebase|up to date|up-to-date|updat|behind|missing|lacks?\b|not (?:yet )?(?:on|in) (?:my|this|the|its)|older|predates|pas (?:encore )?(?:sur|dans)|manqu|absent|en retard|à jour|plus ancien|fusion|récupér/i;

// Le cook dit-il, dans sa question, qu'il lui faut des commits de la base que
// sa branche n'a pas ? Une question de produit qui nommerait la base au
// passage coûte au plus une mise à jour : une branche qui la porte déjà
// (`deja`) laisse la question suivre sa voie.
export function demandeLaBase(question: string, base: string): boolean {
  const b = echapper(base);
  const nommee = new RegExp(`origin/${b}\\b|\`${b}\`|\\b(?:on|in|into|from|to|with|of|sur|dans|de|depuis)\\s+(?:the\\s+|la\\s+)?${b}\\b|\\b${b}\\s+branch|branche\\s+${b}\\b`, "i");
  return question.split(/(?<=[.!?])\s+|\n+/).some((phrase) => nommee.test(phrase) && BESOIN.test(phrase));
}

// Le ticket `fix` d'une mise à jour que la station n'a pas pu faire : sous les
// labels du `fix` que le manager ouvre (`renvois.ts`), au calibrage d'une
// réparation, et marqué du ticket qu'il répare, pour qu'il n'en ouvre pas d'autre.
export function ticketDuFix({ ticket, base, branche, miseAJour, question }: { ticket: number; base: string; branche: string; miseAJour: Extract<MiseAJourDeLaBranche, { etat: "echec" }>; question: string }) {
  const ou = miseAJour.etape === "merge" && miseAJour.fichiers.length > 0 ? `the merge stopped on conflicts in ${miseAJour.fichiers.map((f) => `\`${f}\``).join(", ")}` : `\`git ${miseAJour.etape === "recolte" ? "commit" : miseAJour.etape}\` failed`;
  return {
    titre: `The kitchen could not bring \`${branche}\` up to date with \`origin/${base}\` for #${ticket}`,
    corps: [
      marqueDeFix(ticket),
      "",
      "## Context",
      "",
      `The cook of #${ticket} stopped: it needs commits that are on \`origin/${base}\` and not on its branch \`${branche}\`. The kitchen fetched and tried to merge \`origin/${base}\` into the branch itself, and could not: ${ou}. The attempt was undone; the branch is as the cook left it.`,
      "",
      "Git said:",
      "",
      "```",
      miseAJour.detail,
      "```",
      "",
      ...lesMotsDuCook(question),
      "",
      "## Acceptance criteria",
      "",
      `- \`${branche}\` contains the current \`origin/${base}\` tip, or the reason the kitchen cannot merge it is fixed in the kitchen`,
      `- #${ticket} waits for this ticket on the rail and goes back to a cook once it is served`,
    ].join("\n"),
    labels: [LABEL, LABEL_FIX, PRIO_DU_FIX, `model:${CALIBRAGE_REPARATION.model}`, `effort:${CALIBRAGE_REPARATION.effort}`],
  };
}

export type GitHubDeLaMiseAJour = {
  commenter(numero: number, corps: string): Promise<void>;
  creerIssue(issue: { titre: string; corps: string; labels: string[] }): Promise<number>;
};

// Ce que devient le ticket d'un cook arrêté sur la base, une fois la mise à
// jour tentée : fusionnée, il repart à un cook depuis sa branche ; en échec,
// la station ouvre son ticket `fix` et le ticket l'attend sur le rail
// (la marque d'attente de `attente-ticket.ts`, que la porte de prise relit). Un `fix` qui ne s'ouvre
// pas est dit sur l'issue, et le ticket repart quand même : rien ne va au chef.
// Rend le `fix` ouvert, ou null.
export async function apresLaMiseAJour(
  github: GitHubDeLaMiseAJour,
  { station, ticket, base, branche, question, miseAJour }: { station: string; ticket: number; base: string; branche: string; question: string; miseAJour: Exclude<MiseAJourDeLaBranche, { etat: "deja" }> },
): Promise<{ fix: number | null; dit: string }> {
  if (miseAJour.etat === "fusionnee") {
    await github.commenter(
      ticket,
      `Station \`${station}\`: the cook stopped because it needs commits that are on \`origin/${base}\` and not on its branch. The station fetched \`origin/${base}\` and merged it into \`${branche}\`: the ticket goes back to a cook, from that branch. Nothing here is for the chef, and this stop is not counted among the ticket's tries.\n\n${lesMotsDuCook(question).join("\n")}`,
    );
    return { fix: null, dit: `the station merged \`origin/${base}\` into \`${branche}\`: the ticket goes back to a cook` };
  }
  let fix: number;
  try {
    fix = await github.creerIssue(ticketDuFix({ ticket, base, branche, miseAJour, question }));
  } catch (erreur) {
    const pourquoi = erreur instanceof Error ? erreur.message : String(erreur);
    await github.commenter(
      ticket,
      `Station \`${station}\`: the cook stopped because it needs commits that are on \`origin/${base}\` and not on its branch. The station could not merge \`origin/${base}\` into \`${branche}\` (${miseAJour.etape}: ${miseAJour.detail}), nor open its \`fix\` ticket (${pourquoi}). The ticket goes back to a cook; nothing here is for the chef, and this stop is not counted among the ticket's tries.`,
    );
    return { fix: null, dit: `the station could not merge \`origin/${base}\` into \`${branche}\` (${miseAJour.etape}), nor open its fix ticket (${pourquoi}): the ticket goes back to a cook` };
  }
  await github.commenter(
    ticket,
    `${MARQUE_D_ATTENTE_DE_TICKET} #${fix} -->\nStation \`${station}\`: the cook stopped because it needs commits that are on \`origin/${base}\` and not on its branch. The station could not merge \`origin/${base}\` into \`${branche}\` (${miseAJour.etape}: ${miseAJour.detail}) and opened the \`fix\` ticket #${fix}. Nothing here is for the chef: the ticket waits on the rail for #${fix}, and a cook takes it on its own once it is served. This stop is not counted among the ticket's tries.\n\n${lesMotsDuCook(question).join("\n")}`,
  );
  return { fix, dit: `the station could not merge \`origin/${base}\` into \`${branche}\` (${miseAJour.etape}): it opened the fix ticket #${fix}, which the ticket waits for` };
}
