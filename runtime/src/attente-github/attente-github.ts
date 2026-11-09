// WAITING sur un projet GitHub seul (#3074, épique #3073) : les gestes de #591
// — mettre un ticket en attente d'un tiers, le reprendre, « c'est arrivé, on
// repart » — sur une carte que la station lit de GitHub, et non du journal.
// Le ticket se nomme par son dépôt et son numéro (`BOBL-tech/mirrorlab#614`),
// et chaque geste s'écrit sur l'issue même, rien dans la box :
//   - `waiting set <dépôt>#<n> --what … --from … [--remind …]` : le label
//     `waiting`, et un commentaire qui dit quoi, de qui, jusqu'à quand — dans
//     sept jours, sans `--remind`. Une issue qui porte déjà `waiting` n'est pas
//     touchée : la commande dit ce qu'elle y a trouvé ;
//   - `waiting resume <dépôt>#<n>` : le label retiré — la carte qu'elle porte
//     encore (`chef-todo`, `blocked-on-human`) revient dans TODO ;
//   - `waiting arrived <dépôt>#<n>` : le ticket repart en cuisine sans repasser
//     par TODO, comme `cestArrive` le fait d'un ticket du rail (attente.ts) :
//     `waiting` retiré avec ce qui le tient hors de la cuisine (`chef-todo`,
//     `blocked-on-human`, `served-elsewhere`), `fire` posé s'il manque, et un
//     commentaire qui dit que ce qu'il attendait est arrivé ;
//   - `waiting <dépôt>` : les cartes du projet lues de GitHub — TODO, ce qui
//     attend le chef (`chef-todo`, `blocked-on-human`, comme la retenue les lit,
//     retenue/tour.ts), et WAITING, ce qui attend un tiers, avec ses trois mots.
// Ce qu'une issue attend se relit dans le dernier commentaire marqué
// `<!-- brigade:waiting … -->` d'un auteur du dépôt : tout le monde peut
// commenter une issue publique. Une issue au label `waiting` sans ce
// commentaire — posé à la main, ou par la station pour un ticket de `fix`
// (github-seul/renvois/renvois.ts) — est en WAITING sans rien inventer : la
// ligne dit que l'issue ne le dit pas.
import { DE_CONFIANCE } from "../alimenter.ts";
import { lireRelance, RELANCE_PAR_DEFAUT_MS } from "../attente.ts";
import { A_LA_MAIN } from "../brigade-github.ts";
import { LABEL_IN_PASS, LABEL_TAKEN, LABEL_WAITING } from "../github-etat/etats.ts";
import { HORS_CUISINE, LABEL, type Commentaire, type GitHub } from "../github.ts";
import { carteEnCours, CHEF_TODO } from "../github-seul/carte-todo/carte-todo.ts";
import { GesteRefuse } from "../rail.ts";

// Ce que les gestes demandent au client de GitHub, et rien de plus.
export type GitHubDeLAttente = Pick<GitHub, "issue" | "commentaires" | "commenter" | "labelliser" | "delabelliser" | "ouvertes">;

// Un ticket d'un projet GitHub seul : son dépôt et son numéro d'issue.
export type Cible = { depot: string; numero: number };

const DEPOT = "[A-Za-z0-9](?:[A-Za-z0-9-]*[A-Za-z0-9])?/[A-Za-z0-9._-]+";

// `BOBL-tech/mirrorlab#614`, ou null si le mot n'a pas cette forme.
export function lireCible(mot: string | undefined): Cible | null {
  const lu = new RegExp(`^(${DEPOT})#([1-9][0-9]*)$`).exec(mot ?? "");
  return lu === null ? null : { depot: lu[1] as string, numero: Number(lu[2]) };
}

// `BOBL-tech/mirrorlab`, ou null.
export const lireDepot = (mot: string | undefined): string | null => (new RegExp(`^${DEPOT}$`).test(mot ?? "") ? (mot as string) : null);

// Ce qu'un ticket attend : quoi, de qui, et la relance (ISO).
export type AttenteGitHub = { what: string; who: string; followUp: string };

const MARQUE = "<!-- brigade:waiting";
const MARQUE_LUE = /^<!-- brigade:waiting (\{.*?\}) -->/;

// La relance, dite avec son année : `2026-11-16 15:05 UTC`.
export const direRelance = (iso: string) => `${iso.slice(0, 10)} ${iso.slice(11, 16)} UTC`;

// Le commentaire posé à la mise en attente : la marque, que `attenteDeLIssue`
// relit, puis les trois mots du chef. Dans la marque, `>` s'échappe : un `-->`
// de ses mots ne la fermerait pas.
export function corpsDeLAttente(attente: AttenteGitHub): string {
  const marque = JSON.stringify(attente).replace(/>/g, "\\u003e");
  return [
    `${MARQUE} ${marque} -->`,
    `**WAITING: awaiting ${attente.who}.** ${attente.what}`,
    "",
    `- **what**: ${attente.what}`,
    `- **from whom**: ${attente.who}`,
    `- **follow-up**: ${direRelance(attente.followUp)}`,
    "",
    `As long as it has the \`${LABEL_WAITING}\` label, no station takes it and it is not in TODO.`,
  ].join("\n");
}

// Ce qu'attend l'issue, d'après le plus récent commentaire marqué d'un auteur
// du dépôt ; null si aucun ne se lit.
export function attenteDeLIssue(commentaires: readonly Pick<Commentaire, "body" | "association">[]): AttenteGitHub | null {
  for (const { body, association } of [...commentaires].reverse()) {
    if (!DE_CONFIANCE.includes(association)) continue;
    const brut = MARQUE_LUE.exec(body)?.[1];
    if (brut === undefined) continue;
    try {
      const { what, who, followUp } = JSON.parse(brut) as Record<string, unknown>;
      if (typeof what === "string" && typeof who === "string" && typeof followUp === "string" && !Number.isNaN(Date.parse(followUp))) return { what, who, followUp };
    } catch {
      // Une marque illisible ne dit rien : la précédente, s'il y en a une.
    }
  }
  return null;
}

// La ligne de WAITING d'une issue : ce qu'elle attend, ou que l'issue ne le dit pas.
export const direAttenteGitHub = (attente: AttenteGitHub | null) =>
  attente === null
    ? `carries \`${LABEL_WAITING}\`, but no comment of the repository says what it waits for, from whom, or until when`
    : `awaiting ${attente.who}: “${attente.what}” — follow-up on ${direRelance(attente.followUp)}`;

const nommer = ({ depot, numero }: Cible) => `${depot}#${numero}`;

// L'issue ouverte de la cible, ou le refus qui dit ce qui a été trouvé.
async function issueOuverte(github: GitHubDeLAttente, cible: Cible) {
  const issue = await github.issue(cible.numero);
  if (issue === null || issue.pr === true) throw new GesteRefuse(`${nommer(cible)} is not an issue of ${cible.depot}: nothing was written`);
  if (issue.state !== "open") throw new GesteRefuse(`${nommer(cible)} is closed: nothing was written`);
  return issue;
}

// Ce qu'attend une issue qui porte `waiting`, dit pour un refus.
async function dejaEnAttente(github: GitHubDeLAttente, cible: Cible): Promise<string> {
  return `${nommer(cible)} is already waiting — ${direAttenteGitHub(attenteDeLIssue(await github.commentaires(cible.numero)))}`;
}

// Met l'issue en WAITING : le label, puis le commentaire. Refuse une issue qui
// attend déjà, ou qu'un cook tient. Le commentaire qui ne part pas retire le
// label posé : l'issue n'attend pas sans dire quoi.
export async function mettreEnAttenteGitHub(github: GitHubDeLAttente, cible: Cible, { quoi, qui, relance }: { quoi: string; qui: string; relance?: string }, maintenant: Date): Promise<AttenteGitHub> {
  const what = quoi.trim();
  const who = qui.trim();
  if (what === "") throw new GesteRefuse("a ticket does not wait without saying what: what it waits for, in your words");
  if (who === "") throw new GesteRefuse("a ticket does not wait without saying who: the client, a team, a person");
  const followUp = (relance === undefined ? new Date(maintenant.getTime() + RELANCE_PAR_DEFAUT_MS) : lireRelance(relance, maintenant)).toISOString();
  const issue = await issueOuverte(github, cible);
  if (issue.labels.includes(LABEL_WAITING)) throw new GesteRefuse(`${await dejaEnAttente(github, cible)}: nothing was written`);
  const tenu = [LABEL_TAKEN, LABEL_IN_PASS].find((label) => issue.labels.includes(label));
  if (tenu !== undefined) throw new GesteRefuse(`${nommer(cible)} carries \`${tenu}\`: the kitchen holds it — set the wait once it leaves; nothing was written`);
  const attente = { what, who, followUp };
  await github.labelliser(cible.numero, [LABEL_WAITING]);
  try {
    await github.commenter(cible.numero, corpsDeLAttente(attente));
  } catch (erreur) {
    const raison = erreur instanceof Error ? erreur.message : String(erreur);
    try {
      await github.delabelliser(cible.numero, LABEL_WAITING);
    } catch {
      throw new Error(`the comment was not posted on ${nommer(cible)} (${raison}), and \`${LABEL_WAITING}\` could not be removed: remove it by hand, then run the command again`);
    }
    throw new Error(`the comment was not posted on ${nommer(cible)} (${raison}): \`${LABEL_WAITING}\` was removed, nothing waits — run the command again`);
  }
  return attente;
}

// L'issue qui doit attendre pour être reprise, et ce qu'elle attend.
async function exigerWaiting(github: GitHubDeLAttente, cible: Cible) {
  const issue = await issueOuverte(github, cible);
  if (!issue.labels.includes(LABEL_WAITING)) throw new GesteRefuse(`${nommer(cible)} is not waiting for a third party — it does not carry \`${LABEL_WAITING}\`; nothing was written`);
  return { issue, attente: attenteDeLIssue(await github.commentaires(cible.numero)) };
}

const ceQuIlAttendait = (attente: AttenteGitHub | null) => (attente === null ? "" : ` ${attente.who} (“${attente.what}”)`);

// « Reprendre » : `waiting` retiré, et un commentaire qui le dit. La carte que
// l'issue porte encore revient dans TODO.
export async function reprendreGitHub(github: GitHubDeLAttente, cible: Cible): Promise<void> {
  const { attente } = await exigerWaiting(github, cible);
  await github.delabelliser(cible.numero, LABEL_WAITING);
  await github.commenter(cible.numero, `**WAITING lifted** — resumed by the chef: no longer awaiting${ceQuIlAttendait(attente)}. The \`${LABEL_WAITING}\` label is removed.`);
}

// Ce qui, sur l'issue, tient un ticket hors de la cuisine : TODO et la mise de côté.
const HORS_DE_LA_CUISINE = [CHEF_TODO, A_LA_MAIN, HORS_CUISINE];

// « C'est arrivé, on repart » : le ticket repart en cuisine sans repasser par
// TODO. `fire` d'abord, puis les labels retirés, `waiting` en dernier : une
// panne en chemin le laisse en WAITING, jamais dans TODO. Rend les labels retirés.
export async function cestArriveGitHub(github: GitHubDeLAttente, cible: Cible): Promise<string[]> {
  const { issue, attente } = await exigerWaiting(github, cible);
  if (!issue.labels.includes(LABEL)) await github.labelliser(cible.numero, [LABEL]);
  const retires = HORS_DE_LA_CUISINE.filter((label) => issue.labels.includes(label));
  for (const label of retires) await github.delabelliser(cible.numero, label);
  await github.delabelliser(cible.numero, LABEL_WAITING);
  await github.commenter(cible.numero, `**WAITING lifted — it arrived**: what this ticket was awaiting${ceQuIlAttendait(attente)} has arrived. It goes back to the kitchen: a station takes it in turn. The \`${LABEL_WAITING}\` label is removed.`);
  return [...retires, LABEL_WAITING];
}

// Une carte lue de GitHub : son issue, son titre, et ce qu'elle dit.
export type CarteGitHub = { numero: number; titre: string; ligne: string };
export type CartesGitHub = { todo: CarteGitHub[]; waiting: Array<CarteGitHub & { attente: AttenteGitHub | null }> };

// Les cartes du projet, lues des issues ouvertes : WAITING, celles au label
// `waiting` — il l'emporte, comme dans l'état lu de GitHub (github-etat/etats.ts) ;
// TODO, celles qui attendent le chef, `chef-todo` ou `blocked-on-human`.
export async function lireCartesGitHub(github: GitHubDeLAttente): Promise<CartesGitHub> {
  const sondage = await github.ouvertes();
  if (sondage.inchange) throw new Error("GitHub did not return the list of open issues");
  const cartes: CartesGitHub = { todo: [], waiting: [] };
  const lues = await Promise.all(
    sondage.issues
      .filter(({ labels }) => [LABEL_WAITING, CHEF_TODO, A_LA_MAIN].some((label) => labels.includes(label)))
      .map(async (issue) => ({ issue, commentaires: await github.commentaires(issue.number) })),
  );
  for (const { issue, commentaires } of lues.sort((a, b) => a.issue.number - b.issue.number)) {
    const { number: numero, title: titre, labels } = issue;
    if (labels.includes(LABEL_WAITING)) {
      const attente = attenteDeLIssue(commentaires);
      cartes.waiting.push({ numero, titre, ligne: direAttenteGitHub(attente), attente });
      continue;
    }
    const carte = carteEnCours(labels, commentaires);
    const ligne = carte !== null ? (carte.texte.split("\n")[0] ?? "") : labels.includes(A_LA_MAIN) ? `held back, it carries \`${A_LA_MAIN}\`` : `carries \`${CHEF_TODO}\`, but no marked comment says what it asks`;
    cartes.todo.push({ numero, titre, ligne });
  }
  return cartes;
}
