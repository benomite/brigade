// Pourquoi les tickets en file du rail ne partent pas (#3433). Le chef demandait au second « pourquoi les 4 tickets du
// rail ne partent pas ? » : le rail montrait les tickets, jamais pourquoi rien ne bougeait. Une attente normale d'une
// panne, le chef ne les distinguait pas.
//
// Ce module est l'unique source de la phrase : le rail de l'app (vue/rail/github.ts) et `brigade <project> status`
// (`status.ts`) l'appellent et n'en écrivent aucune. Il ne lit rien : il juge ce qu'on lui donne — les tickets du rail,
// les stations du compte —, et rend la première raison
// qui tient, dans cet ordre :
//   1 aucune station ne sert le projet            2 ses stations sont arrêtées     3 ses stations sont hors ligne
//   4 elles attendent le quota de GitHub          5 le plafond de cooks est atteint
//   6 une livraison attend la pass                7 chaque ticket en file en attend un autre
//   7' chaque ticket en file attend un ticket en WAITING (#3761) : il part quand un tiers l'aura servi ;
//      seul sur le rail depuis plus d'`UNE_HEURE_MS`, la phrase le nomme, et le ticket qu'il attend
//   8 attente normale (un cook le prend dans les minutes), ou plus longue que d'ordinaire après `DELAI_MS`.
// Les raisons 1 à 3 ne se lèvent pas seules : leur phrase nomme le geste qui les lève (`MOTS_DU_GESTE`). Les raisons 4 à 8
// se résolvent seules, et le disent.
//
// Aucune ligne quand rien n'attend ou qu'un cook tourne. Ce que le rail ne dit pas de la station (le plafond, que
// GitHub ne publie pas) est donné par l'appelant ; l'inconnu ne fait jamais une raison.
import { lignesHorsCode } from "../epique.ts";
import { disponible, retenueJusqua } from "../enregistrement-station/contrat.ts";
import { stationDe } from "../stations-github/stations.ts";
import { DELAI_MS, dureeCourte, MOTS_DU_GESTE, servantesDe, type Geste, type StationsLues } from "./stations.ts";

export type Raison = "aucune-station" | "arretee" | "hors-ligne" | "quota-github" | "plafond" | "pass" | "autre-ticket" | "waiting" | "normale";

// Un ticket du rail, dans l'état que sa carte dit : en file, pris (un cook tourne) ou en pass.
// `entreLe` : l'instant où il est entré dans la file (`fire` posé), nul quand GitHub ne le dit pas.
// `depend` : les tickets dont son corps dit dépendre (`Depends on #N`, ou en toutes lettres : `dependancesDuCorps`).
// `attentes` (#3763) : celles que la porte de prise applique, chacune avec sa source — le corps (et la phrase d'où elle est
// lue), la fiche, ou l'arrêt d'un cook —, sur un ticket ouvert, sur le rail ou non ; absente quand l'appelant ne les a pas
// lues : la carte dit alors l'attente sans sa source, comme avant.
// `commentairesLus` : faux quand les commentaires du ticket — sa fiche, les arrêts de ses cooks — ne se lisent pas.
export type TicketDuRail = { ticket: number; etat: "queued" | "taken" | "pass"; entreLe: string | null; depend: readonly number[]; attentes?: readonly AttenteSourcee[]; commentairesLus?: boolean };

// Un ticket `fire` en WAITING (#3761) : la cuisine ne le prend pas, il attend un tiers — `qui`, nul quand son attente ne
// se lit pas. Il n'est pas sur le rail, mais un ticket en file qui l'attend le dit : le 2026-11-17, #3734 a attendu cinq
// heures #1912, en WAITING sur un collaborateur depuis dix jours, et le rail le disait au repos.
export type TicketEnWaiting = { ticket: number; qui: string | null };

// Une attente que la cuisine applique, et d'où elle la lit (#3763) : le 2026-11-17, #3734 a été retenu cinq heures par une
// phrase de son corps que seul le journal de la station disait, sa carte disant `awaiting: none`.
export type SourceDAttente = "corps" | "fiche" | "arret";
export type AttenteSourcee = { ticket: number; source: SourceDAttente; phrase?: string };

// `stations` : les stations du projet que la raison nomme (la phrase les nomme aussi) ; vide quand elle n'en nomme aucune.
export type AttenteDuRail = { raison: Raison; phrase: string; geste: Geste | null; stations: string[] };

// La limite que GitHub impose au compte de la station (#3684) : son heure de reprise (ISO), dite en UTC.
export type LimiteDite = { backAt: string };
const hhmmUtc = (iso: string) => new Date(iso).toISOString().slice(11, 16);
const phraseDeLaLimite = ({ backAt }: LimiteDite) => `GitHub is rate-limiting the station, so no cook can start before about ${hhmmUtc(backAt)} UTC. It resolves by itself.`;


// Les phrases : une par raison, fixes. Les trois premières nomment leur geste ; les suivantes disent qu'elles passent seules.
// Celles d'une station le nomment (#3472) : un FAULT dit de quelle station il parle.
const nommees = (stations: readonly string[]) => (stations.length === 0 ? "The station" : `${stations.length > 1 ? "Stations" : "Station"} ${stations.join(", ")}`);
const sont = (stations: readonly string[]) => (stations.length > 1 ? "are" : "is");
const PHRASES: Record<Exclude<Raison, "normale">, (stations: readonly string[]) => string> = {
  "aucune-station": () => `No station serves this project, so no cook can start. ${MOTS_DU_GESTE["ajouter-a-une-station"]}.`,
  arretee: (stations) => `${nommees(stations)} ${sont(stations)} stopped, so no cook can start. ${MOTS_DU_GESTE["demarrer-la-station"]}.`,
  "hors-ligne": (stations) => `${nommees(stations)} ${sont(stations)} offline or out of quota, so no cook can start. ${MOTS_DU_GESTE["demarrer-la-station"]}.`,
  "quota-github": () => "The station waits for the GitHub quota before it starts a cook. It resolves by itself.",
  plafond: () => "The station has reached its cook cap: a cook starts as soon as a place frees up. It resolves by itself.",
  pass: () => "The pass is judging a delivery: the queue starts once it is done. It resolves by itself.",
  "autre-ticket": () => "Every queued ticket waits for another ticket: they start once it merges. It resolves by itself.",
  waiting: () => "Every queued ticket waits for a ticket in WAITING on a third party: it starts once that ticket is served.",
};

// Seul sur le rail et retenu depuis plus d'une heure, le ticket se nomme, avec ce qu'il attend (#3761).
export const UNE_HEURE_MS = 60 * 60_000;
const GESTES: Partial<Record<Raison, Geste>> = { "aucune-station": "ajouter-a-une-station", arretee: "demarrer-la-station", "hors-ligne": "demarrer-la-station" };

// Attente normale, ou plus longue que d'ordinaire à partir de `DELAI_MS` ; sans l'instant d'entrée, la durée n'est pas dite.
function phraseNormale(depuis: string | null, maintenant: number): string {
  const ms = depuis === null ? Number.NaN : maintenant - Date.parse(depuis);
  if (Number.isNaN(ms)) return "A cook takes the ticket within minutes. It resolves by itself.";
  const duree = dureeCourte(ms);
  return ms >= DELAI_MS
    ? `The wait is longer than usual: the oldest queued ticket has waited ${duree} and no reason is found. It resolves by itself.`
    : `Normal wait: a cook takes the ticket within minutes (the oldest has waited ${duree}). It resolves by itself.`;
}

// Les tickets dont un ticket en file attend l'avancée : ses attentes lues (`attentes`) ou, sans elles, ceux de `depend`,
// quand ils sont sur le rail — en file, qu'un cook tient ou que la pass juge. Un ticket hors du rail n'est pas lu, et rien
// n'est dit de lui : le choix du chef sur #3810, verrouillé par ligne-carte-hors-rail.test.ts.
// Un ticket en WAITING (`waiting`) en est aussi : il retient la carte, et sa ligne le dit (#3761).
function retenus(carte: TicketDuRail, tickets: readonly TicketDuRail[], waiting: readonly TicketEnWaiting[] = []): Set<number> {
  const sur = new Set([...tickets, ...waiting].map(({ ticket }) => ticket));
  const lues = carte.attentes?.map(({ ticket }) => ticket) ?? carte.depend;
  return new Set(lues.filter((n) => n !== carte.ticket && sur.has(n)));
}

// Une attente et sa source, en anglais : « waits for #N — read from the body: '<phrase>' », « … — read from the card »,
// « … — read from a cook's stop ». Sur un ticket en WAITING (#3761) : « waits for `#N`, WAITING on <qui> — … ».
const SOURCES: Record<SourceDAttente, string> = { corps: "the body", fiche: "the card", arret: "a cook's stop" };
export const direLAttente = (attente: AttenteSourcee): string => direLAttenteParmi(attente, []);
function direLAttenteParmi({ ticket, source, phrase }: AttenteSourcee, waiting: readonly TicketEnWaiting[]): string {
  const enWaiting = waiting.find((sien) => sien.ticket === ticket);
  const attendu = enWaiting === undefined ? `#${ticket}` : `\`#${ticket}\`, WAITING on ${enWaiting.qui ?? "a third party"}`;
  return `waits for ${attendu} — read from ${SOURCES[source]}${source === "corps" && phrase ? `: '${phrase}'` : ""}`;
}
const COMMENTAIRES_ILLISIBLES = "its card and its cooks' stops could not be read on GitHub";

// La ligne d'une carte en file qui ne partira pas la prochaine (#3763) : chaque attente qui la retient, et d'où elle est
// lue — « waits for #N — read from the body: '<phrase>' », « … read from the card », « … read from a cook's stop » —, et,
// ses commentaires illisibles, qu'ils ne se sont pas lus : jamais une carte dite libre faute de les avoir lus. Sans
// `attentes`, celles de `depend` sont celles du corps, sans leur phrase. Aucune ligne sans attente ouverte : c'est la
// carte qui part ensuite, ou une carte libre.
export function ligneDeLaCarte(carte: TicketDuRail, tickets: readonly TicketDuRail[], waiting: readonly TicketEnWaiting[] = []): string | null {
  const dites = [...new Set(attentesDites(carte, tickets, waiting).map((attente) => direLAttenteParmi(attente, waiting)))];
  if (carte.etat === "queued" && carte.commentairesLus === false) dites.push(COMMENTAIRES_ILLISIBLES);
  return dites.length === 0 ? null : dites.join("; ");
}

// Les attentes que la ligne d'une carte en file dit : celles qui la retiennent.
function attentesDites(carte: TicketDuRail, tickets: readonly TicketDuRail[], waiting: readonly TicketEnWaiting[] = []): AttenteSourcee[] {
  if (carte.etat !== "queued") return [];
  const retenue = retenus(carte, tickets, waiting);
  const lues = carte.attentes ?? carte.depend.map((ticket): AttenteSourcee => ({ ticket, source: "corps" }));
  return lues.filter(({ ticket }) => retenue.has(ticket));
}

// Les lignes des cartes en file, par ticket ; `waiting` : les tickets en WAITING qu'elles peuvent attendre (#3761).
export function lignesDesCartes(tickets: readonly TicketDuRail[], waiting: readonly TicketEnWaiting[] = []): Record<number, string> {
  const lignes: Record<number, string> = {};
  for (const carte of tickets) {
    const ligne = ligneDeLaCarte(carte, tickets, waiting);
    if (ligne !== null) lignes[carte.ticket] = ligne;
  }
  return lignes;
}

// Les tickets qu'attend chaque carte dont la ligne dit une attente, par ticket (#3763) : ceux de ses attentes, jamais un
// numéro relu de la phrase du corps qu'elle cite. La carte de l'app en tire ses liens (app/src/ligne-carte.ts).
export function attendusDesCartes(tickets: readonly TicketDuRail[], waiting: readonly TicketEnWaiting[] = []): Record<number, number[]> {
  const attendus: Record<number, number[]> = {};
  for (const carte of tickets) {
    const siens = [...new Set(attentesDites(carte, tickets, waiting).map(({ ticket }) => ticket))];
    if (siens.length > 0) attendus[carte.ticket] = siens;
  }
  return attendus;
}

// Pourquoi la file ne part pas, ou null : rien en file, ou un cook qui tourne.
// `plafondAtteint` : la station a pris tous ses cooks ; GitHub ne le publie pas, l'appelant le dit quand il le sait.
// `waiting` : les tickets `fire` en WAITING (#3761), absents quand l'appelant ne les a pas lus.
export function expliquerLAttente(options: { depot: string; tickets: readonly TicketDuRail[]; stations: StationsLues; plafondAtteint: boolean; maintenant: number; limite?: LimiteDite | null; waiting?: readonly TicketEnWaiting[] }): AttenteDuRail | null {
  const { depot, tickets, maintenant } = options;
  const enFile = tickets.filter(({ etat }) => etat === "queued");
  if (enFile.length === 0 || tickets.some(({ etat }) => etat === "taken")) return null;
  const dit = (raison: Exclude<Raison, "normale">, stations: readonly string[] = [], phrase?: string): AttenteDuRail => ({ raison, phrase: phrase ?? PHRASES[raison](stations), geste: GESTES[raison] ?? null, stations: [...stations] });
  const noms = (lesquelles: readonly { name: string }[]) => [...new Set(lesquelles.map(({ name }) => stationDe(name)))].sort();
  // Des stations qui ne se lisent pas ne font ni la raison 1, ni 2, ni 3, ni 4 ; sous la limite de GitHub, c'est elle qui les rend illisibles.
  if ("illisibles" in options.stations) {
    if (options.limite != null) return dit("quota-github", [], phraseDeLaLimite(options.limite));
  } else {
    const servantes = servantesDe(options.stations.lues, depot, maintenant);
    if (servantes.length === 0) return dit("aucune-station");
    const arretee = ({ stoppedAt, lastSeen }: (typeof servantes)[number]) => stoppedAt !== null && Date.parse(stoppedAt) >= Date.parse(lastSeen);
    const actives = servantes.filter((station) => !arretee(station));
    // Une station arrêtée n'est pas une panne tant qu'une autre du projet n'est pas arrêtée : seules les actives sont nommées.
    if (actives.length === 0) return dit("arretee", noms(servantes));
    const enLigne = actives.filter((station) => disponible(station, maintenant));
    // Des stations muettes pendant que GitHub limite le compte ne sont pas hors ligne : elles attendent la reprise.
    const limite = options.limite ?? null;
    if (enLigne.length === 0) return limite === null ? dit("hors-ligne", noms(actives)) : dit("quota-github", [], phraseDeLaLimite(limite));
    if (enLigne.every((station) => retenueJusqua(station, maintenant) !== null)) return dit("quota-github", [], limite === null ? undefined : phraseDeLaLimite(limite));
  }
  if (options.plafondAtteint) return dit("plafond");
  if (tickets.some(({ etat }) => etat === "pass")) return dit("pass");
  const waiting = options.waiting ?? [];
  if (enFile.every((carte) => retenus(carte, tickets, waiting).size > 0)) {
    const enWaiting = new Set(waiting.map(({ ticket }) => ticket));
    if (!enFile.every((carte) => [...retenus(carte, tickets, waiting)].some((n) => enWaiting.has(n)))) return dit("autre-ticket");
    return dit("waiting", [], phraseDuSeul(tickets, waiting, maintenant));
  }
  const plusAncien = enFile.map(({ entreLe }) => entreLe).filter((le): le is string => le !== null && !Number.isNaN(Date.parse(le))).sort((a, b) => Date.parse(a) - Date.parse(b))[0] ?? null;
  return { raison: "normale", phrase: phraseNormale(plusAncien, maintenant), geste: null, stations: [] };
}

// Le seul ticket du rail, retenu par un ticket en WAITING depuis plus d'`UNE_HEURE_MS` (#3761) : la phrase le nomme, et
// ce qu'il attend — la ligne de sa carte. Sous l'heure, ou sans l'instant de son entrée, la phrase commune.
function phraseDuSeul(tickets: readonly TicketDuRail[], waiting: readonly TicketEnWaiting[], maintenant: number): string | undefined {
  const [seul] = tickets;
  if (seul === undefined || tickets.length !== 1 || seul.entreLe === null) return undefined;
  const ms = maintenant - Date.parse(seul.entreLe);
  if (!(ms > UNE_HEURE_MS)) return undefined;
  return `#${seul.ticket} has not been able to leave for ${dureeCourte(ms)}: it ${ligneDeLaCarte(seul, tickets, waiting)}.`;
}

// Les lignes que `status` écrit, la même chose que l'app dit : la phrase, au-dessus de la file, puis la ligne de chaque carte.
// Le titre est celui des rubriques de `status` (onze colonnes).
// Aucune quand rien n'attend et qu'aucune carte n'est derrière une autre. Sans phrase (un cook tourne, comme sur le rail),
// les lignes des cartes se disent seules.
export function lignesDeStatus(phrase: string | null, cartes: Readonly<Record<number, string>>): string[] {
  const siennes = Object.entries(cartes).sort(([a], [b]) => Number(a) - Number(b)).map(([ticket, ligne]) => `  #${ticket}  ${ligne}`);
  return phrase === null ? siennes : [`${"queue wait".padEnd(11)}${phrase}`, ...siennes];
}

// Les issues dont un corps dit dépendre, chacune avec la phrase d'où elle est lue (#3763) : les numéros d'une ligne
// `Depends on #N` (un ou plusieurs, séparés par une virgule, `and` ou `&`), et rien d'autre (#3865) : une prose, une
// citation (`>`) ou une décision collée qui nomme un ticket ne le fait jamais attendre. La phrase est sa ligne, sans
// puce, coupée à `PHRASE_MAX` caractères.
const PHRASE_MAX = 80;
const phraseDe = (ligne: string) => {
  const nette = ligne.replace(/^[ \t>*-]+/, "").trim();
  return nette.length > PHRASE_MAX ? `${nette.slice(0, PHRASE_MAX - 1)}…` : nette;
};
export function attentesDuCorps(corps: string): { ticket: number; phrase: string }[] {
  const lues: { ticket: number; phrase: string }[] = [];
  const vus = new Set<number>();
  const lire = (liste: string, ligne: string) => {
    for (const [, numero] of liste.matchAll(/#(\d+)/g)) {
      if (vus.has(Number(numero))) continue;
      vus.add(Number(numero));
      lues.push({ ticket: Number(numero), phrase: phraseDe(ligne) });
    }
  };
  for (const { texte: ligne } of lignesHorsCode(corps)) {
    for (const [, liste = ""] of ligne.matchAll(/^[ \t*-]*Depends on[ \t]+(#\d+(?:[ \t]*(?:,|and|&)?[ \t]*#\d+)*)/gim)) lire(liste, ligne);
  }
  return lues;
}

// Les issues dont un corps dit dépendre (`attentesDuCorps`), sans leur phrase. Celle de la porte de prise
// (`brigade-github.ts`) comme celle du rail.
export function dependancesDuCorps(corps: string): number[] {
  return attentesDuCorps(corps).map(({ ticket }) => ticket);
}
