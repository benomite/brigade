// Le rail bloqué (#3358, épique #3352) : des tickets `fire` qu'aucun manager n'a
// pris. La règle de la brigade : une cuisine n'est jamais oisive le rail plein ;
// un rail plein sans personne pour le prendre est une panne, à montrer aussitôt.
// Le 2026-11-12, Secondes avait huit tickets `fire` sans un commentaire, sans
// prise du manager, sans `model:` ni `effort:` depuis la veille, et rien ne le
// disait.
//
// Un ticket est « non pris » quand il porte `fire` et qu'aucun manager n'y a
// touché : ni prise du manager (`github-etat/prise-du-manager.ts`), ni
// qualification — ni `model:` ou `effort:`, ni commentaire du manager, ni label
// d'écart —, ni état de cuisson (`taken`, `in-pass`, `waiting`). Le rail est
// bloqué quand un ticket l'est depuis plus de `DELAI_MS`.
//
// Le diagnostic dit combien de tickets, depuis combien de temps, la cause que
// les stations du compte disent d'elles (leur signe de vie,
// `enregistrement-station/contrat.ts`), et le geste qui débloque quand il y en
// a un. L'app (tableau/lecture.ts) et `brigade <project> status`
// (`status.ts`) lisent le même diagnostic et écrivent la même phrase.
//
// Ce module ne lit rien : `lecture.ts` lit GitHub, il juge. Il n'importe rien
// de lourd — l'app le charge dans son process principal.
import { disponible, retenueJusqua, type RetenueParGitHub } from "../enregistrement-station/contrat.ts";
import { LABEL_IN_PASS, LABEL_TAKEN, LABEL_WAITING } from "../github-etat/etats.ts";
import { stationDe } from "../stations-github/stations.ts";

// Au-delà de ce délai, un ticket `fire` qu'aucun manager n'a pris bloque le
// rail : un manager le prend d'ordinaire au tour qui suit.
export const DELAI_MS = 5 * 60_000;

// Ce qui marque le travail d'un manager sur une issue, redit sans importer
// leurs modules — qui tirent le journal, que l'app ne charge pas ; un test les
// compare : sa prise (`github-etat/prise-du-manager.ts`, `MARQUE`), son
// commentaire de jugement (`juger.ts`, `MARQUEUR_MANAGER`), et les auteurs
// dont un marqueur se croit (`alimenter.ts`, `DE_CONFIANCE`).
export const MARQUE_DE_PRISE = /^<!-- brigade:manager-prise station=/;
export const MARQUEUR_DU_MANAGER = "<!-- brigade:manager -->";
export const AUTEURS_DE_CONFIANCE: readonly string[] = ["OWNER", "MEMBER", "COLLABORATOR"];
// Les labels que le manager pose quand il écarte une issue (`events/manager.ts`, `Ecart`) : il l'a prise.
export const LABELS_D_ECART: readonly string[] = ["roadmap", "epic", "question", "decision", "blocked-on-human", "served-elsewhere", "set-aside:failures"];

export type CommentaireLu = { body: string; association: string };

// Le ticket est-il passé par un manager ? D'après ses labels et ses commentaires.
export function prisParUnManager(labels: readonly string[], commentaires: readonly CommentaireLu[]): boolean {
  if (labels.some((label) => label.startsWith("model:") || label.startsWith("effort:"))) return true;
  if (labels.some((label) => LABELS_D_ECART.includes(label) || label === LABEL_TAKEN || label === LABEL_IN_PASS || label === LABEL_WAITING)) return true;
  return commentaires.some(({ body, association }) => AUTEURS_DE_CONFIANCE.includes(association) && (MARQUE_DE_PRISE.test(body) || body.startsWith(MARQUEUR_DU_MANAGER)));
}

// Ce que les labels seuls disent déjà : un ticket qualifié, écarté ou en
// cuisson n'a pas besoin qu'on lise ses commentaires.
export const prisDApresSesLabels = (labels: readonly string[]) => prisParUnManager(labels, []);

// Un ticket `fire` qu'aucun manager n'a pris, et depuis quand il attend :
// l'instant où `fire` lui a été posé.
export type TicketNonPris = { ticket: number; depuis: string };

// Une station du compte, telle que son enregistrement la dit
// (`enregistrement-station/stations-du-compte.ts`, `StationEnregistree` ;
// `stations-github/stations.ts`, `SigneDeVie`).
export type StationDuCompte = { name: string; lastSeen: string; stoppedAt: string | null; refreshMs: number; heldBy?: RetenueParGitHub | null; selection: readonly string[] | null };

// Les stations du compte, ou pourquoi elles ne se lisent pas.
export type StationsLues = { lues: readonly StationDuCompte[] } | { illisibles: string };

// La cause, la plus utile d'abord :
//   aucune-station   aucune station n'a le projet dans sa sélection ;
//   sans-quota       ses stations sont toutes retenues par la limite de GitHub ;
//   arretee          ses stations sont arrêtées (l'une au moins par son geste d'arrêt) ;
//   hors-ligne       ses stations se sont tues ;
//   manager-muet     une station en ligne le sert : son manager tourne, mais ne prend rien ;
//   inconnue         les stations du compte ne se lisent pas.
export type Cause = "aucune-station" | "sans-quota" | "arretee" | "hors-ligne" | "manager-muet" | "inconnue";
// Le geste qui débloque, quand il y en a un.
export type Geste = "demarrer-la-station" | "ajouter-a-une-station";

export type RailBloque = {
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

const memeDepot = (a: string, b: string) => a.toLowerCase() === b.toLowerCase();
const arretee = ({ stoppedAt, lastSeen }: StationDuCompte) => stoppedAt !== null && Date.parse(stoppedAt) >= Date.parse(lastSeen);

// Une durée, en mots courts : « 3 min », « 14 h », « 2 d ».
export function dureeCourte(ms: number): string {
  const minutes = Math.max(0, Math.floor(ms / 60_000));
  if (minutes < 60) return `${minutes} min`;
  const heures = Math.floor(minutes / 60);
  return heures < 48 ? `${heures} h` : `${Math.floor(heures / 24)} d`;
}

// Une heure, comme `status` les écrit : `14:05 UTC`.
const heureUtc = (iso: string) => `${new Date(iso).toISOString().slice(11, 16)} UTC`;
const liste = (noms: readonly string[]) => (noms.length <= 1 ? (noms[0] ?? "") : `${noms.slice(0, -1).join(", ")} and ${noms.at(-1)}`);

// La cause, d'après les stations qui servent le projet.
function causeDe(depot: string, stations: StationsLues, maintenant: number): { cause: Cause; stations: string[]; jusqua?: string } {
  if ("illisibles" in stations) return { cause: "inconnue", stations: [] };
  const servantes = stations.lues.filter(({ selection }) => selection?.some((choisi) => memeDepot(choisi, depot)) === true);
  if (servantes.length === 0) return { cause: "aucune-station", stations: [] };
  const noms = (lesquelles: readonly StationDuCompte[]) => [...new Set(lesquelles.map(({ name }) => stationDe(name)))].sort();
  const retenues = servantes.flatMap((station) => {
    const jusqua = retenueJusqua(station, maintenant);
    return jusqua === null ? [] : [{ station, jusqua }];
  });
  const enLigne = servantes.filter((station) => disponible(station, maintenant) && !retenues.some((retenue) => retenue.station === station));
  if (enLigne.length > 0) return { cause: "manager-muet", stations: noms(enLigne) };
  if (retenues.length > 0) {
    const jusqua = retenues.map(({ jusqua }) => jusqua).sort()[0] as string;
    return { cause: "sans-quota", stations: noms(retenues.map(({ station }) => station)), jusqua };
  }
  const arretees = servantes.filter(arretee);
  if (arretees.length > 0) return { cause: "arretee", stations: noms(arretees) };
  return { cause: "hors-ligne", stations: noms(servantes) };
}

const GESTES: Record<Cause, Geste | null> = {
  "aucune-station": "ajouter-a-une-station",
  arretee: "demarrer-la-station",
  "hors-ligne": "demarrer-la-station",
  "sans-quota": null,
  "manager-muet": null,
  inconnue: null,
};

// Le geste, dans les mots du chef : le libellé du bouton de l'app, et la fin de la phrase.
export const MOTS_DU_GESTE: Record<Geste, string> = {
  "demarrer-la-station": "Start the station",
  "ajouter-a-une-station": "Add the project to a station",
};

function direLaCause(cause: Cause, stations: readonly string[], jusqua: string | undefined): string {
  const s = stations.length > 1;
  const ses = `${s ? "its stations" : "its station"} ${liste(stations)}`;
  switch (cause) {
    case "aucune-station":
      return "no station serves this project";
    case "sans-quota":
      return `${ses} ${s ? "are" : "is"} out of GitHub quota until ${heureUtc(jusqua as string)}`;
    case "arretee":
      return `${ses} ${s ? "are" : "is"} stopped`;
    case "hors-ligne":
      return `${ses} ${s ? "are" : "is"} offline`;
    case "manager-muet":
      return `the manager runs on ${liste(stations)} but takes nothing`;
    case "inconnue":
      return "the cause is not known: your stations could not be read";
  }
}

// Le rail de ce dépôt est-il bloqué à cet instant ? Null quand aucun ticket non
// pris n'a passé le délai.
export function diagnostiquer(options: { depot: string; nonPris: readonly TicketNonPris[]; stations: StationsLues; maintenant: number; delaiMs?: number }): RailBloque | null {
  const { depot, maintenant, delaiMs = DELAI_MS } = options;
  const bloquants = options.nonPris
    .filter(({ depuis }) => !Number.isNaN(Date.parse(depuis)) && maintenant - Date.parse(depuis) > delaiMs)
    .sort((a, b) => Date.parse(a.depuis) - Date.parse(b.depuis) || a.ticket - b.ticket);
  const [premier] = bloquants;
  if (premier === undefined) return null;
  const { cause, stations, jusqua } = causeDe(depot, options.stations, maintenant);
  const geste = GESTES[cause];
  const un = bloquants.length === 1;
  const tete = `${bloquants.length} ticket${un ? "" : "s"} on the rail, no manager has taken ${un ? "it" : "them"} for ${dureeCourte(maintenant - Date.parse(premier.depuis))}`;
  const constat = `${tete}: ${direLaCause(cause, stations, jusqua)}.`;
  return {
    tickets: bloquants.map(({ ticket }) => ticket),
    depuis: premier.depuis,
    cause,
    stations,
    geste,
    constat,
    phrase: `${constat}${geste === null ? "" : ` ${MOTS_DU_GESTE[geste]}.`}`,
  };
}

// La ligne que la file du second porte, dans le bloc `awaiting` de `status` — dans
// l'app (tableau/rail.ts, `blocAwaiting`) comme sur la station (`status.ts`).
const TITRE_DE_LA_FILE = "  STUCK RAIL  ";
export const ligneDeLaFile = (bloque: Pick<RailBloque, "phrase">) => `${TITRE_DE_LA_FILE}${bloque.phrase}`;
// Celle d'un rail qui n'a pas pu être lu : jamais un rail dit calme faute de l'avoir lu.
export const ligneNonLue = (depot: string, raison: string) => `${TITRE_DE_LA_FILE}not checked: the \`fire\` tickets of ${depot} could not be read on GitHub — ${raison}`;
