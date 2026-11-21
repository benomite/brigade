// L'issue que la station ouvre pour ses propres besoins (#3620, épique #3619) :
// celle du disjoncteur, que la station n'ouvre plus depuis #3911 (les issues déjà ouvertes restent lues). Elle dit comment la cuisine elle-même
// tourne, pas le code du projet servi : elle se dépose sur la brigade, jamais
// dans le dépôt du projet, et n'y est jamais un ticket — le manager ne la juge
// pas, la station ne la donne à aucun cook. Le 15 novembre 2026, secondes#46,
// l'issue du disjoncteur, a été jugée `fire` et prise par un cook dans le dépôt
// d'une app Android, où le code de la cuisine n'est pas.
//
// Elle se reconnaît à sa marque durable, en commentaire HTML que GitHub
// n'affiche pas, que la station écrivait en tête de son corps —
// `<!-- brigade:breaker-open project=<projet> -->` —, à
// son label `brigade:breaker-open`, ou, recopiée par un humain sans son corps,
// au titre que la station lui donne. Elle se ferme quand la cuisine reprend.
//
// Ce module ne lit rien et n'importe que des types : la lecture des tickets
// (`github.ts`) s'en sert.
import type { GitHub, IssueOuverte } from "./github.ts";

export type AlerteDeLaCuisine = "disjoncteur";

// Le dépôt de la brigade : là où vit le code de la cuisine, et où ses issues se déposent.
export const DEPOT_BRIGADE = "benomite/brigade";

// Le GitHub de la brigade tel que la station le lit et l'écrit : ses issues fermées
// disent quand (`closedAt`), si GitHub le dit.
export type GitHubDeLaBrigade = {
  issuesDepuis(instant: string): Promise<(Pick<IssueOuverte, "number" | "body" | "association"> & Partial<Pick<IssueOuverte, "state" | "createdAt" | "author">> & { closedAt?: string })[]>;
  creerIssue(issue: { titre: string; corps: string; labels: string[] }): Promise<number>;
  fermerIssue(numero: number): Promise<void>;
  ecrireCorps?(numero: number, corps: string): Promise<void>;
  commenter?(numero: number, corps: string): Promise<void>;
} & Partial<Pick<GitHub, "droits">>;

// La marque cachée qui nomme le projet servi (`<owner>/<repo>`) dans ce que la station dépose sur la brigade.
export const marqueDuProjet = (servi: string) => `<!-- brigade:projet=${servi} -->`;

// Le label de l'issue du disjoncteur ; sa marque est `<!-- brigade:breaker-open project=<projet> -->`. Rien ne l'écrit plus depuis #3911 : on ne fait que la reconnaître.
const LABEL_DU_DISJONCTEUR = "brigade:breaker-open";

// Le titre que la station lui donnait.
const TITRE_DU_DISJONCTEUR = /^Kitchen \S+ held: its breaker is open$/;

// L'issue de la cuisine que l'issue est, ou null si elle n'en est pas une.
export function alerteDeLaCuisine(issue: { title: string; labels: readonly string[]; body?: string | null }): AlerteDeLaCuisine | null {
  const corps = issue.body ?? "";
  if (issue.labels.includes(LABEL_DU_DISJONCTEUR) || corps.includes(`<!-- ${LABEL_DU_DISJONCTEUR} project=`) || TITRE_DU_DISJONCTEUR.test(issue.title.trim())) return "disjoncteur";
  return null;
}

// Le champ que les lectures des tickets ajoutent à une issue de la cuisine.
export const avecLAlerte = (issue: { title: string; labels: readonly string[]; body?: string | null }): { alerte?: AlerteDeLaCuisine } => {
  const alerte = alerteDeLaCuisine(issue);
  return alerte === null ? {} : { alerte };
};

// Vrai si l'issue n'est pas un ticket du dépôt où elle est : celle du disjoncteur, partout.
export const horsDesTickets = (alerte: AlerteDeLaCuisine | null | undefined): boolean => alerte === "disjoncteur";
