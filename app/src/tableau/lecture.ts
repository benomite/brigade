// Le tableau de la cuisine d'un projet (« Kitchen board »), lu de GitHub : l'issue que la box tient à jour dans le dépôt
// du projet (runtime/src/tableau/), retrouvée par l'API de GitHub, son bloc machine lu par le lecteur que le runtime
// partage avec les apps (runtime/src/tableau/rendu/bloc.ts, `lireLeTableau`). Ce qui en sort : la file de ce qui attend
// le chef, l'état de la cuisine, et l'âge de cette lecture — de l'heure où la box a écrit le bloc à celle où l'app l'a lu.
//
// Ni la box ni une station ne sont jointes : rien d'autre que GitHub, par l'appel que la plateforme donne (client.ts).
// Le même module sert au desktop et au téléphone (app/android/web/lecture.ts).
//
// Ce qui ne se lit pas le dit, jamais une file vide : GitHub qui ne répond pas ou refuse, le dépôt sans tableau, le
// tableau sans bloc ou d'une version que l'app ne lit pas — chaque fois un échec, et sa raison en une phrase, que l'app
// montre telle quelle.
import { lireLeTableau, OUVERTURE_DU_BLOC, type CuisineDuTableau, type FaitsPublies, type GesteDuTableau, type LigneDeLaFile, type LigneDuRail, type Resserre } from "../../../runtime/src/tableau/rendu/bloc.ts";
import type { AppelGitHub, ReponseGitHub } from "./client.ts";

// Le label par lequel la box retrouve son tableau dans le dépôt (runtime/src/tableau/publication/publier.ts,
// `LABEL_DU_TABLEAU`), et le titre qu'elle lui donne (runtime/src/tableau/rendu/rendre.ts, `TITRE_DU_TABLEAU`) : ces
// modules du runtime ne se chargent pas sans lui, l'app les redit.
export const LABEL_DU_TABLEAU = "kitchen-board";
export const TITRE_DU_TABLEAU = "Kitchen board";
// Les issues au label lues d'un appel : la box n'en tient qu'une.
const PAR_PAGE = 100;

export type TableauLu = {
  lu: true;
  // `<owner>/<repo>`, et l'issue du tableau.
  depot: string;
  numero: number;
  adresse: string | null;
  // L'heure où la box a écrit le bloc, celle où l'app l'a lu, et l'écart entre les deux, en secondes.
  genereLe: string;
  luLe: string;
  age: number;
  // Ce que le bloc porte : le projet, la file du chef, ce que `status` dit sans que ce soit une décision, la cuisine.
  projet: string | null;
  file: LigneDeLaFile[];
  // La page de GitHub où se finit chaque ligne de la file, dans son ordre (`pageDeLaLigne`) : la PR de sa décision,
  // l'issue de son ticket, ou le tableau même pour une ligne qui n'est à aucun ticket.
  pages: string[];
  bilans: string[];
  cuisine: CuisineDuTableau;
  // Les derniers gestes du chef que la box a lus sur le tableau, et ce qu'elle y a répondu (#1589) : la vue y suit ceux
  // qu'elle a postés (#1590). Vide d'un bloc écrit sans eux.
  gestes: GesteDuTableau[];
  // Ce que la vue du rail dessine (#1693, #1694) : l'objet de `facts` et la ligne `status` de chaque ticket du rail —
  // absents d'un bloc écrit avant eux, ou que la box a dû retirer pour tenir dans une issue (`resserre`, absent quand
  // rien ne l'a été).
  faits?: FaitsPublies;
  lignesDuRail?: LigneDuRail[];
  // L'heure où la box a lu l'état qu'elle publie (`tableau.lu`) : les durées que ses lignes disent se comptent jusqu'à elle.
  etatLuLe?: string;
  resserre?: Resserre[];
};
// `horsLigne` : GitHub n'a pas été joint du tout — pas de réseau, une seule cause (#1818). Ce n'est pas une panne : la vue
// garde le dernier rail lu, et le dit hors ligne. Un GitHub joint qui refuse, ou un tableau illisible, en est une.
export type TableauNonLu = { lu: false; depot: string; luLe: string; raison: string; horsLigne?: true };
export type LectureDuTableauDuDepot = TableauLu | TableauNonLu;

export type OptionsDeLecture = {
  // `<owner>/<repo>` : le dépôt du projet.
  depot: string;
  appeler: AppelGitHub;
  maintenant?: () => Date;
};

type IssueBrute = { number?: unknown; title?: unknown; body?: unknown; html_url?: unknown; pull_request?: unknown };

const DEPOT = /^[A-Za-z0-9-]+\/[A-Za-z0-9._-]+$/;

// La première phrase de ce que GitHub dit d'un refus, sans son point.
function messageDe(data: unknown): string | null {
  const message = typeof data === "object" && data !== null && "message" in data ? data.message : typeof data === "string" ? data : null;
  if (typeof message !== "string") return null;
  const phrase = (message.trim().split(/(?<=[.!?])\s/)[0] ?? "").replace(/[.\s]+$/, "");
  return phrase === "" || phrase.length > 200 || phrase.startsWith("<") ? null : phrase;
}

// La raison d'une réponse de GitHub qui n'est pas la liste.
function refusDe(depot: string, { status, data }: ReponseGitHub): string {
  const message = messageDe(data);
  if (status === 401) return `GitHub refused the app's GitHub sign-in (HTTP 401)${message === null ? "" : `: ${message}`} — sign in to GitHub again.`;
  if (status === 404) return `GitHub does not show ${depot} (HTTP 404): the repository is private and this app is not signed in to an account that sees it, or it no longer exists.`;
  return `GitHub refused to list the issues of ${depot} (HTTP ${status})${message === null ? "" : `: ${message}`}.`;
}

// Parmi les issues au label — que seul qui a la main sur le dépôt pose —, celles que la box a écrites : leur bloc, ou à
// défaut leur titre. La box tient le plus ancien des ouverts (publier.ts, `retrouver`) : c'est lui qui est lu.
function leTableau(issues: IssueBrute[]): IssueBrute | undefined {
  return issues
    .filter((issue) => issue.pull_request === undefined && typeof issue.number === "number")
    .filter((issue) => (typeof issue.body === "string" && issue.body.includes(OUVERTURE_DU_BLOC)) || issue.title === TITRE_DU_TABLEAU)
    .sort((a, b) => Number(a.number) - Number(b.number))[0];
}

// La page d'une ligne de la file, sur GitHub : la PR que sa décision nomme, si elle est de ce dépôt ; sinon l'issue de
// son ticket ; sinon le tableau, où la box lit ce que le chef y écrit (#1585). Aucune autre adresse n'en sort.
function pageDeLaLigne(depot: string, tableau: string, { ticket, decision }: LigneDeLaFile): string {
  const pr = decision?.pr ?? "";
  const dePr = `https://github.com/${depot}/pull/`;
  if (pr.startsWith(dePr) && /^\d+$/.test(pr.slice(dePr.length))) return pr;
  return ticket !== null && Number.isInteger(ticket) && ticket > 0 ? `https://github.com/${depot}/issues/${ticket}` : tableau;
}

export async function lireLeTableauDuDepot({ depot, appeler, maintenant = () => new Date() }: OptionsDeLecture): Promise<LectureDuTableauDuDepot> {
  const echec = (raison: string, horsLigne?: true): TableauNonLu => ({ lu: false, depot, luLe: maintenant().toISOString(), raison, ...(horsLigne === undefined ? {} : { horsLigne }) });
  if (!DEPOT.test(depot)) return echec(`The project's repository "${depot}" is not an owner/name GitHub repository, so its Kitchen board cannot be read. Its folder has no GitHub \`origin\` remote to take it from: in ~/.config/brigade/app.json, give this project the field "depot" with its GitHub repository as value, for example "depot": "acme/kitchen".`);
  let reponse: ReponseGitHub;
  try {
    reponse = await appeler(`/repos/${depot}/issues?labels=${LABEL_DU_TABLEAU}&state=open&sort=created&direction=asc&per_page=${PAR_PAGE}`);
  } catch (erreur) {
    const dit = (erreur instanceof Error ? erreur.message : String(erreur)).trim().split("\n")[0]?.replace(/[.\s]+$/, "") ?? "";
    return echec(`GitHub could not be reached to read the Kitchen board of ${depot}${dit === "" ? "" : `: ${dit}`}.`, true);
  }
  const luLe = maintenant();
  if (reponse.status !== 200) return echec(refusDe(depot, reponse));
  if (!Array.isArray(reponse.data)) return echec(`GitHub's answer for the issues of ${depot} is not a list of issues.`);
  const issue = leTableau(reponse.data as IssueBrute[]);
  if (issue === undefined) return echec(`There is no open Kitchen board in ${depot}: the box serving it has not published one yet, or it was closed.`);
  const numero = Number(issue.number);
  const lecture = lireLeTableau(typeof issue.body === "string" ? issue.body : "");
  if (!lecture.lu) return echec(`The Kitchen board of ${depot} (issue ${numero}) cannot be read: ${lecture.raison}.`);
  const { genereLe, tableau } = lecture;
  return {
    lu: true,
    depot,
    numero,
    adresse: typeof issue.html_url === "string" ? issue.html_url : null,
    genereLe,
    luLe: luLe.toISOString(),
    // Une box dont l'horloge avance ne rend pas une lecture de l'avenir.
    age: Math.max(0, Math.round((luLe.getTime() - Date.parse(genereLe)) / 1000)),
    projet: tableau.projet,
    file: tableau.file,
    pages: tableau.file.map((ligne) => pageDeLaLigne(depot, `https://github.com/${depot}/issues/${numero}`, ligne)),
    bilans: tableau.bilans,
    cuisine: tableau.cuisine,
    gestes: Array.isArray(tableau.gestes) ? tableau.gestes : [],
    ...(typeof tableau.faits === "object" && tableau.faits !== null && !Array.isArray(tableau.faits) ? { faits: tableau.faits } : {}),
    ...(Array.isArray(tableau.lignesDuRail) ? { lignesDuRail: tableau.lignesDuRail } : {}),
    etatLuLe: tableau.lu,
    ...(Array.isArray(tableau.resserre) ? { resserre: tableau.resserre } : {}),
  };
}
