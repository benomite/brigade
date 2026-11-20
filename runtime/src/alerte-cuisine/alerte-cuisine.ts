// Les issues que la station ouvre pour ses propres besoins (#3620, épique
// #3619) : l'issue du disjoncteur (`../breaker-issue.ts`). Elle dit comment la
// cuisine elle-même tourne, pas le code du projet servi : elle se dépose sur la
// brigade, jamais dans le dépôt du projet, et n'est jamais un ticket — le
// manager ne la juge pas, la station ne la donne à aucun cook. Le 15 novembre
// 2026, secondes#46, l'issue du disjoncteur, a été jugée `fire`.
//
// Elle se reconnaît à sa marque durable, en commentaire HTML que GitHub
// n'affiche pas, que la station écrit en tête de son corps —
// `<!-- brigade:breaker-open project=<projet> -->` (`marqueDuDisjoncteur`) —, et
// au label `brigade:breaker-open`. Recopiée par un humain sans son corps, elle se
// reconnaît aussi à son titre, celui que la station lui donne. Elle dit la
// cuisine retenue, et se ferme quand elle reprend.
//
// Le superviseur (#3914) n'ouvre aucune alerte de la cuisine : il agit, et dit
// ce qu'il a fait sur le ticket où il a agi.
//
// Ce module ne lit rien et n'importe que des feuilles : la lecture des tickets
// (`../github.ts`) s'en sert.

export type AlerteDeLaCuisine = "disjoncteur";

// Le dépôt de la brigade : là où vit le code de la cuisine, et où ses alertes se déposent.
export const DEPOT_BRIGADE = "benomite/brigade";

// La marque cachée qui nomme le projet servi (`<owner>/<repo>`) dans ce que la station dépose sur la brigade.
export const marqueDuProjet = (servi: string) => `<!-- brigade:projet=${servi} -->`;

// Le label de l'issue du disjoncteur ; sa marque est `<!-- brigade:breaker-open project=<projet> -->`.
export const LABEL_DU_DISJONCTEUR = "brigade:breaker-open";
export const marqueDuDisjoncteur = (projet: string) => `<!-- ${LABEL_DU_DISJONCTEUR} project=${projet} -->`;

// Le titre que la station lui donne (`titreDeLIssue`).
const TITRE_DU_DISJONCTEUR = /^Kitchen \S+ held: its breaker is open$/;

// L'alerte de la cuisine que l'issue est, ou null si elle n'en est pas une.
export function alerteDeLaCuisine(issue: { title: string; labels: readonly string[]; body?: string | null }): AlerteDeLaCuisine | null {
  const corps = issue.body ?? "";
  if (issue.labels.includes(LABEL_DU_DISJONCTEUR) || corps.includes(`<!-- ${LABEL_DU_DISJONCTEUR} project=`) || TITRE_DU_DISJONCTEUR.test(issue.title.trim())) return "disjoncteur";
  return null;
}

// Le champ que les lectures des tickets ajoutent à une issue qui est une alerte.
export const avecLAlerte = (issue: { title: string; labels: readonly string[]; body?: string | null }): { alerte?: AlerteDeLaCuisine } => {
  const alerte = alerteDeLaCuisine(issue);
  return alerte === null ? {} : { alerte };
};

// Vrai si l'alerte n'est pas un ticket du dépôt `_depot` (`<owner>/<repo>`) où
// elle est : celle du disjoncteur ne l'est d'aucun.
export function horsDesTickets(alerte: AlerteDeLaCuisine | null | undefined, _depot: string | null | undefined): boolean {
  return alerte === "disjoncteur";
}
