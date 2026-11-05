// La base rouge dans TODO (#2341, épique #2335). Un ticket de réparation ouvert
// par la pass (`ouvre-reparation.ts`) porte la marque cachée
// `<!-- brigade:base-rouge sha=<commit rouge> -->` : seule cette marque le
// désigne ici, sur le dépôt de n'importe quel projet.
//
// - Sa réparation cuit : une ligne qui dit que la base est rouge et qu'une
//   réparation cuit. Elle ne demande rien au chef : elle va dans la part de TODO
//   qui informe, pas dans celle qui attend un geste.
// - Sa réparation a échoué et pose une question au chef — le ticket attend le
//   chef (`blocked-on-human`), ou sa dernière carte marquée est une question
//   (`chef-todo`, ou `hors-cuisine` avec une `product-question`) : le ticket est
//   une entrée pour le chef, avec la raison de l'échec, dans la forme d'une
//   carte (`sorte`, `texte`) que la vue pose telle quelle.
// - Sa réparation a échoué sans question pour le chef — sortie de la cuisine
//   (`hors-cuisine`) par ses cooks sans livraison ou ses renvois, ou `chef-todo`
//   sans carte lisible : c'est le travail du second (#2455). Une carte de TODO
//   pose une question au chef ou n'y est pas : le ticket n'y entre pas, et
//   `pourLeSecond` dit pourquoi.
// - Fermé (base verte), ou sans marque : rien. Sans ticket marqué, TODO reste
//   ce qu'il était.
//
// Le module ne lit que ce qu'on lui donne : les issues ouvertes avec leurs
// commentaires. Une marque n'est crue que d'un auteur de confiance.
import { DE_CONFIANCE } from "../alimenter.ts";
import { A_LA_MAIN } from "../brigade-github.ts";
import { CHEF_TODO } from "../github-seul/carte-todo/carte-todo.ts";
import { HORS_CUISINE, type Commentaire, type Issue } from "../github.ts";
import type { LigneDeLaFile, Tableau } from "../tableau/rendu/bloc.ts";
import { shaDeBaseRouge } from "./ouvre-reparation.ts";

export type CommentaireDeReparation = { body: string; association: string };
export type IssueDeReparation = {
  number: number;
  title: string;
  state: "open" | "closed";
  labels: string[];
  body: string;
  association: string;
  createdAt: string;
  commentaires: CommentaireDeReparation[];
};

// Une base rouge dont la réparation cuit : ce que TODO dit, sans rien demander.
export type ReparationEnCours = { ticket: number; sha: string; ligne: string };
// Une réparation échouée : une entrée pour le chef, avec pourquoi.
export type ReparationEchouee = { ticket: number; titre: string; sha: string; sorte: "base-rouge"; texte: string; depuis: string };
// Une réparation échouée qui ne pose aucune question au chef : le second la reprend.
export type ReparationDuSecond = { ticket: number; sha: string; pourquoi: string };
export type BaseRougeDuTodo = { enCours: ReparationEnCours[]; pourLeChef: ReparationEchouee[]; pourLeSecond: ReparationDuSecond[] };

const MARQUE_DE_CARTE = /^\s*<!--\s*brigade:todo\s+kind=[A-Za-z0-9_-]+\s*-->\s*([\s\S]*)$/;
const MARQUE_D_ECHEC_OU_RENVOI = /^\s*<!--\s*brigade:(?:echec|renvoi)\b[^>]*-->\s*([\s\S]*)$/;

const court = (sha: string) => sha.slice(0, 7);

// Pourquoi la réparation a échoué : le dernier mot de la cuisine sur l'issue —
// la carte posée au chef, sinon l'échec ou le renvoi qu'elle a consigné —, ou, à
// défaut, le label qui l'a sortie de la cuisine.
function raisonDeLEchec(issue: IssueDeReparation): string {
  const dignes = issue.commentaires.filter(({ association }) => DE_CONFIANCE.includes(association));
  for (const { body } of [...dignes].reverse()) {
    const lu = MARQUE_DE_CARTE.exec(body) ?? MARQUE_D_ECHEC_OU_RENVOI.exec(body);
    const texte = lu?.[1]?.trim();
    if (texte) return texte;
  }
  if (issue.labels.includes(HORS_CUISINE)) return `the repair left the kitchen (\`${HORS_CUISINE}\`): the cook gave up or was refused`;
  return "the repair is marked as needing the chef";
}

const echouee = (labels: string[]) => [HORS_CUISINE, A_LA_MAIN, CHEF_TODO].some((label) => labels.includes(label));

const MARQUE_DE_QUESTION = /^\s*<!--\s*brigade:todo\s+kind=([A-Za-z0-9_-]+)\s*-->\s*([\s\S]*)$/;
const QUESTION_PRODUIT = "product-question";

// La question que cette réparation échouée pose au chef : le texte de sa dernière
// carte marquée d'un auteur de confiance, si elle en est une — toute sorte pour
// `chef-todo`, une `product-question` pour `hors-cuisine` seul. Nulle sinon, et
// aussi sans texte : une carte sans question n'est pas montrée.
function questionAuChef(issue: IssueDeReparation): string | null {
  const dignes = issue.commentaires.filter(({ association }) => DE_CONFIANCE.includes(association));
  for (const { body } of [...dignes].reverse()) {
    const lu = MARQUE_DE_QUESTION.exec(body);
    if (lu === null) continue;
    const texte = (lu[2] ?? "").trim();
    if (texte === "") return null;
    return issue.labels.includes(CHEF_TODO) || lu[1] === QUESTION_PRODUIT ? texte : null;
  }
  return null;
}

// Une réparation échouée entre dans TODO si le ticket attend le chef à la main
// (`blocked-on-human`) ou s'il porte une question lisible pour lui.
const poseUneQuestion = (issue: IssueDeReparation) => issue.labels.includes(A_LA_MAIN) || questionAuChef(issue) !== null;

export function baseRougeDuTodo(issues: readonly IssueDeReparation[]): BaseRougeDuTodo {
  const resultat: BaseRougeDuTodo = { enCours: [], pourLeChef: [], pourLeSecond: [] };
  for (const issue of issues) {
    if (issue.state !== "open" || !DE_CONFIANCE.includes(issue.association)) continue;
    const sha = shaDeBaseRouge(issue.body);
    if (sha === null) continue;
    if (echouee(issue.labels)) {
      if (!poseUneQuestion(issue)) {
        const pourquoi = issue.labels.includes(CHEF_TODO) ? "it carries `chef-todo` but no readable card: its marked comment is missing or empty" : raisonDeLEchec(issue);
        resultat.pourLeSecond.push({ ticket: issue.number, sha, pourquoi });
        continue;
      }
      resultat.pourLeChef.push({
        ticket: issue.number,
        titre: issue.title,
        sha,
        sorte: "base-rouge",
        depuis: issue.createdAt,
        texte: `The base is red at ${court(sha)} and its repair #${issue.number} failed — it needs you. Why: ${questionAuChef(issue) ?? raisonDeLEchec(issue)}`,
      });
    } else {
      resultat.enCours.push({ ticket: issue.number, sha, ligne: `The base is red at ${court(sha)}: a repair is cooking (#${issue.number}).` });
    }
  }
  return resultat;
}

// Ce que le projet sert à la lecture : ses issues ouvertes, chacune avec ses
// commentaires. Une lecture qui échoue ne dit pas « base verte » : elle lève.
export type GitHubDuTodoBaseRouge = {
  issuesOuvertes(): Promise<Omit<IssueDeReparation, "commentaires">[]>;
  commentaires(numero: number): Promise<CommentaireDeReparation[]>;
};

export async function lireLaBaseRouge(github: GitHubDuTodoBaseRouge): Promise<BaseRougeDuTodo> {
  const marquees = (await github.issuesOuvertes()).filter(({ body }) => shaDeBaseRouge(body) !== null);
  const issues = await Promise.all(marquees.map(async (issue) => ({ ...issue, commentaires: echouee(issue.labels) ? await github.commentaires(issue.number) : [] })));
  return baseRougeDuTodo(issues);
}

// Les issues ouvertes que le tableau a déjà lues (`ouvertesDuDepot`, une par
// tick et par projet) : le corps et l'auteur y sont, les commentaires se lisent
// pour les seules réparations échouées, et une fois par état de l'issue
// (`cache`, clé : son numéro et son `updatedAt`). Aucune seconde lecture des
// issues ouvertes.
export type CacheDesCommentaires = Map<string, CommentaireDeReparation[]>;

export async function baseRougeDesOuvertes(
  ouvertes: readonly Issue[],
  commentaires: (numero: number) => Promise<Commentaire[]>,
  cache: CacheDesCommentaires = new Map(),
): Promise<BaseRougeDuTodo> {
  const lues = ouvertes.filter((issue) => !issue.pr).map((issue) => {
    const { body = "", association = "NONE" } = issue as Issue & { body?: string; association?: string };
    return { number: issue.number, title: issue.title, state: issue.state, labels: issue.labels, body, association, createdAt: issue.createdAt, updatedAt: issue.updatedAt };
  });
  const github: GitHubDuTodoBaseRouge = {
    issuesOuvertes: async () => lues,
    commentaires: async (numero) => {
      const cle = `${numero}@${lues.find(({ number }) => number === numero)?.updatedAt}`;
      const connus = cache.get(cle);
      if (connus !== undefined) return connus;
      const lus = (await commentaires(numero)).map(({ body, association }) => ({ body, association }));
      cache.set(cle, lus);
      return lus;
    },
  };
  return lireLaBaseRouge(github);
}

// TODO du tableau avec la base rouge : la ligne « une réparation cuit » va
// avec les bilans, que le chef lit sans rien avoir à faire ; la réparation
// échouée entre dans sa file, avec la raison — sauf si sa carte y est déjà.
// Sans ticket marqué, le tableau rendu est le même objet.
export function avecLaBaseRouge(tableau: Tableau, base: BaseRougeDuTodo): Tableau {
  const dejaLa = new Set(tableau.file.flatMap(({ ticket }) => (ticket === null ? [] : [ticket])));
  const echouees = base.pourLeChef.filter(({ ticket }) => !dejaLa.has(ticket));
  if (base.enCours.length === 0 && echouees.length === 0 && base.pourLeSecond.length === 0) return tableau;
  const lignes: LigneDeLaFile[] = echouees.map(({ ticket, titre, texte, depuis }) => ({ nom: `#${ticket}`, ticket, titre, quoi: "base-rouge", depuis, ligne: texte, decision: null, carte: null }));
  return {
    ...tableau,
    file: [...tableau.file, ...lignes].sort((a, b) => a.depuis.localeCompare(b.depuis)),
    bilans: [
      ...tableau.bilans,
      ...base.enCours.map(({ ligne }) => ligne),
      ...base.pourLeSecond.map(({ ticket, sha }) => `The base is red at ${court(sha)}: its repair #${ticket} failed and is the second's to handle, not a question for the chef.`),
    ],
  };
}
