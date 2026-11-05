// Le rail et les cooks d'un projet sur GitHub seul (ticket 2220, épique 2209) : un projet dont `.claude/brigade/projet.json`
// porte `githubOnlyState: true` ne tient plus son rail dans le journal de sa station — ses stations prennent, cuisent,
// jugent et mergent ses tickets sur GitHub (docs/reglages.md, `githubOnlyState`). Le tableau de la cuisine que sa box
// publie encore dit le rail de l'ancien chemin, figé : la vue du rail et l'onglet Cooks de ce projet lisent GitHub.
//
// Ce qui se lit, à chaque lecture du tableau — toutes conditionnelles (`If-None-Match`) : un 304 ne coûte rien :
//   - `projet.json`, sur la branche par défaut : l'interrupteur. Absent, ou éteint : le projet suit l'ancien chemin, et
//     son rail est celui du tableau, ses états refaits de GitHub (tableau/rail-github.ts, ticket 2059) — rien d'autre ne change ;
//   - ses issues ouvertes au label `fire` et ses PR ouvertes, page après page : le rail est chaque issue au label, son
//     état tiré de ses labels, de sa PR et de la base (`etatDuTicket`) — sans aucun des quatre, il est en attente ;
//   - pour un ticket pris ou en pass, les commentaires et les événements de son issue : la station qui le tient
//     (vue/cooks/prises.ts). Ce sont les cooks de l'onglet Cooks, chacun sous sa station, avec sa PR quand il en a une.
// Et, pour les stations de l'onglet Cooks (#2358), le signe de vie de chacune : l'enregistrement qu'elle réécrit dans son
// gist, sous le compte du chef, que le process principal lit à son pas (vue/cooks/signes-de-vie.ts) — reçu ici, pas lu.
//
// Le reste du tableau — TODO, ce qui est avant le rail, les livrés — est gardé tel que la box l'a publié. Est retiré ce
// que le journal seul disait du rail et des cooks et qui ne vaut plus : la cuisine oisive (« aucun cook n'a tourné »), ce
// qui tourne à côté des cooks, les stations déclarées à l'ancien chemin, et la cuisine retenue par lui.
import { etatDuTicket, type EtatDeLaBase, type IssueLue } from "../../../../runtime/src/github-etat/etats.ts";
import type { Cook } from "../../faits.ts";
import type { AppelGitHub } from "../../tableau/client.ts";
import type { LectureDuTableauDuDepot, TableauLu } from "../../tableau/lecture.ts";
import { labelDeMiseDeCote, miseDeCoteDe, type MiseDeCote } from "../../tableau/mise-de-cote-github.ts";
import { avecLesEtatsGithub, etatDeLaBaseGithub, lectureConditionnelle, MOT_DE_L_ETAT, ticketDeLaPR, type MemoireDesLectures } from "../../tableau/rail-github.ts";
import type { SigneDeVie } from "../../../../runtime/src/stations-github/stations.ts";
import { stationsDeGithub, tenantDeLIssue, type Prise } from "../cooks/prises.ts";

export const FICHIER_DU_PROJET = ".claude/brigade/projet.json";
const LABEL_FIRE = "fire";
const MOT_EN_FILE = "en attente";
// Le mot d'un ticket mis de côté (faits.ts, `TONS_DE_TICKET`) : sa carte est dans TODO (ticket 2075).
const MOT_MIS_DE_COTE = "86";
// Les mots dont un ticket a une station qui le tient.
const TENUS = new Set(["pris", "en pass", "base rouge"]);

type Brut = Record<string, unknown>;
const objet = (valeur: unknown): Brut | null => (typeof valeur === "object" && valeur !== null && !Array.isArray(valeur) ? (valeur as Brut) : null);
const liste = (valeur: unknown): Brut[] => (Array.isArray(valeur) ? valeur.flatMap((un: unknown) => { const o = objet(un); return o === null ? [] : [o]; }) : []);
const texte = (valeur: unknown): string => (typeof valeur === "string" ? valeur : "");

// La PR qui livre un ticket, telle que la carte la dit.
export type PrDuTicket = { numero: number; url: string; le: string };
// Un ticket du rail lu sur GitHub : son mot d'état (faits.ts, `TONS_DE_TICKET`), sa priorité (`prio:<n>` de ses labels),
// l'heure de son issue, sa PR ouverte, la station qui le tient, et ce qui le met de côté (ticket 2075) — nulles sans elles.
export type TicketSurGithub = { ticket: number; titre: string; url: string; etat: string; priorite: number | null; creeLe: string; pr: PrDuTicket | null; prise: Prise | null; miseDeCote?: MiseDeCote };
export type RailSurGithub = { lu: string; tickets: TicketSurGithub[] };
// Les signes de vie des stations du compte, tels que le process principal les a lus — ou pourquoi ils ne l'ont pas été,
// en une phrase.
export type SignesDeVie = { lus: SigneDeVie[] } | { illisible: string };
export const SIGNES_PAS_LUS: SignesDeVie = { illisible: "the app has not read your stations' signs of life on GitHub yet" };

// L'interrupteur, lu dans le contenu de `projet.json` que l'API de GitHub rend (en base64) : vrai seulement s'il le dit.
export function interrupteurLu(data: unknown): boolean {
  const contenu = objet(data)?.content;
  if (typeof contenu !== "string") return false;
  try {
    return objet(JSON.parse(Buffer.from(contenu, "base64").toString("utf8")))?.githubOnlyState === true;
  } catch {
    return false;
  }
}

// La priorité d'une issue : le plus petit `prio:<n>` de ses labels, null sans aucun.
const prioriteDe = (labels: readonly string[]): number | null => {
  const lues = labels.flatMap((label) => { const n = /^prio:(\d+)$/.exec(label)?.[1]; return n === undefined ? [] : [Number(n)]; });
  return lues.length === 0 ? null : Math.min(...lues);
};

// Une liste de GitHub, page après page, jusqu'à une page qui n'est pas pleine — dix au plus.
const PAR_PAGE = 100;
async function toutesLesPages(lire: (chemin: string) => Promise<unknown>, chemin: string): Promise<Brut[]> {
  const toutes: Brut[] = [];
  for (let page = 1; page <= 10; page++) {
    const lue = liste(await lire(`${chemin}${chemin.includes("?") ? "&" : "?"}per_page=${PAR_PAGE}&page=${page}`));
    toutes.push(...lue);
    if (lue.length < PAR_PAGE) break;
  }
  return toutes;
}

// L'interrupteur du projet : vrai, faux, ou null quand GitHub n'a pas rendu `projet.json` — ni lui, ni son absence.
export async function interrupteurDuDepot(depot: string, appeler: AppelGitHub): Promise<boolean | null> {
  const reponse = await appeler(`/repos/${depot}/contents/${FICHIER_DU_PROJET}`).catch(() => null);
  if (reponse?.status === 404) return false;
  return reponse?.status === 200 ? interrupteurLu(reponse.data) : null;
}

// Le rail d'un projet sur GitHub seul : ses tickets au label `fire`, chacun dans son état, avec sa PR et sa station. Un
// ticket qui porte `hors-cuisine` ou `blocked-on-human` — sans `waiting` — est mis de côté, quoi que ses autres labels
// disent : ses commentaires, toutes pages, disent pourquoi (tableau/mise-de-cote-github.ts, ticket 2075). Une lecture qui
// échoue lève : la lecture du tableau en dit la raison.
export async function lireLeRailSurGithub(options: { depot: string; appeler: AppelGitHub; maintenant?: () => Date }): Promise<RailSurGithub> {
  const { depot, appeler } = options;
  const lire = async (chemin: string) => {
    const reponse = await appeler(chemin);
    if (reponse.status !== 200) throw new Error(`GitHub answered HTTP ${reponse.status}`);
    return reponse.data;
  };
  const issues = await toutesLesPages(lire, `/repos/${depot}/issues?state=open&labels=${LABEL_FIRE}&sort=created&direction=asc`);
  const prs = await toutesLesPages(lire, `/repos/${depot}/pulls?state=open`);
  const lu = (options.maintenant ?? (() => new Date()))().toISOString();
  const livrees = new Map<number, PrDuTicket>();
  for (const pr of prs) {
    const ticket = ticketDeLaPR(texte(objet(pr.head)?.ref), texte(pr.body));
    if (ticket !== null && !livrees.has(ticket) && typeof pr.number === "number") livrees.set(ticket, { numero: pr.number, url: texte(pr.html_url), le: texte(pr.created_at) });
  }
  const duRail = issues.flatMap((issue) => {
    if (issue.pull_request !== undefined || typeof issue.number !== "number") return [];
    const labels = liste(issue.labels).flatMap(({ name }) => (typeof name === "string" ? [name] : []));
    return [{ numero: issue.number, titre: texte(issue.title), url: texte(issue.html_url), creeLe: texte(issue.created_at), labels }];
  });
  // La base ne se lit que si un ticket est en pass : c'est le seul que sa couleur touche.
  let base: EtatDeLaBase | null = null;
  if (duRail.some(({ numero, labels }) => labels.includes("in-pass") && livrees.has(numero))) {
    const branche = objet(await lire(`/repos/${depot}`))?.default_branch;
    if (typeof branche === "string") base = etatDeLaBaseGithub(liste(objet(await lire(`/repos/${depot}/commits/${encodeURIComponent(branche)}/check-runs?per_page=100`))?.check_runs));
  }
  const tickets: TicketSurGithub[] = [];
  for (const { numero, titre, url, creeLe, labels } of duRail) {
    const pr = livrees.get(numero) ?? null;
    const issueLue: IssueLue = { state: "open", labels, pr: pr === null ? null : { state: "open", merged: false } };
    const label = labelDeMiseDeCote(labels);
    const miseDeCote = label === null ? undefined : miseDeCoteDe(depot, label, await toutesLesPages(lire, `/repos/${depot}/issues/${numero}/comments`));
    const dit = etatDuTicket(issueLue, base);
    const etat = miseDeCote !== undefined ? MOT_MIS_DE_COTE : dit === null ? MOT_EN_FILE : MOT_DE_L_ETAT[dit];
    const prise = TENUS.has(etat)
      ? tenantDeLIssue(liste(await lire(`/repos/${depot}/issues/${numero}/comments?per_page=100`)), liste(await lire(`/repos/${depot}/issues/${numero}/events?per_page=100`)))
      : null;
    tickets.push({ ticket: numero, titre, url, etat, priorite: prioriteDe(labels), creeLe, pr, prise, ...(miseDeCote === undefined ? {} : { miseDeCote }) });
  }
  return { lu, tickets };
}

// Une heure comme le tableau l'écrit dans ses lignes : `2026-11-04 02:58 UTC` (bon.ts, `HEURE_EN`).
const heureEn = (iso: string) => `${new Date(iso).toISOString().slice(0, 16).replace("T", " ")} UTC`;

// La ligne `status` d'un ticket (`  #<ticket>  <état>  <priorité>  <détail>  <titre>`), dans la forme que les bons du
// rail découpent (bon.ts, `FORMES`) : qui le tient et depuis sa prise, qui l'a cuisiné et depuis sa PR, et, en attente,
// depuis l'ouverture de son issue — GitHub ne date pas son entrée sur le rail sans lire son historique. Aucune
// pour un mot dont la forme n'a pas de détail (WAITING, base rouge), ni pour un ticket dont la station n'est pas lue :
// le bon dit alors ce que la file ne dit pas, plutôt qu'une ligne brute.
function ligneDuTicket({ ticket, etat, priorite, titre, creeLe, pr, prise }: TicketSurGithub): string | null {
  const prio = priorite === null ? "-" : `prio:${priorite}`;
  const ecrire = (mot: string, detail: string) => `  #${ticket}  ${mot}  ${prio}  ${detail}  ${titre}`;
  if (etat === MOT_EN_FILE && creeLe !== "") return ecrire("queued", `since ${heureEn(creeLe)}`);
  if (etat === "pris" && prise !== null) return ecrire("taken", `by ${prise.station} since ${heureEn(prise.le)}`);
  if (etat === "en pass" && prise !== null && pr !== null && pr.le !== "") return ecrire("in pass", `since ${heureEn(pr.le)}, cooked by ${prise.station}`);
  return null;
}

// Ce que la cuisine fait du ticket, en une ligne de sa carte (faits.ts, `direEnCeMoment`) : pris, son cook cuisine depuis
// sa prise ; en pass, sa PR attend d'être jugée et mergée.
function activiteDe({ etat, pr, prise }: TicketSurGithub): { activite?: { fait: string; cible: string | null; depuis: string } | null } {
  if (etat === "pris") return { activite: prise === null ? null : { fait: "cooking", cible: null, depuis: prise.le } };
  if ((etat === "en pass" || etat === "base rouge") && pr !== null) return { activite: pr.le === "" ? null : { fait: "awaiting review and merge", cible: `PR #${pr.numero}`, depuis: pr.le } };
  return {};
}

// Les mots d'état comptés sur la ligne `rail` de `status`, dans son ordre et ses mots.
const COMPTES: readonly (readonly [string, string])[] = [["pris", "taken"], ["en pass", "in pass"], ["base rouge", "base red"], ["WAITING", "WAITING"], ["en attente", "queued"], ["86", "set aside"]];

// Le tableau lu, dont le rail et les cooks sont ceux de GitHub : ses tickets dans l'ordre du service — la priorité, puis
// le plus ancien —, les lignes de leurs bons, ses compteurs, et ses stations d'après leurs prises et leurs signes de vie
// (#2358) — rien des stations que le tableau figé de l'ancien chemin disait. `stationsSurGithub` le marque : l'onglet
// Cooks les montre toutes par la même règle, et dit quand leurs signes de vie ne se lisent pas. Un ticket mis de côté
// attend le chef : il entre dans `attend` avec ce qui le met de côté, à la place de ce que le tableau figé en disait (ticket 2075).
export function avecLeRail(lu: TableauLu, { lu: luLe, tickets }: RailSurGithub, signes: SignesDeVie = SIGNES_PAS_LUS): TableauLu {
  const ranges = [...tickets].sort((a, b) => (a.priorite ?? Number.POSITIVE_INFINITY) - (b.priorite ?? Number.POSITIVE_INFINITY) || a.ticket - b.ticket);
  const cooks: (Cook & { le: string })[] = ranges.flatMap(({ ticket, titre, prise }) => (prise === null ? [] : [{ ticket, titre, station: prise.station, le: prise.le }]));
  const avant = lu.faits ?? {};
  const compteurs = objet(avant.compteurs) ?? {};
  const nombre = (...mots: string[]) => ranges.filter(({ etat }) => mots.includes(etat)).length;
  const { cuisineOisive: _oisive, agents: _agents, ...gardes } = avant;
  const misDeCote = ranges.flatMap(({ ticket, titre, url, miseDeCote }) => (miseDeCote === undefined ? [] : [{ ticket, titre, url, miseDeCote }]));
  const attend = misDeCote.length === 0 ? {} : { attend: [...(Array.isArray(gardes.attend) ? (gardes.attend as unknown[]) : []).filter((entree) => !misDeCote.some(({ ticket }) => ticket === objet(entree)?.ticket)), ...misDeCote] };
  // Les lignes de `status` que le rail de GitHub remplace : celles du rail et des cooks dites de GitHub ; celle des
  // stations déclarées à l'ancien chemin — qui n'en lance plus aucun cook — retirée.
  const dits = COMPTES.flatMap(([mot, dit]) => (nombre(mot) === 0 ? [] : [`${nombre(mot)} ${dit}`]));
  const rubriques = lu.cuisine.rubriques.flatMap((rubrique) => {
    if (rubrique.titre === "stations") return [];
    if (rubrique.titre === "rail") return [{ titre: "rail", lignes: [dits.length === 0 ? "0 on the rail" : dits.join(" · ")] }];
    if (rubrique.titre === "cooks") return [{ titre: "cooks", lignes: [cooks.length === 0 ? "none running" : `${cooks.length} running`] }];
    return [rubrique];
  });
  return {
    ...lu,
    // Le rail montré est celui que l'app vient de lire sur GitHub : son âge (`publieLe`, ticket 2054) est celui de cette
    // lecture, pas celui du tableau que la box publie.
    etatLuLe: luLe,
    cuisine: { ...lu.cuisine, rubriques },
    faits: {
      ...gardes,
      // Retenue, la cuisine l'est par l'ancien chemin, que la boucle de GitHub seul ne lit pas : elle prend, cuit et merge.
      // L'arrêt du chef et une cuisine éteinte restent dits tels quels.
      ...(gardes.etat === "retenue" ? { etat: "ouverte" } : {}),
      lu: luLe,
      compteurs: { livres24h: 0, attend: 0, ...compteurs, rail: ranges.length, auTravail: nombre("pris"), aLaPass: nombre("en pass", "base rouge") },
      rail: ranges.map((ticket) => ({
        ticket: ticket.ticket,
        etat: ticket.etat,
        titre: ticket.titre,
        url: ticket.url,
        ...(ticket.prise === null ? {} : { station: ticket.prise.station }),
        // Depuis quand il est dans sa colonne : sa prise s'il est pris, sa PR s'il est en pass.
        ...(ticket.etat === "pris" && ticket.prise !== null ? { depuis: ticket.prise.le } : {}),
        ...((ticket.etat === "en pass" || ticket.etat === "base rouge") && ticket.pr !== null && ticket.pr.le !== "" ? { depuis: ticket.pr.le } : {}),
        ...activiteDe(ticket),
      })),
      cooks: cooks.map(({ ticket, titre, station }) => ({ ticket, titre, station })),
      ...attend,
      stations: stationsDeGithub(cooks, "lus" in signes ? signes.lus : null, lu.depot, Date.parse(luLe)),
      stationsSurGithub: { illisible: "illisible" in signes ? signes.illisible : null },
      agents: [],
    },
    lignesDuRail: ranges.flatMap((ticket) => {
      const ligne = ligneDuTicket(ticket);
      return ligne === null ? [] : [{ ticket: ticket.ticket, priorite: ticket.priorite, ligne }];
    }),
  };
}

// La lecture du tableau d'un projet, son rail tiré de GitHub : sur GitHub seul, ses tickets et ses cooks ; sinon, le
// tableau de la box, ses états refaits de GitHub (ticket 2059). `interrupteurs` garde le dernier interrupteur lu de chaque
// dépôt : un `projet.json` que GitHub ne rend pas, cette fois, ne fait pas repasser un projet sur l'ancien chemin. Sur
// GitHub seul, une lecture de GitHub qui échoue est une lecture du tableau ratée : la vue garde le dernier rail lu, et
// dit depuis quand il est périmé — jamais le rail figé de l'ancien chemin. `signes` : les signes de vie des stations
// du compte, demandés seulement pour un projet sur GitHub seul.
export async function avecLeRailGithub(lu: LectureDuTableauDuDepot, appeler: AppelGitHub, memoire?: MemoireDesLectures, interrupteurs: Map<string, boolean> = new Map(), signes: () => Promise<SignesDeVie> = async () => SIGNES_PAS_LUS): Promise<LectureDuTableauDuDepot> {
  if (!lu.lu) return lu;
  const lecteur = memoire === undefined ? appeler : lectureConditionnelle(appeler, memoire);
  const interrupteur = await interrupteurDuDepot(lu.depot, lecteur);
  if (interrupteur !== null) interrupteurs.set(lu.depot, interrupteur);
  if (interrupteurs.get(lu.depot) !== true) return avecLesEtatsGithub(lu, appeler, memoire);
  try {
    // Les durées des cartes se comptent jusqu'à la lecture du tableau par l'app : celle-ci, à quelques secondes près.
    return avecLeRail(lu, await lireLeRailSurGithub({ depot: lu.depot, appeler: lecteur, maintenant: () => new Date(lu.luLe) }), await signes());
  } catch (erreur) {
    const dit = (erreur instanceof Error ? erreur.message : String(erreur)).split("\n")[0]?.replace(/[.\s]+$/, "") ?? "";
    return { lu: false, depot: lu.depot, luLe: lu.luLe, raison: `The rail of ${lu.depot} was not read from GitHub: ${dit}.` };
  }
}
