// Les essais d'un ticket sur toute sa vie (#4226, règle 12 de
// docs/superpowers/specs/2026-11-24-simplified-process.md) : trois essais au
// total. Un essai compte quand un refus revient de la pass — gates, CI ou
// relecture —, c'est-à-dire chaque renvoi (`brigade:renvoi`, hors conflit avec la
// base, qui a son propre budget) et chaque mise de côté qui le suit.
//
// Le compte se lit dans les commentaires de l'issue, du premier au dernier :
// ni une prise, ni une réécriture du manager, ni un découpage, ni une passe du
// superviseur, ni un redémarrage de la station n'en efface un. Rien d'autre ne le
// tient, aucune mémoire de station, aucun fichier d'état : il ne se reconstruit pas.
//
// Au troisième refus, le ticket est mis de côté pour le chef (« parked ») : une
// carte de TODO (`chef-todo`, sorte `blocked`), en un seul commentaire qui dit
// chaque essai et les checks encore rouges. Sa marque porte `tries=<n>` et la
// tête refusée. Rien ne le relance avant que le chef réponde sur le ticket : un
// commentaire de lui après la carte, ou le label retiré (l'app le retire en
// répondant). Sa réponse vaut un essai de plus : le refus suivant le remet de côté.
import { DE_CONFIANCE } from "../alimenter.ts";
import { LABEL_IN_PASS } from "../github-etat/etats.ts";
import { CHEF_TODO, marqueur } from "../github-seul/carte-todo/carte-todo.ts";
import type { GitHub } from "../github.ts";
import { MARQUE_DE_RENVOI, estUnRenvoiPourConflit } from "../qualite-github.ts";

// Trois essais par ticket, au total.
export const ESSAIS_MAX = 3;

type CommentaireLu = { body: string; association: string };

// La marque de la carte de mise de côté : celle d'une carte `blocked`, avec le compte et la tête refusée.
const MARQUE_DE_PARC = /^<!-- brigade:todo kind=blocked tries=(\d+) sha=([0-9a-f]+) -->/;
const marqueDeParc = (essais: number, sha: string) => `${marqueur("blocked").slice(0, -4)} tries=${essais} sha=${sha} -->`;
const deConfiance = (c: CommentaireLu) => DE_CONFIANCE.includes(c.association);

// Le commentaire est-il la carte d'une mise de côté de la station ?
export const estUnParc = (c: CommentaireLu): boolean => deConfiance(c) && MARQUE_DE_PARC.test(c.body);

// Les refus du ticket, du plus ancien au plus récent, sur toute sa vie.
export const ticketRefusals = <C extends CommentaireLu>(commentaires: readonly C[]): C[] =>
  commentaires.filter((c) => estUnParc(c) || (deConfiance(c) && c.body.startsWith(MARQUE_DE_RENVOI) && !estUnRenvoiPourConflit(c.body)));

// Ce qu'un refus a dit, en une ligne : la raison d'un renvoi, ou le dernier essai qu'une carte liste.
function motifDuRefus(corps: string): string {
  if (MARQUE_DE_PARC.test(corps)) return corps.match(/^- Try \d+: (.*)$/gm)?.at(-1)?.replace(/^- Try \d+: /, "") ?? "";
  // La ligne du renvoi, sous sa marque : son étiquette (« Station `A`: sent back to a cook (1/2) »), le premier ` — `,
  // puis la raison entière, qui peut en porter d'autres.
  const ligne = corps.split("\n")[1] ?? "";
  const separateur = ligne.indexOf(" — ");
  return separateur === -1 ? "" : ligne.slice(separateur + 3);
}

// Une réponse du chef : un commentaire du dépôt qui n'est pas de la cuisine (aucune ligne de marque `<!-- brigade:`),
// ou la réponse que l'app pose pour lui (`brigade:reponse`).
const duChef = (c: CommentaireLu) => deConfiance(c) && (c.body.startsWith("<!-- brigade:reponse") || !c.body.split(/\r?\n/).some((ligne) => ligne.trim().startsWith("<!-- brigade:")));

// Le ticket est-il mis de côté ? Oui s'il porte `chef-todo`, que sa dernière carte est celle d'une mise de côté, et que
// le chef n'a pas répondu depuis.
function estParque(labels: readonly string[], commentaires: readonly CommentaireLu[]): boolean {
  if (!labels.includes(CHEF_TODO)) return false;
  const carte = commentaires.findLastIndex((c) => deConfiance(c) && c.body.startsWith("<!-- brigade:todo "));
  if (carte === -1 || !estUnParc(commentaires[carte]!)) return false;
  return !commentaires.slice(carte + 1).some(duChef);
}

// La mise de côté a-t-elle reçu la réponse du chef, son label encore posé ?
const reponduSousLeLabel = (labels: readonly string[], commentaires: readonly CommentaireLu[]) => {
  const carte = commentaires.findLastIndex((c) => deConfiance(c) && c.body.startsWith("<!-- brigade:todo "));
  return labels.includes(CHEF_TODO) && carte !== -1 && estUnParc(commentaires[carte]!) && !estParque(labels, commentaires);
};

// Le texte de la carte : chaque essai, les checks encore rouges, et ce que le chef peut faire.
function corpsDuParc({ ticket, station, sha, essais, rouges, motif }: { ticket: number; station: string; sha: string; essais: readonly string[]; rouges: readonly string[] | { illisibles: string }; motif: string | undefined }): string {
  const rouge = "illisibles" in rouges ? `The checks of its head \`${sha.slice(0, 7)}\` could not be read: ${rouges.illisibles}.` : rouges.length === 0 ? `No check is red on its head \`${sha.slice(0, 7)}\`: the review refused it.` : `Still red on its head \`${sha.slice(0, 7)}\`: ${rouges.join(", ")}.`;
  return [
    marqueDeParc(essais.length, sha),
    `#${ticket} is parked for the chef: its delivery was refused ${essais.length} times, and a ticket gets ${ESSAIS_MAX} tries in total.`,
    "",
    `What was tried (station \`${station}\` refused the last one):`,
    ...essais.map((motif, i) => `- Try ${i + 1}: ${motif}`),
    "",
    rouge,
    ...(motif === undefined ? [] : [motif]),
    "",
    `Nothing relaunches #${ticket} before you answer on this issue. Answer here, and a cook takes it up again with your answer.`,
  ].join("\n");
}

type GitHubDuParc = Pick<GitHub, "commenter" | "labelliser"> & Partial<Pick<GitHub, "issue">> & { commentaires: (numero: number) => Promise<CommentaireLu[]> };

// L'étape de mise de côté, au refus qui épuise les essais : relit l'issue (ses labels, `labels` sans lecture d'issue), et ne fait rien si elle est déjà mise de côté
// — rejouée, par la même station ou une autre, elle ne poste aucun second commentaire. Sinon, pose `chef-todo` puis la
// carte : arrêtée entre les deux, la station laisse le label sans carte de mise de côté, et la reprise écrit la carte.
// `rouges` lit les checks rouges de la tête ; une lecture qui échoue se dit sur la carte, la mise de côté se fait quand même.
// `motif` : la ligne du motif du renvoi (`Send-back reason: …`, #4302), que la carte dit comme un renvoi.
export async function parquer(github: GitHubDuParc, ticket: { number: number; labels: readonly string[] }, { station, sha, raison, rouges, motif }: { station: string; sha: string; raison: string; rouges: () => Promise<string[]>; motif?: string }): Promise<"parque" | "deja" | "absent"> {
  const issue = github.issue === undefined ? { labels: ticket.labels } : await github.issue(ticket.number);
  if (issue === null) return "absent";
  const commentaires = await github.commentaires(ticket.number);
  if (estParque(issue.labels, commentaires)) return "deja";
  const essais = [...ticketRefusals(commentaires).map((c) => motifDuRefus(c.body)), raison.trim().split("\n")[0] ?? ""];
  const lus = await rouges().catch((erreur: unknown) => ({ illisibles: erreur instanceof Error ? erreur.message : String(erreur) }));
  if (!issue.labels.includes(CHEF_TODO)) await github.labelliser(ticket.number, [CHEF_TODO]);
  await github.commenter(ticket.number, corpsDuParc({ ticket: ticket.number, station, sha, essais, rouges: lus, motif }));
  return "parque";
}

type GitHubDuTri = Pick<GitHub, "delabelliser"> & { commentaires: (numero: number) => Promise<CommentaireLu[]> };

// Les tickets du tour qu'une station peut servir : sans ceux mis de côté. Seuls ceux qui portent `chef-todo` hors du pass
// sont relus : la mise de côté retire `in-pass`, et un ticket en pass, que la pass relit, n'est pas pris.
// Une mise de côté que le chef a répondue lève sa carte (`chef-todo` retiré), et le ticket revient à ce tour. Des
// commentaires qui ne se lisent pas, ou un label qui ne se retire pas, le gardent de côté : le tour suivant réessaie.
export async function keepParkedAside<T extends { number: number; labels: string[] }>(tickets: readonly T[], github: GitHubDuTri, avertir: (texte: string) => void): Promise<T[]> {
  const gardes: T[] = [];
  for (const ticket of tickets) {
    if (!ticket.labels.includes(CHEF_TODO) || ticket.labels.includes(LABEL_IN_PASS)) {
      gardes.push(ticket);
      continue;
    }
    try {
      const commentaires = await github.commentaires(ticket.number);
      if (estParque(ticket.labels, commentaires)) continue;
      if (!reponduSousLeLabel(ticket.labels, commentaires)) {
        gardes.push(ticket);
        continue;
      }
      await github.delabelliser(ticket.number, CHEF_TODO);
      gardes.push({ ...ticket, labels: ticket.labels.filter((label) => label !== CHEF_TODO) });
    } catch (erreur) {
      avertir(`brigade : #${ticket.number} carries \`${CHEF_TODO}\` and could not be checked for a parking: it stays aside this tour — ${erreur instanceof Error ? erreur.message : String(erreur)}`);
    }
  }
  return gardes;
}
