// Les cartes de TODO du chef, quand GitHub est le seul état de la cuisine
// (épique #2209, ticket #2217). L'ancien chemin les tenait dans `carte-todo/`
// (ticket bloqué, merge à la main, question produit, ticket abandonné #2118) ;
// ici, chaque carte est un fait de GitHub sur l'issue du ticket :
// - le label `chef-todo`, que l'issue porte tant que la carte attend le chef ;
// - un commentaire qui commence par `<!-- brigade:todo kind=<sorte> -->`, puis
//   le texte de la carte, à lire par un humain.
// La carte d'une issue est son plus récent commentaire de carte, tant qu'elle
// porte le label. Lever la carte, c'est retirer le label : le commentaire reste,
// comme trace. L'app lit cette convention (#2221) : elle ne change pas.
//
// Poser une carte n'en double aucune : la même situation vue deux fois — de
// tour en tour, ou par deux stations — trouve sa carte déjà posée et n'écrit
// rien. Le label se pose avant le commentaire : une station qui s'arrête entre
// les deux laisse le label sans la carte de sa sorte, et la prochaine pose
// écrit le commentaire qui manque. Dans l'autre ordre, elle laisserait un
// commentaire sans label, que la pose suivante ne saurait distinguer d'une
// carte levée, et doublerait.
import { DE_CONFIANCE } from "../../alimenter.ts";
import type { GitHub } from "../../github.ts";

// Le label d'une issue dont une carte attend le chef.
export const CHEF_TODO = "chef-todo";

// Les sortes de carte, telles que le marqueur les écrit.
export const SORTES = ["blocked", "merge-by-hand", "product-question", "abandoned"] as const;
export type Sorte = (typeof SORTES)[number];

const MARQUE = /^<!-- brigade:todo kind=([a-z-]+) -->/;
const estSorte = (mot: string): mot is Sorte => (SORTES as readonly string[]).includes(mot);

export const marqueur = (sorte: Sorte) => `<!-- brigade:todo kind=${sorte} -->`;

// Une carte : sa sorte, et ce qu'elle dit au chef.
export type Carte = { sorte: Sorte; texte: string };

// Le commentaire d'une carte : le marqueur, puis le texte.
export const corpsDeCarte = ({ sorte, texte }: Carte) => `${marqueur(sorte)}\n${texte}`;

// Ce que les cartes demandent au client de GitHub, et rien de plus.
export type GitHubDesCartes = Pick<GitHub, "issue" | "commentaires" | "commenter" | "labelliser" | "delabelliser">;

type CommentaireLu = { body: string; association: string };

// La carte qu'un commentaire porte, ou nulle : tout le monde peut commenter une
// issue publique, seul le dépôt pose les cartes.
function carteDuCommentaire({ body, association }: CommentaireLu): Carte | null {
  if (!DE_CONFIANCE.includes(association)) return null;
  const sorte = MARQUE.exec(body)?.[1];
  if (sorte === undefined || !estSorte(sorte)) return null;
  return { sorte, texte: body.slice(marqueur(sorte).length).trim() };
}

// La carte qui attend le chef, d'après les labels et les commentaires de
// l'issue (du plus ancien au plus récent) : la plus récente, si l'issue porte
// `chef-todo` ; nulle sinon, ou si aucun commentaire de carte ne la dit encore.
export function carteEnCours(labels: string[], commentaires: CommentaireLu[]): Carte | null {
  if (!labels.includes(CHEF_TODO)) return null;
  for (const commentaire of [...commentaires].reverse()) {
    const carte = carteDuCommentaire(commentaire);
    if (carte !== null) return carte;
  }
  return null;
}

// La carte de l'issue, relue sur GitHub ; nulle si l'issue n'existe plus.
export async function lireCarte(numero: number, github: Pick<GitHub, "issue" | "commentaires">): Promise<Carte | null> {
  const issue = await github.issue(numero);
  if (issue === null) return null;
  return carteEnCours(issue.labels, await github.commentaires(numero));
}

// Ce qu'une pose a fait : `posee`, la carte est écrite ; `deja`, la même sorte
// attendait déjà le chef, rien n'est écrit ; `absente`, l'issue n'existe plus.
export type Pose = "posee" | "deja" | "absente";

// Pose la carte sur l'issue, relue d'abord : si une carte de la même sorte
// l'attend déjà, n'écrit rien. Une carte d'une autre sorte qui attend est
// remplacée par celle-ci, qui devient la plus récente.
export async function poserCarte(numero: number, carte: Carte, github: GitHubDesCartes): Promise<Pose> {
  if (!estSorte(carte.sorte)) throw new Error(`unknown TODO card kind: ${JSON.stringify(carte.sorte)}`);
  const texte = carte.texte.trim();
  if (texte === "") throw new Error(`TODO card of kind ${carte.sorte} with no text: a card tells the chef what happens`);
  const issue = await github.issue(numero);
  if (issue === null) return "absente";
  const tient = issue.labels.includes(CHEF_TODO);
  if (tient && carteEnCours(issue.labels, await github.commentaires(numero))?.sorte === carte.sorte) return "deja";
  if (!tient) await github.labelliser(numero, [CHEF_TODO]);
  await github.commenter(numero, corpsDeCarte({ sorte: carte.sorte, texte }));
  return "posee";
}

// Lève la carte de l'issue quand sa situation est résolue : retire
// `chef-todo`. Avec une sorte, ne lève que la carte de cette sorte — une autre
// situation, qui attend toujours le chef, garde la sienne. Rend vrai si le
// label est retiré.
export async function leverCarte(numero: number, github: GitHubDesCartes, sorte?: Sorte): Promise<boolean> {
  const issue = await github.issue(numero);
  if (issue === null || !issue.labels.includes(CHEF_TODO)) return false;
  if (sorte !== undefined && carteEnCours(issue.labels, await github.commentaires(numero))?.sorte !== sorte) return false;
  await github.delabelliser(numero, CHEF_TODO);
  return true;
}

// Les textes des quatre sortes : ce qui se passe, puis ce que le chef peut
// faire. `pourquoi` est le motif que la cuisine connaît, tel quel.
const motif = (pourquoi: string) => pourquoi.trim().replace(/[.\s]+$/, "");

// Un ticket dont le cook s'est arrêté, faute d'une décision ou d'une condition.
export const carteBloque = (ticket: number, pourquoi: string): Carte => ({
  sorte: "blocked",
  texte: `The cook of #${ticket} is blocked: ${motif(pourquoi)}.\n\nAnswer on this issue, and the kitchen takes #${ticket} up again with your answer.`,
});

// Une livraison verte que la cuisine ne merge pas elle-même.
export const carteMergeALaMain = (ticket: number, pr: string | null, pourquoi: string): Carte => ({
  sorte: "merge-by-hand",
  texte: `The delivery of #${ticket} is green, but the kitchen does not merge it: ${motif(pourquoi)}.\n\nMerge ${pr ?? "its PR"} by hand, or send it back to a cook with your answer on this issue.`,
});

// Une question produit que la cuisine pose au chef avant d'aller plus loin.
export const carteQuestionProduit = (ticket: number, question: string): Carte => ({
  sorte: "product-question",
  texte: `The kitchen has a product question on #${ticket}:\n\n> ${question.trim().split("\n").join("\n> ")}\n\nAnswer on this issue, and the kitchen goes on with your answer.`,
});

// Un ticket que la cuisine a sorti du rail sans le servir (#2118).
export const carteAbandon = (ticket: number, pourquoi: string): Carte => ({
  sorte: "abandoned",
  texte: `The kitchen took #${ticket} off the rail without serving it: ${motif(pourquoi)}.\n\nPut it back on the rail, take it in a dev session, or close it.`,
});
