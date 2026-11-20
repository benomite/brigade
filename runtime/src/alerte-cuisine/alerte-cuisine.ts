// Les issues que la station ouvre pour ses propres besoins (#3620, épique
// #3619) : l'alerte d'une cuisine inerte (`../guerison/cuisine-inerte.ts`) et
// l'issue du disjoncteur, que la station ne dépose plus (#3911) mais dont les
// issues déjà ouvertes se reconnaissent encore. Elles disent comment la
// cuisine elle-même tourne, pas le code du projet servi : elles se déposent sur
// la brigade, jamais dans le dépôt du projet, et n'y sont jamais des tickets —
// le manager ne les juge pas, la station ne les donne à aucun cook. Le 15
// novembre 2026, secondes#45 (une cuisine inerte, `empty-rail`) a été jugée
// `fire` et prise par un cook dans le dépôt d'une app Android, où le code de la
// cuisine n'est pas ; secondes#46, l'issue du disjoncteur, a été jugée de même.
//
// Elles se reconnaissent à leur marque durable, en commentaire HTML que GitHub
// n'affiche pas, que la station écrit en tête de leur corps :
// - `<!-- brigade:cuisine-inerte -->` (`MARQUE_D_INERTIE`) pour l'inertie ;
// - `<!-- brigade:breaker-open project=<projet> -->`, et le label
//   `brigade:breaker-open`, pour le disjoncteur.
// Celles qu'un humain aurait recopiées sans leur corps se reconnaissent aussi à
// leur titre, celui que la station leur donne.
//
// Sur la brigade elle-même, l'alerte d'inertie reste un ticket : le code de la
// cuisine y vit, et ses cooks le réparent (#3098). L'issue du disjoncteur n'est
// un ticket nulle part : elle dit la cuisine retenue, et se ferme quand elle reprend.
//
// Ce module ne lit rien et n'importe que des feuilles : la lecture des tickets
// (`../github.ts`) s'en sert.
import { MARQUE_D_INERTIE } from "../guerison/cuisine-inerte.ts";

export type AlerteDeLaCuisine = "inertie" | "disjoncteur";

// Le dépôt de la brigade : là où vit le code de la cuisine, et où ses alertes se déposent.
export const DEPOT_BRIGADE = "benomite/brigade";

// La marque cachée qui nomme le projet servi (`<owner>/<repo>`) dans ce que la station dépose sur la brigade.
export const marqueDuProjet = (servi: string) => `<!-- brigade:projet=${servi} -->`;

// Le label de l'issue du disjoncteur, que la station déposait avant #3911 ; sa marque est `<!-- brigade:breaker-open project=<projet> -->`.
export const LABEL_DU_DISJONCTEUR = "brigade:breaker-open";

// Les titres que la station leur donne (`signalerInertie`, et celui qu'avait l'issue du disjoncteur).
const TITRE_D_INERTIE = /^The kitchen is idle: no merge for \d+ minutes with \d+ cookable ticket\(s\)/;
const TITRE_DU_DISJONCTEUR = /^Kitchen \S+ held: its breaker is open$/;

// L'alerte de la cuisine que l'issue est, ou null si elle n'en est pas une.
export function alerteDeLaCuisine(issue: { title: string; labels: readonly string[]; body?: string | null }): AlerteDeLaCuisine | null {
  const corps = issue.body ?? "";
  if (issue.labels.includes(LABEL_DU_DISJONCTEUR) || corps.includes(`<!-- ${LABEL_DU_DISJONCTEUR} project=`) || TITRE_DU_DISJONCTEUR.test(issue.title.trim())) return "disjoncteur";
  if (corps.includes(MARQUE_D_INERTIE) || TITRE_D_INERTIE.test(issue.title.trim())) return "inertie";
  return null;
}

// Le champ que les lectures des tickets ajoutent à une issue qui est une alerte.
export const avecLAlerte = (issue: { title: string; labels: readonly string[]; body?: string | null }): { alerte?: AlerteDeLaCuisine } => {
  const alerte = alerteDeLaCuisine(issue);
  return alerte === null ? {} : { alerte };
};

// Vrai si l'alerte n'est pas un ticket du dépôt `depot` (`<owner>/<repo>`) où
// elle est : celle du disjoncteur partout, celle de l'inertie hors de la
// brigade. Un dépôt inconnu est celui d'un projet.
export function horsDesTickets(alerte: AlerteDeLaCuisine | null | undefined, depot: string | null | undefined): boolean {
  return alerte === "disjoncteur" || (alerte === "inertie" && depot?.toLowerCase() !== DEPOT_BRIGADE);
}
