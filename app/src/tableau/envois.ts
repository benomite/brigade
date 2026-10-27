// Les réponses du chef aux cartes de TODO, telles que le tableau de la cuisine les montre (#1841, épique #1838) : un
// geste `choose` ou `answer` posté en commentaire sur l'issue du tableau (tableau-gestes/rail.ts), puis ce que la box en
// a fait. Tant que la box n'a ni joué le geste ni répondu sous lui, la carte le dit envoyé et en attente de la cuisine ;
// sa réponse lue, la carte dit ce qui est advenu — joué, ou pourquoi il ne l'a pas été.
//
// Tout se tire de GitHub, jamais d'une mémoire de l'app : un redémarrage relit les mêmes commentaires, et la carte ne
// redevient pas sans réponse. Ce qui dit qu'un geste est traité, sur le tableau même (docs/tableau-gestes.md) :
//   - le bloc machine, qui porte les derniers gestes lus, leur état et la ligne répondue (`tableau.gestes`) ;
//   - à défaut — la box qui retient ses appels ne réécrit pas le bloc, elle répond quand même (#1840) —, son commentaire
//     de réponse, qui commence par `**Done**`, `**Not done**` ou `**Not understood**` et nomme le geste par son lien.
// Un geste resté sans réponse alors que la box a répondu à un geste posté après lui n'est pas en attente : elle l'a lu,
// et l'a laissé — il n'est pas du compte du chef. La carte n'en dit rien.
//
// Seule la grammaire des gestes est reprise du runtime (runtime/src/tableau/gestes/grammaire.ts, pure) : la carte lit
// un geste comme la box le lit.
import { lireLeGeste } from "../../../runtime/src/tableau/gestes/grammaire.ts";
import type { GesteDuTableau, LigneDeLaFile } from "../../../runtime/src/tableau/rendu/bloc.ts";
import type { AppelGitHub } from "./client.ts";
import type { TableauLu } from "./lecture.ts";

// Une réponse du chef à la carte de TODO de `ticket`, postée sur le tableau : son commentaire, son heure sur GitHub, le
// rang du choix ou le texte, et ce que la box en a fait — `attente` tant qu'elle n'a rien dit, `joue` ou `refuse` avec
// la ligne qu'elle a répondue (`dit`, sans markdown) et, refusé, sa raison seule (`raison`).
export type EnvoiDeCarte = { ticket: number; commentaire: number; url: string | null; le: string } & ({ choix: number } | { texte: string }) &
  ({ etat: "attente" } | { etat: "joue"; dit: string } | { etat: "refuse"; dit: string; raison: string });

// Le tableau lu (lecture.ts), et les réponses aux cartes de TODO que ses commentaires portent — absentes quand ils n'ont
// pas été lus. lecture.ts ne les lit pas : le téléphone, qui partage ce module, n'en demande pas plus à GitHub.
export type TableauLuAvecEnvois = TableauLu & { envois?: EnvoiDeCarte[] };

// Un commentaire du tableau, tel que GitHub le rend.
export type CommentaireDuTableau = { id: number; url: string | null; corps: string; le: string };

// Les commentaires lus d'un appel, et le nombre d'appels au plus : au-delà, les plus récents ne sont pas lus — la carte
// garde alors ce qu'elle savait.
const PAR_PAGE = 100;
const PAGES_AU_PLUS = 10;

const REPONSE_DE_LA_BOX = /^\*\*(Done|Not done|Not understood)\*\*/;
const LIEN_DU_GESTE = /#issuecomment-(\d+)\b/;

// Une ligne de la box en texte : sans gras, chaque lien réduit à ses mots.
export const sansMarkdown = (ligne: string): string =>
  ligne
    .replace(/\*\*([^*]*)\*\*/g, "$1")
    .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/\\([\\`*_{}[\]()#+\-.!|<>~])/g, "$1")
    .trim();

// Ce que la box a répondu, en texte, et sa raison quand elle n'a pas joué : ce qui suit le nom du geste
// (`**Not done** — [choose #12 1](…): <raison>`, runtime/src/tableau/gestes/gestes.ts, `direLaReponse`).
function issueDe(ligne: string, pris: boolean): { etat: "joue"; dit: string } | { etat: "refuse"; dit: string; raison: string } {
  const dit = sansMarkdown(ligne.split("\n")[0] ?? "");
  if (pris) return { etat: "joue", dit };
  const raison = /^Not (?:done|understood) — [^:]*: (.+)$/.exec(dit)?.[1]?.trim();
  return { etat: "refuse", dit, raison: raison === undefined || raison === "" ? dit : raison };
}

// Les réponses aux cartes de TODO que ce tableau porte, tirées de ses commentaires : pour chaque carte de la file, la
// dernière réponse du chef postée depuis qu'elle attend (`depuis`) — une réponse plus ancienne était celle d'une autre
// question. Pur.
export function envoisDuTableau(file: readonly LigneDeLaFile[], gestes: readonly GesteDuTableau[], commentaires: readonly CommentaireDuTableau[]): EnvoiDeCarte[] {
  const cartes = new Map(file.flatMap(({ ticket, carte, depuis }) => (ticket === null || carte === null ? [] : [[ticket, Date.parse(depuis)] as const])));
  const traites = new Map<number, { etat: "joue"; dit: string } | { etat: "refuse"; dit: string; raison: string }>();
  for (const { commentaire, etat, reponse } of gestes) traites.set(commentaire, issueDe(reponse, etat === "pris"));
  for (const { corps } of commentaires) {
    const tete = REPONSE_DE_LA_BOX.exec(corps.trimStart());
    const vise = tete === null ? undefined : LIEN_DU_GESTE.exec(corps)?.[1];
    if (tete === null || vise === undefined || traites.has(Number(vise))) continue;
    traites.set(Number(vise), issueDe(corps.trimStart(), tete[1] === "Done"));
  }
  // Le plus récent des gestes dont la box a dit quelque chose : ce qui est plus ancien et sans réponse, elle l'a laissé.
  const dernierTraite = Math.max(0, ...traites.keys());
  const parTicket = new Map<number, EnvoiDeCarte>();
  for (const { id, url, corps, le } of [...commentaires].sort((a, b) => a.id - b.id)) {
    const lu = lireLeGeste(corps);
    if (lu === null || !("verbe" in lu) || (lu.verbe !== "choose" && lu.verbe !== "answer")) continue;
    const depuis = cartes.get(lu.ticket);
    if (depuis === undefined || Date.parse(le) < depuis) continue;
    const issue = traites.get(id);
    if (issue === undefined && id < dernierTraite) continue;
    const reponse = lu.verbe === "choose" ? { choix: lu.choix } : { texte: lu.reponse };
    parTicket.set(lu.ticket, { ticket: lu.ticket, commentaire: id, url, le, ...reponse, ...(issue ?? { etat: "attente" as const }) });
  }
  return [...parTicket.values()];
}

type CommentaireBrut = { id?: unknown; html_url?: unknown; body?: unknown; created_at?: unknown };

const lireCommentaire = ({ id, html_url, body, created_at }: CommentaireBrut): CommentaireDuTableau[] =>
  typeof id === "number" && typeof body === "string" && typeof created_at === "string" ? [{ id, url: typeof html_url === "string" ? html_url : null, corps: body, le: created_at }] : [];

// Le tableau lu, avec les réponses aux cartes de TODO que ses commentaires portent (`envois`). Rien n'est demandé à
// GitHub quand aucune carte de TODO n'attend ; seuls les commentaires écrits depuis que la plus ancienne attend sont lus.
// Des commentaires qui ne se lisent pas — GitHub injoignable ou qui refuse — laissent le tableau sans `envois` : rien
// n'en est dit, et la carte garde ce que la vue savait.
export async function avecLesEnvois(lu: TableauLu, appeler: AppelGitHub): Promise<TableauLuAvecEnvois> {
  const depuis = lu.file.flatMap(({ ticket, carte, depuis: instant }) => (ticket === null || carte === null || Number.isNaN(Date.parse(instant)) ? [] : [Date.parse(instant)]));
  if (depuis.length === 0) return { ...lu, envois: [] };
  const depuisLe = new Date(Math.min(...depuis)).toISOString();
  const commentaires: CommentaireDuTableau[] = [];
  try {
    for (let page = 1; page <= PAGES_AU_PLUS; page++) {
      const reponse = await appeler(`/repos/${lu.depot}/issues/${lu.numero}/comments?since=${encodeURIComponent(depuisLe)}&per_page=${PAR_PAGE}&page=${page}`);
      if (reponse.status !== 200 || !Array.isArray(reponse.data)) return lu;
      commentaires.push(...(reponse.data as CommentaireBrut[]).flatMap(lireCommentaire));
      if (reponse.data.length < PAR_PAGE) break;
    }
  } catch {
    return lu;
  }
  return { ...lu, envois: envoisDuTableau(lu.file, lu.gestes, commentaires) };
}
