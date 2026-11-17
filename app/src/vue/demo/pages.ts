// Les pages du projet de démo que l'app laisse ouvrir depuis l'écran (ticket 3734) : son dépôt, ses tickets, le premier
// ticket et sa PR une fois servi — celles qu'il a, et rien d'autre. Sans projet, aucune.
export type PagesDuProjetDeDemo = { url: string; ticketUrl?: string; pullRequest?: string };

export const pagesDeLaDemo = (projet: PagesDuProjetDeDemo | undefined): string[] =>
  projet === undefined ? [] : [projet.url, `${projet.url}/issues`, projet.ticketUrl, projet.pullRequest].filter((page): page is string => typeof page === "string" && page !== "");
