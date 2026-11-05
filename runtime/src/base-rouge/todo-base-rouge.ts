// La base rouge dans TODO (#2341, épique #2335). Un ticket de réparation ouvert
// par la pass (`ouvre-reparation.ts`) porte la marque cachée
// `<!-- brigade:base-rouge sha=<commit rouge> -->` : seule cette marque le
// désigne ici, sur le dépôt de n'importe quel projet.
//
// - Sa réparation cuit : une ligne qui dit que la base est rouge et qu'une
//   réparation cuit. Elle ne demande rien au chef : elle va dans la part de TODO
//   qui informe, pas dans celle qui attend un geste.
// - Sa réparation a échoué — le cook a abandonné ou a été refusé (le ticket est
//   sorti de la cuisine, `hors-cuisine`), ou le ticket est marqué comme
//   attendant le chef (`blocked-on-human`, `chef-todo`) : le ticket est une
//   entrée pour le chef, avec la raison de l'échec, dans la forme d'une carte
//   (`sorte`, `texte`) que la vue pose telle quelle.
// - Fermé (base verte), ou sans marque : rien. Sans ticket marqué, TODO reste
//   ce qu'il était.
//
// Le module ne lit que ce qu'on lui donne : les issues ouvertes avec leurs
// commentaires. Une marque n'est crue que d'un auteur de confiance.
import { DE_CONFIANCE } from "../alimenter.ts";
import { A_LA_MAIN } from "../brigade-github.ts";
import { CHEF_TODO } from "../github-seul/carte-todo/carte-todo.ts";
import { HORS_CUISINE } from "../github.ts";
import { shaDeBaseRouge } from "./ouvre-reparation.ts";

export type CommentaireDeReparation = { body: string; association: string };
export type IssueDeReparation = {
  number: number;
  title: string;
  state: "open" | "closed";
  labels: string[];
  body: string;
  association: string;
  commentaires: CommentaireDeReparation[];
};

// Une base rouge dont la réparation cuit : ce que TODO dit, sans rien demander.
export type ReparationEnCours = { ticket: number; sha: string; ligne: string };
// Une réparation échouée : une entrée pour le chef, avec pourquoi.
export type ReparationEchouee = { ticket: number; titre: string; sha: string; sorte: "base-rouge"; texte: string };
export type BaseRougeDuTodo = { enCours: ReparationEnCours[]; pourLeChef: ReparationEchouee[] };

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

export function baseRougeDuTodo(issues: readonly IssueDeReparation[]): BaseRougeDuTodo {
  const resultat: BaseRougeDuTodo = { enCours: [], pourLeChef: [] };
  for (const issue of issues) {
    if (issue.state !== "open" || !DE_CONFIANCE.includes(issue.association)) continue;
    const sha = shaDeBaseRouge(issue.body);
    if (sha === null) continue;
    if (echouee(issue.labels)) {
      resultat.pourLeChef.push({
        ticket: issue.number,
        titre: issue.title,
        sha,
        sorte: "base-rouge",
        texte: `The base is red at ${court(sha)} and its repair #${issue.number} failed — it needs you. Why: ${raisonDeLEchec(issue)}`,
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
