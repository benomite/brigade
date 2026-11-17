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
import { lignesHorsCode } from "../epique.ts";
import { stationDe } from "../stations-github/stations.ts";
import { DELAI_MS, dureeCourte, MOTS_DU_GESTE, type Geste, type StationsLues } from "../rail-bloque/rail-bloque.ts";

export type Raison = "aucune-station" | "arretee" | "hors-ligne" | "quota-github" | "plafond" | "pass" | "autre-ticket" | "normale";

// Un ticket du rail, dans l'état que sa carte dit : en file, pris (un cook tourne) ou en pass.
// `entreLe` : l'instant où il est entré dans la file (`fire` posé), nul quand GitHub ne le dit pas.
// `depend` : les tickets dont son corps dit dépendre (`Depends on #N`, ou en toutes lettres : `dependancesDuCorps`).
// `attentes` (#3763) : les mêmes, chacune avec sa source — le corps (et la phrase d'où elle est lue), la fiche, ou l'arrêt
// d'un cook —, absente quand l'appelant ne les a pas lues : la carte dit alors l'attente sans sa source, comme avant.
// `commentairesLus` : faux quand les commentaires du ticket — sa fiche, les arrêts de ses cooks — ne se lisent pas.
export type TicketDuRail = { ticket: number; etat: "queued" | "taken" | "pass"; entreLe: string | null; depend: readonly number[]; attentes?: readonly AttenteSourcee[]; commentairesLus?: boolean };

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

const memeDepot = (a: string, b: string) => a.toLowerCase() === b.toLowerCase();

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

// Les tickets dont un ticket en file attend l'avancée, parmi ceux du rail — en file, qu'un cook tient ou que la pass juge.
// Un ticket hors du rail n'est pas lu : rien n'est dit de lui.
function retenus(carte: TicketDuRail, tickets: readonly TicketDuRail[]): Set<number> {
  const sur = new Set(tickets.map(({ ticket }) => ticket));
  return new Set(carte.depend.filter((n) => n !== carte.ticket && sur.has(n)));
}

// Une attente et sa source, en anglais : « waits for #N — read from the body: '<phrase>' », « … — read from the card »,
// « … — read from a cook's stop ».
const SOURCES: Record<SourceDAttente, string> = { corps: "the body", fiche: "the card", arret: "a cook's stop" };
export function direLAttente({ ticket, source, phrase }: AttenteSourcee): string {
  return `waits for #${ticket} — read from ${SOURCES[source]}${source === "corps" && phrase ? `: '${phrase}'` : ""}`;
}
// Ce qui relit une attente dite par `direLAttente`, son ticket en groupe : la carte de l'app en tire ses liens
// (app/src/ligne-carte.ts). Une attente ouvre la ligne ou suit `; ` : un `#N` de la phrase citée n'en est pas une.
export const ATTENTE_DITE = /(?:^|; )waits for #(\d+) — read from /g;
const COMMENTAIRES_ILLISIBLES = "its card and its cooks' stops could not be read on GitHub";

// La ligne d'une carte en file qui ne partira pas la prochaine (#3763) : chaque attente qui la retient, et d'où elle est
// lue — « waits for #N — read from the body: '<phrase>' », « … read from the card », « … read from a cook's stop » —, et,
// ses commentaires illisibles, qu'ils ne se sont pas lus : jamais une carte dite libre faute de les avoir lus. Sans
// `attentes`, celles de `depend` sont celles du corps, sans leur phrase. Aucune ligne sans attente ouverte : c'est la
// carte qui part ensuite, ou une carte libre.
export function ligneDeLaCarte(carte: TicketDuRail, tickets: readonly TicketDuRail[]): string | null {
  if (carte.etat !== "queued") return null;
  const retenue = retenus(carte, tickets);
  const lues = carte.attentes ?? carte.depend.map((ticket): AttenteSourcee => ({ ticket, source: "corps" }));
  const dites = [...new Set(lues.filter(({ ticket }) => retenue.has(ticket)).map(direLAttente))];
  if (carte.commentairesLus === false) dites.push(COMMENTAIRES_ILLISIBLES);
  return dites.length === 0 ? null : dites.join("; ");
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
export function expliquerLAttente(options: { depot: string; tickets: readonly TicketDuRail[]; stations: StationsLues; plafondAtteint: boolean; maintenant: number; limite?: LimiteDite | null }): AttenteDuRail | null {
  const { depot, tickets, maintenant } = options;
  const enFile = tickets.filter(({ etat }) => etat === "queued");
  if (enFile.length === 0 || tickets.some(({ etat }) => etat === "taken")) return null;
  const dit = (raison: Exclude<Raison, "normale">, stations: readonly string[] = [], phrase?: string): AttenteDuRail => ({ raison, phrase: phrase ?? PHRASES[raison](stations), geste: GESTES[raison] ?? null, stations: [...stations] });
  const noms = (lesquelles: readonly { name: string }[]) => [...new Set(lesquelles.map(({ name }) => stationDe(name)))].sort();
  // Des stations qui ne se lisent pas ne font ni la raison 1, ni 2, ni 3, ni 4 ; sous la limite de GitHub, c'est elle qui les rend illisibles.
  if ("illisibles" in options.stations) {
    if (options.limite != null) return dit("quota-github", [], phraseDeLaLimite(options.limite));
  } else {
    const servantes = options.stations.lues.filter(({ selection }) => selection?.some((choisi) => memeDepot(choisi, depot)) === true);
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
  if (enFile.every((carte) => retenus(carte, tickets).size > 0)) return dit("autre-ticket");
  const plusAncien = enFile.map(({ entreLe }) => entreLe).filter((le): le is string => le !== null && !Number.isNaN(Date.parse(le))).sort((a, b) => Date.parse(a) - Date.parse(b))[0] ?? null;
  return { raison: "normale", phrase: phraseNormale(plusAncien, maintenant), geste: null, stations: [] };
}

// Les lignes que `status` écrit, la même chose que l'app dit : la phrase, au-dessus de la file, puis la ligne de chaque carte.
// Le titre est celui des rubriques de `status` (onze colonnes).
// Aucune quand rien n'attend et qu'aucune carte n'est derrière une autre. Sans phrase (un cook tourne, comme sur le rail),
// les lignes des cartes se disent seules.
export function lignesDeStatus(phrase: string | null, cartes: Readonly<Record<number, string>>): string[] {
  const siennes = Object.entries(cartes).sort(([a], [b]) => Number(a) - Number(b)).map(([ticket, ligne]) => `  #${ticket}  ${ligne}`);
  return phrase === null ? siennes : [`${"queue wait".padEnd(11)}${phrase}`, ...siennes];
}

// Les tournures par lesquelles un corps dit, en toutes lettres, bâtir sur un autre ticket (#3622) : le 2026-11-15, sur
// secondes, trois écrans restylés « with the identity of #49 » sont partis en même temps que l'identité, et leur cook
// s'est arrêté. Chacune est suivie d'un ou plusieurs `#N` (séparés par une virgule, `and`, `&` ou `et`), sur la même
// ligne : « once #12 is done », « after #12 », « builds on #12 », « on top of #12 », « requires #12 », et leurs formes
// françaises (« une fois #12 fait », « après #12 », « avec l'identité de #49 »). Un `#N` cité entre backticks ou
// dans un bloc de code n'en est pas un, ni `autre-depot#N`.
const TOURNURES = [
  String.raw`(?:builds?|built|building)[ \t]+(?:up)?on(?:[ \t]+top[ \t]+of)?`,
  String.raw`on[ \t]+top[ \t]+of`,
  "once",
  "after",
  String.raw`with[ \t]+the[ \t]+(?:[\p{L}-]+[ \t]+){1,3}of`,
  String.raw`(?:requires?|needs?|depends?[ \t]+on|waits?[ \t]+(?:for|on)|blocked[ \t]+(?:by|on))`,
  String.raw`une[ \t]+fois(?:[ \t]+que)?`,
  "après",
  String.raw`avec[ \t]+(?:l['’]|la[ \t]+|le[ \t]+|les[ \t]+)(?:[\p{L}-]+[ \t]+){0,2}[\p{L}-]+[ \t]+d(?:e|u|es)`,
  String.raw`(?:repose|s['’]appuie|bâtit|construit)[ \t]+sur`,
  String.raw`d[ée]pend[ \t]+de`,
];
const NUMEROS = String.raw`#[1-9]\d*(?:[ \t]*(?:,|and|&|et)?[ \t]*#[1-9]\d*)*`;
const EN_TOUTES_LETTRES = new RegExp(String.raw`(?<![\p{L}\d_])(?:${TOURNURES.join("|")})[ \t]+(${NUMEROS})(?![\p{L}\d_])`, "giu");

// Les issues dont un corps dit dépendre, chacune avec la phrase d'où elle est lue (#3763) : les numéros d'une ligne
// `Depends on #N` (un ou plusieurs, séparés par une virgule, `and` ou `&`), puis ceux qu'une phrase dit attendre en
// toutes lettres (`TOURNURES`). La phrase est sa ligne, sans puce ni citation, coupée à `PHRASE_MAX` caractères.
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
  for (const ligne of corps.split("\n")) {
    for (const [, liste = ""] of ligne.matchAll(/^[ \t>*-]*Depends on[ \t]+(#\d+(?:[ \t]*(?:,|and|&)?[ \t]*#\d+)*)/gim)) lire(liste, ligne);
  }
  for (const { texte } of lignesHorsCode(corps)) {
    for (const [, liste = ""] of texte.replace(/`[^`]*`/g, "").matchAll(EN_TOUTES_LETTRES)) lire(liste, texte);
  }
  return lues;
}

// Les issues dont un corps dit dépendre (`attentesDuCorps`), sans leur phrase. Celle de la porte de prise
// (`brigade-github.ts`) comme celle du rail.
export function dependancesDuCorps(corps: string): number[] {
  return attentesDuCorps(corps).map(({ ticket }) => ticket);
}
