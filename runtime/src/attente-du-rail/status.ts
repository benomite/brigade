// Pourquoi la file du rail ne part pas, dans `brigade <project> status` (#3433) : la phrase de `expliquerLAttente`, au-dessus
// de la file, puis la ligne de chaque carte — les mêmes que le rail de l'app écrit (vue/rail/github.ts).
//
// Seule une station GitHub seul la cherche : le rail y est sur GitHub. Le rail se lit de
// ses issues `fire` ouvertes : en file (ni `taken`, ni `in-pass`, ni `waiting`, ni mise de côté), pris, ou en pass — un
// `in-pass` est compté en pass sans relire sa PR. Une lecture qui échoue le dit sur la même ligne : jamais une file dite
// calme faute de l'avoir lue.
import type { Base } from "../base.ts";
import { cooksEnCoursDeStation, etatStation, plafondDeCooks, stationsAnnoncees } from "../projections/stations.ts";
import { porteListe, ticketsDeLaListe } from "../epique.ts";
import { lireLesStationsDuCompte } from "../enregistrement-station/stations-du-compte.ts";
import { estParque, LABEL_IN_PASS, LABEL_TAKEN, LABEL_PARKED } from "../github-etat/etats.ts";
import { lireGitHubSeul } from "../github-seul-etat.ts";
import { clientGh } from "../proteger-branche.ts";
import { feuPoseLe, lesFeux, type Lire } from "./lecture.ts";
import { LABELS_D_ECART, type StationsLues } from "./stations.ts";
import { limiteDuCompteDeLaStation } from "../github-limite.ts";
import { attentesDuTicket } from "../carte-attente/carte-attente.ts";
import { attenteDeLIssue } from "../attente-github/marque.ts";
import { lireLOrdreDuRail } from "../ordre-de-merge/lecture.ts";
import { expliquerLAttente, lignesDeStatus, lignesDesCartes, type LimiteDite, type TicketDuRail, type TicketEnWaiting } from "./raison.ts";

const LABEL_DU_TABLEAU = "kitchen-board";
const PAR_PAGE = 100;

type Brut = Record<string, unknown>;
const objet = (valeur: unknown): Brut | null => (typeof valeur === "object" && valeur !== null && !Array.isArray(valeur) ? (valeur as Brut) : null);
const texte = (valeur: unknown): string => (typeof valeur === "string" ? valeur : "");

// Les tickets du rail, d'après les issues `fire` ouvertes. L'entrée dans la file d'un ticket en file se lit de ses événements :
// `fire` posé ; ils ne se lisent pas, il n'en dit rien (nul) — la durée n'est alors pas dite, jamais inventée.
// Un ticket attendu découpé — une épique du rail, que la file saute — est attendu dans les tickets de son découpage, comme
// la porte de prise les attend (`attendusDuCorps`, #3622) : la ligne de la carte les nomme. Un ticket en file porte aussi
// ses attentes avec leur source (#3763) : son corps, sa fiche et les arrêts de ses cooks, lus de ses commentaires, sur un
// ticket du rail : un ticket hors du rail ne se dit pas.
// Un ticket parqué n'est pas sur le rail, mais un ticket en file qui l'attend le dit (#3761) : `waiting`, chacun avec
// qui il attend, relu de sa marque ; ses commentaires illisibles ne le cachent pas, ils taisent seulement qui (nul).
export async function lireLeRailEnFile(options: { depot: string; lire: Lire }): Promise<{ tickets: TicketDuRail[]; waiting: TicketEnWaiting[] }> {
  const { depot, lire } = options;
  const tickets: TicketDuRail[] = [];
  const waiting: TicketEnWaiting[] = [];
  const feux = await lesFeux(depot, lire);
  const quiAttend = async (numero: number): Promise<string | null> => {
    const brutes = await lire(`/repos/${depot}/issues/${numero}/comments?per_page=${PAR_PAGE}`).catch(() => null);
    const commentaires = Array.isArray(brutes) ? brutes.flatMap((un: unknown) => { const o = objet(un); return o === null ? [] : [{ body: texte(o.body), association: texte(o.author_association) }]; }) : [];
    return attenteDeLIssue(commentaires)?.who ?? null;
  };
  const decoupages = new Map(feux.flatMap((issue) => (typeof issue.number === "number" && porteListe(texte(issue.body)) ? [[issue.number, ticketsDeLaListe(texte(issue.body))] as const] : [])));
  for (const issue of feux) {
    if (issue.pull_request !== undefined || typeof issue.number !== "number") continue;
    const labels = (Array.isArray(issue.labels) ? issue.labels : []).flatMap((label) => (typeof objet(label)?.name === "string" ? [objet(label)?.name as string] : []));
    if (labels.includes(LABEL_PARKED)) waiting.push({ ticket: issue.number, qui: await quiAttend(issue.number) });
    if (labels.includes(LABEL_DU_TABLEAU) || porteListe(texte(issue.body)) || labels.includes(LABEL_PARKED)) continue;
    const decoupage = (n: number) => decoupages.get(n) ?? [];
    const duCorps = attentesDuTicket({ ticket: issue.number, corps: texte(issue.body), commentaires: [], decoupage }).attentes;
    const depend = [...new Set(duCorps.map(({ ticket }) => ticket))];
    if (labels.includes(LABEL_TAKEN)) tickets.push({ ticket: issue.number, etat: "taken", entreLe: null, depend });
    else if (labels.includes(LABEL_IN_PASS)) tickets.push({ ticket: issue.number, etat: "pass", entreLe: null, depend });
    else if (!estParque(labels) && !labels.some((label) => LABELS_D_ECART.includes(label))) {
      const evenements = await lire(`/repos/${depot}/issues/${issue.number}/events?per_page=${PAR_PAGE}`).catch(() => null);
      const poses = Array.isArray(evenements) ? feuPoseLe(evenements.flatMap((un: unknown) => { const o = objet(un); return o === null ? [] : [o]; })) : null;
      // Sa fiche et les arrêts de ses cooks (#3763) : des commentaires qui ne se lisent pas ne le disent pas libre, sa carte
      // dit qu'ils ne se sont pas lus.
      const brutes = await lire(`/repos/${depot}/issues/${issue.number}/comments?per_page=${PAR_PAGE}`).catch(() => null);
      const commentaires = Array.isArray(brutes) ? brutes.flatMap((un: unknown) => (typeof objet(un)?.body === "string" ? [objet(un)?.body as string] : [])) : null;
      const { attentes, commentairesLus } = attentesDuTicket({ ticket: issue.number, corps: texte(issue.body), commentaires, decoupage });
      tickets.push({ ticket: issue.number, etat: "queued", entreLe: poses, depend: [...new Set(attentes.map(({ ticket }) => ticket))], attentes, commentairesLus });
    }
  }
  return { tickets: await avecLOrdreDeMerge(depot, lire, tickets), waiting };
}

// Chaque ticket du rail avec les tickets dont le merge passe avant le sien (#4044) : ses dépendances déclarées encore sur le
// rail, et les tickets en pass dont la PR change un fichier qu'il change aussi. Un ordre qui ne se lit pas ne lie rien.
async function avecLOrdreDeMerge(depot: string, lire: Lire, tickets: TicketDuRail[]): Promise<TicketDuRail[]> {
  // Un ticket parqué attend quelqu'un, hors de la suite des merges : sa carte le dit déjà (#3761), elle ne se dit pas « after ».
  const surLeRail = new Set(tickets.map(({ ticket }) => ticket));
  const declarees = new Map(tickets.filter(({ etat }) => etat !== "taken").map((carte) => [carte.ticket, carte.depend.filter((n) => n !== carte.ticket && surLeRail.has(n))] as const));
  const enPass = tickets.filter(({ etat }) => etat === "pass").map(({ ticket }) => ticket);
  const ordre = await lireLOrdreDuRail({ depot, lire, declarees, enPass }).catch(() => new Map<number, number[]>());
  return tickets.map((carte) => (ordre.has(carte.ticket) ? { ...carte, apres: ordre.get(carte.ticket) } : carte));
}

const TITRE = "queue wait";
const nonLue = (depot: string, raison: string) => `${TITRE.padEnd(11)}not checked: the rail of ${depot} could not be read on GitHub — ${raison}`;

// Les lignes, d'après ce que `lire` rend de GitHub et les stations lues : aucune quand rien n'attend ou qu'un cook tourne.
// `plafondAtteint` : la station locale a pris tous ses cooks (`plafondAtteintDeLaStation`), ce que GitHub ne publie pas.
export async function lignesDeLAttente(options: { depot: string; lire: Lire; stations: () => Promise<StationsLues>; maintenant: number; plafondAtteint?: boolean; limite?: LimiteDite | null }): Promise<string[]> {
  return (await lireLAttente(options)).lignes;
}

// Les lignes de l'attente et, quand GitHub limite la station (#3684), les tickets en file que la ligne `rail` doit lister : le
// journal local n'en sait rien sur une station GitHub seul, et dit `empty`.
export type AttenteLue = { lignes: string[]; enFile: number[] };
async function lireLAttente(options: { depot: string; lire: Lire; stations: () => Promise<StationsLues>; maintenant: number; plafondAtteint?: boolean; limite?: LimiteDite | null }): Promise<AttenteLue> {
  const { depot, lire, maintenant, plafondAtteint = false, limite = null } = options;
  let tickets: TicketDuRail[];
  let waiting: TicketEnWaiting[];
  try {
    ({ tickets, waiting } = await lireLeRailEnFile({ depot, lire }));
  } catch (erreur) {
    return { lignes: [nonLue(depot, erreur instanceof Error ? erreur.message : String(erreur))], enFile: [] };
  }
  const cartes = lignesDesCartes(tickets, waiting);
  // Rien en file, ou un cook qui tourne : les stations n'ont rien à dire, elles ne se lisent pas.
  if (!tickets.some(({ etat }) => etat === "queued") || tickets.some(({ etat }) => etat === "taken")) return { lignes: lignesDeStatus(null, cartes), enFile: [] };
  const attente = expliquerLAttente({ depot, tickets, stations: await options.stations(), plafondAtteint, maintenant, limite, waiting });
  const limitee = attente?.raison === "quota-github" && limite !== null;
  return { lignes: lignesDeStatus(attente?.phrase ?? null, cartes), enFile: limitee ? tickets.filter(({ etat }) => etat === "queued").map(({ ticket }) => ticket) : [] };
}

// Le plafond de cooks est-il atteint ? Chaque station annoncée par le journal local qui a un plafond fait tourner autant de cooks
// qu'il en permet, et il y en a au moins une : sans plafond (nul) ou sans station annoncée, il ne l'est pas.
export function plafondAtteintDeLaStation(base: Base): boolean {
  const plafonnees = stationsAnnoncees(base).flatMap((station) => {
    const etat = etatStation(base, station);
    const plafond = etat === null ? null : plafondDeCooks(etat);
    return plafond === null ? [] : [{ station, plafond }];
  });
  return plafonnees.length > 0 && plafonnees.every(({ station, plafond }) => cooksEnCoursDeStation(base, station).length >= plafond);
}

// Ce que `status` ajoute : rien hors d'une station GitHub seul (le rail n'est lu sur GitHub que là), ou sans dépôt nommé.
export async function attenteDuRailDuStatus(env: Record<string, string | undefined>, maintenant: Date, base: Base): Promise<string[]> {
  return (await attenteEtRailDuStatus(env, maintenant, base)).lignes;
}

// `status` lit-il le rail sur GitHub ? Sur une station GitHub seul, au dépôt nommé : ailleurs, `status` reste sans lecture de GitHub.
export const railCherche = (env: Record<string, string | undefined>): boolean => Boolean(env.BRIGADE_GITHUB_REPO) && lireGitHubSeul(env.BRIGADE_STATE_DIR)?.etat === "accepted";

export async function attenteEtRailDuStatus(env: Record<string, string | undefined>, maintenant: Date, base: Base): Promise<AttenteLue> {
  const depot = env.BRIGADE_GITHUB_REPO;
  if (!depot || !railCherche(env)) return { lignes: [], enFile: [] };
  const gh = env.BRIGADE_GH_BIN || "gh";
  const client = clientGh(gh, env as NodeJS.ProcessEnv);
  const lire: Lire = async (chemin) => {
    const { statut, corps } = await client({ methode: "GET", chemin });
    if (statut !== 200) throw new Error(`GitHub answered HTTP ${statut} to ${chemin}`);
    return corps;
  };
  const stations = async (): Promise<StationsLues> => {
    const lues = await lireLesStationsDuCompte({ gh, env: env as NodeJS.ProcessEnv, maintenant: () => maintenant.getTime() });
    return lues.state === "listed" ? { lues: lues.stations } : { illisibles: lues.reason };
  };
  // La limite du compte que la station a vue, tant que sa reprise n'est pas passée.
  const limiteLue = limiteDuCompteDeLaStation(env.BRIGADE_STATION_DIR);
  const limite = limiteLue !== null && Date.parse(limiteLue.backAt) > maintenant.getTime() ? { backAt: limiteLue.backAt } : null;
  return lireLAttente({ depot, lire, stations, maintenant: maintenant.getTime(), plafondAtteint: plafondAtteintDeLaStation(base), limite });
}

// Les lignes de `status`, posées juste au-dessus de la ligne `rail` — la file —, ou à la fin sans elle.
export function avecLAttenteDuRail(lignes: readonly string[], attente: readonly string[]): string[] {
  if (attente.length === 0) return [...lignes];
  const rang = lignes.findIndex((ligne) => ligne.startsWith("rail "));
  return rang === -1 ? [...lignes, ...attente] : [...lignes.slice(0, rang), ...attente, ...lignes.slice(rang)];
}

// La ligne `rail` d'une photo qui dit `empty` alors que des tickets `fire` attendent sur GitHub (#3684) : elle les liste.
export function avecLeRailEnFile(lignes: readonly string[], enFile: readonly number[]): string[] {
  const rang = lignes.findIndex((ligne) => /^rail\s+empty$/.test(ligne));
  if (enFile.length === 0 || rang === -1) return [...lignes];
  return [...lignes.slice(0, rang), `${"rail".padEnd(11)}${enFile.length} queued, held by GitHub's rate limit`, ...enFile.map((ticket) => `  #${ticket}  queued`), ...lignes.slice(rang + 1)];
}
