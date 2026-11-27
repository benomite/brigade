// Parked sur un projet GitHub (#4129, d'abord WAITING, #3074) : ce qu'un ticket attend — quelqu'un, pour quelque chose,
// jusqu'à une date ou un fait — s'écrit et se relit sur l'issue même, rien dans la box. Le ticket se nomme par son dépôt
// et son numéro (`BOBL-tech/mirrorlab#614`). La cuisine le parque (`poserLAttente`, `mettreEnAttenteGitHub`, que le
// superviseur joue) : le label `parked`, et le commentaire marqué qui dit qui, pour quoi, jusqu'à quand (marque.ts,
// `corpsDuParking`). Ouvert à toute étape : au backlog, en cuisson (`taken`), en pass (`in-pass`) ; ces labels restent,
// et le ticket reprend exactement où il était. Parqué pour le chef, il prend `chef-todo` (et non `parked`) et sa carte :
// il est dans son TODO. Le chef et le second le parquent et le déparquent depuis l'app, sans commande de la box
// (app/src/vue/wait/wait-github.ts, `parquer` ; app/src/actions-github.ts, `deparquer` ; #4262).
// Ce qu'une issue attend se relit dans le dernier commentaire marqué `<!-- brigade:parked … -->` d'un auteur du dépôt :
// tout le monde peut commenter une issue publique. Une issue au label `parked` sans ce commentaire est parquée sans rien
// inventer : la ligne dit que l'issue ne le dit pas.
import { RELANCE_PAR_DEFAUT_MS } from "../attente.ts";
import { CHEF_TODO, estParque, LABEL_PARKED, LABELS_D_AVANT_PARKED } from "../github-etat/etats.ts";
import type { Commentaire, GitHub, IssueOuverte } from "../github.ts";
import { carteEnCours, corpsDeCarte, type Carte } from "../github-seul/carte-todo/carte-todo.ts";
import { GesteRefuse } from "../rail.ts";
import { attenteDeLIssue, corpsDuParking, direJusqua, direRelance, LE_CHEF, MARQUE, type AttenteGitHub, type AttenteMarquee } from "./marque.ts";

// Relue de sa marque sans import lourd (marque.ts) : la lecture du rail de l'app la lit aussi (#3761).
export { attenteDeLIssue, corpsDuParking, direRelance, type AttenteGitHub, type AttenteMarquee };

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

// La carte de TODO d'un ticket parqué pour le chef : ce qu'il attend de lui, et que sa réponse le fait reprendre.
export const carteDuParking = (numero: number, quoi: string): Carte => ({
  sorte: "product-question",
  texte: `#${numero} is parked for the chef: ${quoi}\n\nAnswer on this issue, and the ticket resumes exactly where it was.`,
});

// Parqué pour le chef : `the chef`, `chef`, `le chef`.
export const estLeChef = (qui: string): boolean => /^(?:the |le )?chef$/i.test(qui.trim());

// La ligne d'une issue parquée : qui elle attend, pour quoi, jusqu'à quand, ou que l'issue ne le dit pas.
export const direAttenteGitHub = (attente: AttenteGitHub | null) =>
  attente === null
    ? `carries \`${LABEL_PARKED}\`, but no comment of the repository says who it waits for, for what, or until when`
    : `waits for ${attente.who}: “${attente.what}” — ${direJusqua(attente)}`;

const nommer = ({ depot, numero }: Cible) => `${depot}#${numero}`;

// L'issue ouverte de la cible, ou le refus qui dit ce qui a été trouvé.
async function issueOuverte(github: GitHubDeLAttente, cible: Cible) {
  const issue = await github.issue(cible.numero);
  if (issue === null || issue.pr === true) throw new GesteRefuse(`${nommer(cible)} is not an issue of ${cible.depot}: nothing was written`);
  if (issue.state !== "open") throw new GesteRefuse(`${nommer(cible)} is closed: nothing was written`);
  return issue;
}

// Ce qu'attend une issue parquée, dit pour un refus.
async function dejaParquee(github: GitHubDeLAttente, cible: Cible): Promise<string> {
  return `${nommer(cible)} is already parked — ${direAttenteGitHub(attenteDeLIssue(await github.commentaires(cible.numero)))}`;
}

// Parque l'issue pour sept jours : le label, puis le commentaire marqué — pour le chef, `chef-todo` et sa carte aussi. Ouvert à toute
// étape : les labels de l'étape (`taken`, `in-pass`, `fire`) restent, le ticket reprend où il était. Refuse une issue
// déjà parquée. Le commentaire qui ne part pas retire le label posé : l'issue n'attend pas sans dire quoi.
export async function mettreEnAttenteGitHub(github: GitHubDeLAttente, cible: Cible, { quoi, qui }: { quoi: string; qui: string }, maintenant: Date): Promise<AttenteGitHub> {
  const what = quoi.trim();
  const who = qui.trim();
  if (what === "") throw new GesteRefuse("a ticket is not parked without saying for what: what it waits for, in your words");
  if (who === "") throw new GesteRefuse("a ticket is not parked without saying who it waits for: the chef, the client, a team, a person");
  const attente: AttenteGitHub = { what, who: estLeChef(who) ? LE_CHEF : who, followUp: new Date(maintenant.getTime() + RELANCE_PAR_DEFAUT_MS).toISOString() };
  const issue = await issueOuverte(github, cible);
  // Une carte du chef (`chef-todo`) se parque pour un autre, comme le bouton de l'app : elle prend `parked` et quitte
  // TODO ; reprise, elle y revient. Déjà parquée pour un autre, ou parquée pour le chef une seconde fois : refusé.
  if (issue.labels.includes(LABEL_PARKED) || (issue.labels.includes(CHEF_TODO) && attente.who === LE_CHEF)) throw new GesteRefuse(`${await dejaParquee(github, cible)}: nothing was written`);
  await poserLAttente(github, cible.numero, corpsDuParking(attente), nommer(cible), "repeat the command", [attente.who === LE_CHEF ? CHEF_TODO : LABEL_PARKED]);
  // Parqué pour le chef, sa carte le suit : l'app la lit, avec son champ de réponse, comme toute carte de TODO.
  if (attente.who === LE_CHEF) await github.commenter(cible.numero, corpsDeCarte(carteDuParking(cible.numero, what)));
  return attente;
}

// Le geste même du parking, du chef comme de la cuisine : le label, puis le commentaire. Le commentaire qui ne part pas
// retire les labels posés : l'issue n'attend pas sans dire quoi. `reprendre` : ce que l'erreur dit de faire ensuite.
// `labels` : `parked`, et `chef-todo` pour le chef.
export async function poserLAttente(github: Pick<GitHub, "labelliser" | "delabelliser" | "commenter">, numero: number, corps: string, nom: string, reprendre: string, labels: readonly string[] = [LABEL_PARKED]): Promise<void> {
  await github.labelliser(numero, [...labels]);
  try {
    await github.commenter(numero, corps);
  } catch (erreur) {
    const raison = erreur instanceof Error ? erreur.message : String(erreur);
    try {
      for (const label of [...labels].reverse()) await github.delabelliser(numero, label);
    } catch {
      throw new Error(`the comment was not posted on ${nom} (${raison}), and \`${LABEL_PARKED}\` could not be removed: remove it by hand, then ${reprendre}`);
    }
    throw new Error(`the comment was not posted on ${nom} (${raison}): \`${LABEL_PARKED}\` was removed, nothing waits — ${reprendre}`);
  }
}

// Une carte lue de GitHub : son issue, son titre, et ce qu'elle dit. Une carte
// de TODO dit aussi ce qui lui manque pour poser sa question au chef
// (`manque`), nul quand elle la pose : le défaut que la station dépose sur la
// brigade (signalement-carte-sans-question.ts, #3134).
export type CarteGitHub = { numero: number; titre: string; ligne: string };
export type CarteDeTodoGitHub = CarteGitHub & { manque: string | null };
export type CartesGitHub = { todo: CarteDeTodoGitHub[]; parked: Array<CarteGitHub & { attente: AttenteGitHub | null }> };

// Les cartes de ces issues-là : les tickets que le tour de la station vient de lire (guerison/index.ts).
export async function cartesDesIssues(github: { commentaires(numero: number): Promise<Pick<Commentaire, "body" | "association">[]> }, issues: readonly Pick<IssueOuverte, "number" | "title" | "labels">[]): Promise<CartesGitHub> {
  const cartes: CartesGitHub = { todo: [], parked: [] };
  const lues = await Promise.all(issues.filter(({ labels }) => estParque(labels)).map(async (issue) => ({ issue, commentaires: await github.commentaires(issue.number) })));
  for (const { issue, commentaires } of lues.sort((a, b) => a.issue.number - b.issue.number)) {
    const { number: numero, title: titre, labels } = issue;
    // `parked` : il attend quelqu'un d'autre que le chef — une carte du chef parquée pour un autre comprise.
    if (labels.includes(LABEL_PARKED)) {
      const attente = attenteDeLIssue(commentaires);
      cartes.parked.push({ numero, titre, ligne: direAttenteGitHub(attente), attente });
      continue;
    }
    const carte = carteEnCours(labels, commentaires);
    // Parqué pour le chef par le superviseur, sans carte d'une sorte : sa marque dit ce qu'il attend de lui.
    const marque = carte === null ? attenteDeLIssue(commentaires) : null;
    const ligne =
      carte !== null
        ? (carte.texte.split("\n")[0] ?? "")
        : !labels.includes(CHEF_TODO)
          ? `parked by a waiting label of before parked: ${LABELS_D_AVANT_PARKED.filter((label) => labels.includes(label)).map((label) => `\`${label}\``).join(", ")}`
          : marque !== null
            ? `waits for ${LE_CHEF}: “${marque.what}”`
            : `carries \`${CHEF_TODO}\`, but no marked comment says what it asks`;
    // Une carte posée (`chef-todo`) sans commentaire marqué, ou dont le commentaire marqué n'a pas de texte, ne pose
    // aucune question : la question est la première ligne de son texte, comme l'app la lit (app/src/board/todo-github.ts).
    const manque = !labels.includes(CHEF_TODO)
      ? null
      : carte === null
        ? marque !== null
          ? null
          : `no comment marked \`<!-- brigade:todo kind=… -->\` or \`${MARQUE} … -->\` from the repository says what it asks`
        : carte.texte === ""
          ? `its marked comment (\`kind=${carte.sorte}\`) has no text: no question is written`
          : null;
    cartes.todo.push({ numero, titre, ligne, manque });
  }
  return cartes;
}
