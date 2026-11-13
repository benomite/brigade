// Pourquoi les tickets en file du rail ne partent pas (#3433). Le chef demandait au second « pourquoi les 4 tickets du
// rail ne partent pas ? » : le rail montrait les tickets, jamais pourquoi rien ne bougeait. Une attente normale d'une
// panne, le chef ne les distinguait pas.
//
// Ce module est l'unique source de la phrase : le rail de l'app (vue/rail/github.ts) et `brigade <project> status`
// (`status.ts`) l'appellent et n'en écrivent aucune. Il ne lit rien : il juge ce qu'on lui donne — les tickets du rail,
// les stations du compte (la même lecture que le rail bloqué de #3358) —, et rend la première raison
// qui tient, dans cet ordre :
//   1 aucune station ne sert le projet            2 ses stations sont arrêtées     3 ses stations sont hors ligne
//   4 elles attendent le quota de GitHub          5 le plafond de cooks est atteint
//   6 une livraison attend la pass                7 chaque ticket en file en attend un autre
//   8 attente normale (un cook le prend dans les minutes), ou plus longue que d'ordinaire après `DELAI_MS`.
// Les raisons 1 à 3 ne se lèvent pas seules : leur phrase nomme le geste qui les lève (`MOTS_DU_GESTE`). Les raisons 4 à 8
// se résolvent seules, et le disent.
//
// Aucune ligne quand rien n'attend ou qu'un cook tourne. Ce que le rail ne dit pas de la station (le plafond, que
// GitHub ne publie pas) est donné par l'appelant ; l'inconnu ne fait jamais une raison.
import { disponible, retenueJusqua } from "../enregistrement-station/contrat.ts";
import { DELAI_MS, dureeCourte, MOTS_DU_GESTE, type Geste, type StationsLues } from "../rail-bloque/rail-bloque.ts";

export type Raison = "aucune-station" | "arretee" | "hors-ligne" | "quota-github" | "plafond" | "pass" | "autre-ticket" | "normale";

// Un ticket du rail, dans l'état que sa carte dit : en file, pris (un cook tourne) ou en pass.
// `entreLe` : l'instant où il est entré dans la file (`fire` posé), nul quand GitHub ne le dit pas.
// `depend` : les tickets dont son corps dit dépendre (`Depends on #N`).
export type TicketDuRail = { ticket: number; etat: "queued" | "taken" | "pass"; entreLe: string | null; depend: readonly number[] };

export type AttenteDuRail = { raison: Raison; phrase: string; geste: Geste | null };

const memeDepot = (a: string, b: string) => a.toLowerCase() === b.toLowerCase();

// Les phrases : une par raison, fixes. Les trois premières nomment leur geste ; les suivantes disent qu'elles passent seules.
const PHRASES: Record<Exclude<Raison, "normale">, string> = {
  "aucune-station": `No station serves this project, so no cook can start. ${MOTS_DU_GESTE["ajouter-a-une-station"]}.`,
  arretee: `The station is stopped, so no cook can start. ${MOTS_DU_GESTE["demarrer-la-station"]}.`,
  "hors-ligne": `The station is offline or out of quota, so no cook can start. ${MOTS_DU_GESTE["demarrer-la-station"]}.`,
  "quota-github": "The station waits for the GitHub quota before it starts a cook. It resolves by itself.",
  plafond: "The station has reached its cook cap: a cook starts as soon as a place frees up. It resolves by itself.",
  pass: "The pass is judging a delivery: the queue starts once it is done. It resolves by itself.",
  "autre-ticket": "Every queued ticket waits for another ticket: they start once it merges. It resolves by itself.",
};
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

// Les tickets dont un ticket en file attend l'avancée, parmi ceux du rail : ceux qui sont aussi en file (`apres`), et ceux
// qu'un cook tient ou que la pass juge (`fusion`). Un ticket hors du rail n'est pas lu : rien n'est dit de lui.
function attentes(carte: TicketDuRail, tickets: readonly TicketDuRail[]): { apres: number[]; fusion: number[] } {
  const sur = new Map(tickets.map((ticket) => [ticket.ticket, ticket]));
  const attendus = [...new Set(carte.depend)].filter((n) => n !== carte.ticket && sur.has(n)).sort((a, b) => a - b);
  return { apres: attendus.filter((n) => sur.get(n)?.etat === "queued"), fusion: attendus.filter((n) => sur.get(n)?.etat !== "queued") };
}

const liste = (numeros: readonly number[]) => numeros.map((n) => `#${n}`).join(", ");

// La ligne d'une carte en file qui ne partira pas la prochaine : « waiting for #N to merge » quand un ticket que la cuisine
// tient l'en retient, « after #N » quand elle est derrière des tickets eux aussi en file. Aucune sans dépendance ouverte :
// c'est la carte qui part ensuite, ou une carte libre.
export function ligneDeLaCarte(carte: TicketDuRail, tickets: readonly TicketDuRail[]): string | null {
  if (carte.etat !== "queued") return null;
  const { apres, fusion } = attentes(carte, tickets);
  if (fusion.length > 0) return `waiting for ${liste(fusion)} to merge`;
  return apres.length > 0 ? `after ${liste(apres)}` : null;
}

// Les lignes des cartes en file, par ticket.
export function lignesDesCartes(tickets: readonly TicketDuRail[]): Record<number, string> {
  const lignes: Record<number, string> = {};
  for (const carte of tickets) {
    const ligne = ligneDeLaCarte(carte, tickets);
    if (ligne !== null) lignes[carte.ticket] = ligne;
  }
  return lignes;
}

// Pourquoi la file ne part pas, ou null : rien en file, ou un cook qui tourne.
// `plafondAtteint` : la station a pris tous ses cooks ; GitHub ne le publie pas, l'appelant le dit quand il le sait.
export function expliquerLAttente(options: { depot: string; tickets: readonly TicketDuRail[]; stations: StationsLues; plafondAtteint: boolean; maintenant: number }): AttenteDuRail | null {
  const { depot, tickets, maintenant } = options;
  const enFile = tickets.filter(({ etat }) => etat === "queued");
  if (enFile.length === 0 || tickets.some(({ etat }) => etat === "taken")) return null;
  const dit = (raison: Exclude<Raison, "normale">): AttenteDuRail => ({ raison, phrase: PHRASES[raison], geste: GESTES[raison] ?? null });
  // Des stations qui ne se lisent pas ne font ni la raison 1, ni 2, ni 3, ni 4.
  if (!("illisibles" in options.stations)) {
    const servantes = options.stations.lues.filter(({ selection }) => selection?.some((choisi) => memeDepot(choisi, depot)) === true);
    if (servantes.length === 0) return dit("aucune-station");
    const arretee = ({ stoppedAt, lastSeen }: (typeof servantes)[number]) => stoppedAt !== null && Date.parse(stoppedAt) >= Date.parse(lastSeen);
    const actives = servantes.filter((station) => !arretee(station));
    if (actives.length === 0) return dit("arretee");
    const enLigne = actives.filter((station) => disponible(station, maintenant));
    if (enLigne.length === 0) return dit("hors-ligne");
    if (enLigne.every((station) => retenueJusqua(station, maintenant) !== null)) return dit("quota-github");
  }
  if (options.plafondAtteint) return dit("plafond");
  if (tickets.some(({ etat }) => etat === "pass")) return dit("pass");
  if (enFile.every((carte) => ligneDeLaCarte(carte, tickets) !== null)) return dit("autre-ticket");
  const plusAncien = enFile.map(({ entreLe }) => entreLe).filter((le): le is string => le !== null && !Number.isNaN(Date.parse(le))).sort((a, b) => Date.parse(a) - Date.parse(b))[0] ?? null;
  return { raison: "normale", phrase: phraseNormale(plusAncien, maintenant), geste: null };
}

// Les lignes que `status` écrit, la même chose que l'app dit : la phrase, au-dessus de la file, puis la ligne de chaque carte.
// Le titre est celui des rubriques de `status` (onze colonnes).
// Aucune quand rien n'attend et qu'aucune carte n'est derrière une autre. Sans phrase (un cook tourne, comme sur le rail),
// les lignes des cartes se disent seules.
export function lignesDeStatus(phrase: string | null, cartes: Readonly<Record<number, string>>): string[] {
  const siennes = Object.entries(cartes).sort(([a], [b]) => Number(a) - Number(b)).map(([ticket, ligne]) => `  #${ticket}  ${ligne}`);
  return phrase === null ? siennes : [`${"queue wait".padEnd(11)}${phrase}`, ...siennes];
}

// Les issues dont un corps dit dépendre : les numéros d'une ligne `Depends on #N` (un ou plusieurs, séparés par une
// virgule, `and` ou `&`). Celle de la porte de prise (`brigade-github.ts`) comme celle du rail.
export function dependancesDuCorps(corps: string): number[] {
  const numeros = new Set<number>();
  for (const [, liste = ""] of corps.matchAll(/^[ \t>*-]*Depends on[ \t]+(#\d+(?:[ \t]*(?:,|and|&)?[ \t]*#\d+)*)/gim)) {
    for (const [, numero] of liste.matchAll(/#(\d+)/g)) numeros.add(Number(numero));
  }
  return [...numeros];
}
