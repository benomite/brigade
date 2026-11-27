// Le rail bloqué (#3358, épique #3352), tel que l'app le montre : des tickets
// `fire` qu'aucun manager n'a pris. Le 2026-11-12, Secondes avait huit tickets
// `fire` sans un commentaire, sans prise du manager, sans `model:` ni `effort:`
// depuis la veille, et rien ne le disait.
//
// Un ticket est « non pris » quand il porte `fire` et qu'aucun manager n'y a
// touché : ni prise du manager, ni qualification — ni `model:` ou `effort:`, ni
// commentaire du manager, ni label d'écart —, ni état de cuisson (`taken`,
// `in-pass`, `waiting`). Le rail est bloqué quand un ticket l'est depuis plus
// de `DELAI_MS`. Le diagnostic dit combien de tickets, depuis combien de temps,
// la cause que les stations du compte disent d'elles (leur signe de vie,
// `enregistrement-station/contrat.ts`), et le geste qui débloque quand il y en a un.
//
// Venu du runtime, qui ne le dit plus (#3945) : le superviseur y tient ce rôle.
// L'app le lit de GitHub (vue/rail/github.ts) ; il n'importe rien de lourd.
import { retenueJusqua, disponible } from "../../../runtime/src/enregistrement-station/contrat.ts";
import { porteListe } from "../../../runtime/src/epique.ts";
import { estParque, LABEL_IN_PASS, LABEL_TAKEN } from "../../../runtime/src/github-etat/etats.ts";
import { stationDe } from "../../../runtime/src/stations-github/stations.ts";
import { DELAI_MS, dureeCourte, LABELS_D_ECART, MOTS_DU_GESTE, servantesDe, type Geste, type StationDuCompte, type StationsLues } from "../../../runtime/src/attente-du-rail/stations.ts";
import { feuPoseLe, lesFeux, type Lire } from "../../../runtime/src/attente-du-rail/lecture.ts";

// Ce qui marque le travail d'un manager sur une issue, redit sans importer
// leurs modules — qui tirent le journal, que l'app ne charge pas : sa prise (`github-etat/prise-du-manager.ts`, `MARQUE`), son
// commentaire de jugement (`juger.ts`, `MARQUEUR_MANAGER`), et les auteurs
// dont un marqueur se croit (`alimenter.ts`, `DE_CONFIANCE`).
const BRAND_OF_TAKING = /^<!-- brigade:manager-prise station=/;
const MARKER_OF_MANAGER = "<!-- brigade:manager -->";
const AUTHORS_OF_TRUST: readonly string[] = ["OWNER", "MEMBER", "COLLABORATOR"];
type CommentRead = { body: string; association: string };

// Le ticket est-il passé par un manager ? D'après ses labels et ses commentaires.
function takenByOneManager(labels: readonly string[], comments: readonly CommentRead[]): boolean {
  if (labels.some((label) => label.startsWith("model:") || label.startsWith("effort:"))) return true;
  if (estParque(labels) || labels.some((label) => LABELS_D_ECART.includes(label) || label === LABEL_TAKEN || label === LABEL_IN_PASS)) return true;
  return comments.some(({ body, association }) => AUTHORS_OF_TRUST.includes(association) && (BRAND_OF_TAKING.test(body) || body.startsWith(MARKER_OF_MANAGER)));
}

// Ce que les labels seuls disent déjà : un ticket qualifié, écarté ou en
// cuisson n'a pas besoin qu'on lise ses commentaires.
const takenOfAfterItsLabels = (labels: readonly string[]) => takenByOneManager(labels, []);

// Un ticket `fire` qu'aucun manager n'a pris, et depuis quand il attend :
// l'instant où `fire` lui a été posé.
export type TicketNotTaken = { ticket: number; depuis: string };

// La cause, la plus utile d'abord :
//   aucune-station   aucune station n'a le projet dans sa sélection ;
//   sans-quota       ses stations sont toutes retenues par la limite de GitHub ;
//   arretee          ses stations sont arrêtées (l'une au moins par son geste d'arrêt) ;
//   hors-ligne       ses stations se sont tues ;
//   manager-muet     une station en ligne le sert : son manager tourne, mais ne prend rien ;
//   inconnue         les stations du compte ne se lisent pas.
export type Cause = "aucune-station" | "sans-quota" | "arretee" | "hors-ligne" | "manager-muet" | "inconnue";

export type RailBlocked = {
  // Les tickets qui bloquent, du plus ancien au plus récent.
  tickets: number[];
  // Depuis quand le plus ancien attend.
  depuis: string;
  cause: Cause;
  // Les stations que la cause nomme ; vide pour `aucune-station` et `inconnue`.
  stations: string[];
  geste: Geste | null;
  // Combien, depuis combien de temps, et la cause, en une phrase.
  constat: string;
  // La ligne : le constat, puis le geste.
  phrase: string;
};

const stopped = ({ stoppedAt, lastSeen }: StationDuCompte) => stoppedAt !== null && Date.parse(stoppedAt) >= Date.parse(lastSeen);

// Une heure, comme `status` les écrit : `14:05 UTC`.
const hourUtc = (iso: string) => `${new Date(iso).toISOString().slice(11, 16)} UTC`;
const list = (names: readonly string[]) => (names.length <= 1 ? (names[0] ?? "") : `${names.slice(0, -1).join(", ")} and ${names.at(-1)}`);

// La cause, d'après les stations qui servent le projet.
function causeOf(repository: string, stations: StationsLues, now: number): { cause: Cause; stations: string[]; jusqua?: string } {
  if ("illisibles" in stations) return { cause: "inconnue", stations: [] };
  const servingOnes = servantesDe(stations.lues, repository, now);
  if (servingOnes.length === 0) return { cause: "aucune-station", stations: [] };
  const names = (lesquelles: readonly StationDuCompte[]) => [...new Set(lesquelles.map(({ name }) => stationDe(name)))].sort();
  const retainedEntries = servingOnes.flatMap((station) => {
    const until = retenueJusqua(station, now);
    return until === null ? [] : [{ station, jusqua: until }];
  });
  const inLine = servingOnes.filter((station) => disponible(station, now) && !retainedEntries.some((retainedOne) => retainedOne.station === station));
  if (inLine.length > 0) return { cause: "manager-muet", stations: names(inLine) };
  if (retainedEntries.length > 0) {
    const until = retainedEntries.map(({ jusqua: until }) => until).sort()[0] as string;
    return { cause: "sans-quota", stations: names(retainedEntries.map(({ station }) => station)), jusqua: until };
  }
  const stoppedEntries = servingOnes.filter(stopped);
  if (stoppedEntries.length > 0) return { cause: "arretee", stations: names(stoppedEntries) };
  return { cause: "hors-ligne", stations: names(servingOnes) };
}

const ACTIONS: Record<Cause, Geste | null> = {
  "aucune-station": "ajouter-a-une-station",
  arretee: "demarrer-la-station",
  "hors-ligne": "demarrer-la-station",
  "sans-quota": null,
  "manager-muet": null,
  inconnue: null,
};

function tellTheCause(cause: Cause, stations: readonly string[], until: string | undefined): string {
  const s = stations.length > 1;
  const its = `${s ? "its stations" : "its station"} ${list(stations)}`;
  switch (cause) {
    case "aucune-station":
      return "no station serves this project";
    case "sans-quota":
      return `${its} ${s ? "are" : "is"} out of GitHub quota until ${hourUtc(until as string)}`;
    case "arretee":
      return `${its} ${s ? "are" : "is"} stopped`;
    case "hors-ligne":
      return `${its} ${s ? "are" : "is"} offline`;
    case "manager-muet":
      return `the manager runs on ${list(stations)} but takes nothing`;
    case "inconnue":
      return "the cause is not known: your stations could not be read";
  }
}

// Le rail de ce dépôt est-il bloqué à cet instant ? Null quand aucun ticket non
// pris n'a passé le délai. `stations` : null quand elles n'ont pas été lues.
export function diagnose(options: { depot: string; nonPris: readonly TicketNotTaken[]; stations: StationsLues | null; maintenant: number; delaiMs?: number }): RailBlocked | null {
  const { depot: repository, maintenant: now, delaiMs: delayMs = DELAI_MS } = options;
  const blocking = options.nonPris
    .filter(({ depuis: since }) => !Number.isNaN(Date.parse(since)) && now - Date.parse(since) > delayMs)
    .sort((a, b) => Date.parse(a.depuis) - Date.parse(b.depuis) || a.ticket - b.ticket);
  const [first] = blocking;
  if (first === undefined) return null;
  const oneOf = blocking.length === 1;
  const duration = dureeCourte(now - Date.parse(first.depuis));
  const { cause, stations, jusqua: until } = options.stations === null ? { cause: "inconnue" as const, stations: [] } : causeOf(repository, options.stations, now);
  const action = ACTIONS[cause];
  const head = `${blocking.length} ticket${oneOf ? "" : "s"} on the rail, no manager has taken ${oneOf ? "it" : "them"} for ${duration}`;
  const finding = `${head}: ${tellTheCause(cause, stations, until)}.`;
  return {
    tickets: blocking.map(({ ticket }) => ticket),
    depuis: first.depuis,
    cause,
    stations,
    geste: action,
    constat: finding,
    phrase: `${finding}${action === null ? "" : ` ${MOTS_DU_GESTE[action]}.`}`,
  };
}

// La ligne que la file du second porte, dans le bloc `awaiting` de `status` — dans
// l'app (board/rail.ts, `blocAwaiting`).
const TITLE_OF_THE_FILE = "  STUCK RAIL  ";
export const lineOfTheFile = (blocked: Pick<RailBlocked, "phrase">) => `${TITLE_OF_THE_FILE}${blocked.phrase}`;
// Celle d'un rail qui n'a pas pu être lu : jamais un rail dit calme faute de l'avoir lu.
export const lineNotRead = (repository: string, reason: string) => `${TITLE_OF_THE_FILE}not checked: the \`fire\` tickets of ${repository} could not be read on GitHub — ${reason}`;

const LABEL_FIRE = "fire";
// Le tableau de la cuisine : une issue `fire` qui n'est pas un ticket (board/set-aside-github.ts).
const LABEL_OF_BOARD = "kitchen-board";
const BY_PAGE = 100;

type Raw = Record<string, unknown>;
const object = (value: unknown): Raw | null => (typeof value === "object" && value !== null && !Array.isArray(value) ? (value as Raw) : null);
const listOf = (value: unknown): Raw[] => (Array.isArray(value) ? value.flatMap((oneOf: unknown) => { const o = object(oneOf); return o === null ? [] : [o]; }) : []);
const text = (value: unknown): string => (typeof value === "string" ? value : "");

// Pour chaque issue ouverte au label `fire` — ni PR, ni épique dont le corps
// liste les tickets, ni le tableau de la cuisine — dont les labels ne disent pas
// déjà qu'un manager l'a prise : ses commentaires, pour une prise ou un
// jugement du manager ; puis ses événements, pour l'instant où `fire` lui a été
// posé — à défaut, son ouverture.
// Les tickets non pris, dans l'ordre des issues. `issues` : les issues `fire` déjà lues ; absentes, elles se lisent.
export async function readTheNotTaken(options: { depot: string; lire: Lire; issues?: readonly unknown[] }): Promise<TicketNotTaken[]> {
  const { depot: repository, lire: read } = options;
  const issues = options.issues === undefined ? await lesFeux(repository, read) : listOf(options.issues);
  const notTaken: TicketNotTaken[] = [];
  for (const issue of issues) {
    if (issue.pull_request !== undefined || typeof issue.number !== "number") continue;
    const labels = listOf(issue.labels).flatMap(({ name }) => (typeof name === "string" ? [name] : []));
    if (!labels.includes(LABEL_FIRE) || labels.includes(LABEL_OF_BOARD) || porteListe(text(issue.body)) || takenOfAfterItsLabels(labels)) continue;
    const raw = await read(`/repos/${repository}/issues/${issue.number}/comments?per_page=${BY_PAGE}`);
    if (!Array.isArray(raw)) throw new Error(`GitHub did not answer the comments of #${issue.number} with a list`);
    const comments = listOf(raw).map((comment) => ({ body: text(comment.body), association: text(comment.author_association) }));
    if (takenByOneManager(labels, comments)) continue;
    const events = await read(`/repos/${repository}/issues/${issue.number}/events?per_page=${BY_PAGE}`);
    if (!Array.isArray(events)) throw new Error(`GitHub did not answer the events of #${issue.number} with a list`);
    const since = feuPoseLe(listOf(events)) ?? text(issue.created_at);
    if (Number.isNaN(Date.parse(since))) throw new Error(`GitHub did not say when #${issue.number} was put on the rail`);
    notTaken.push({ ticket: issue.number, depuis: since });
  }
  return notTaken;
}
