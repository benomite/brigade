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
import { LABEL_IN_PASS, LABEL_TAKEN, LABEL_WAITING } from "../../../runtime/src/github-etat/etats.ts";
import { stationDe } from "../../../runtime/src/stations-github/stations.ts";
import { DELAI_MS, dureeCourte, LABELS_D_ECART, MOTS_DU_GESTE, servantesDe, type Geste, type StationDuCompte, type StationsLues } from "../../../runtime/src/attente-du-rail/stations.ts";
import { feuPoseLe, lesFeux, type Lire } from "../../../runtime/src/attente-du-rail/lecture.ts";

// Ce qui marque le travail d'un manager sur une issue, redit sans importer
// leurs modules — qui tirent le journal, que l'app ne charge pas : sa prise (`github-etat/prise-du-manager.ts`, `MARQUE`), son
// commentaire de jugement (`juger.ts`, `MARQUEUR_MANAGER`), et les auteurs
// dont un marqueur se croit (`alimenter.ts`, `DE_CONFIANCE`).
const MARQUE_DE_PRISE = /^<!-- brigade:manager-prise station=/;
const MARQUEUR_DU_MANAGER = "<!-- brigade:manager -->";
const AUTEURS_DE_CONFIANCE: readonly string[] = ["OWNER", "MEMBER", "COLLABORATOR"];
type CommentaireLu = { body: string; association: string };

// Le ticket est-il passé par un manager ? D'après ses labels et ses commentaires.
function prisParUnManager(labels: readonly string[], commentaires: readonly CommentaireLu[]): boolean {
  if (labels.some((label) => label.startsWith("model:") || label.startsWith("effort:"))) return true;
  if (labels.some((label) => LABELS_D_ECART.includes(label) || label === LABEL_TAKEN || label === LABEL_IN_PASS || label === LABEL_WAITING)) return true;
  return commentaires.some(({ body, association }) => AUTEURS_DE_CONFIANCE.includes(association) && (MARQUE_DE_PRISE.test(body) || body.startsWith(MARQUEUR_DU_MANAGER)));
}

// Ce que les labels seuls disent déjà : un ticket qualifié, écarté ou en
// cuisson n'a pas besoin qu'on lise ses commentaires.
const prisDApresSesLabels = (labels: readonly string[]) => prisParUnManager(labels, []);

// Un ticket `fire` qu'aucun manager n'a pris, et depuis quand il attend :
// l'instant où `fire` lui a été posé.
export type TicketNonPris = { ticket: number; depuis: string };

// La cause, la plus utile d'abord :
//   aucune-station   aucune station n'a le projet dans sa sélection ;
//   sans-quota       ses stations sont toutes retenues par la limite de GitHub ;
//   arretee          ses stations sont arrêtées (l'une au moins par son geste d'arrêt) ;
//   hors-ligne       ses stations se sont tues ;
//   manager-muet     une station en ligne le sert : son manager tourne, mais ne prend rien ;
//   inconnue         les stations du compte ne se lisent pas.
export type Cause = "aucune-station" | "sans-quota" | "arretee" | "hors-ligne" | "manager-muet" | "inconnue";

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

const arretee = ({ stoppedAt, lastSeen }: StationDuCompte) => stoppedAt !== null && Date.parse(stoppedAt) >= Date.parse(lastSeen);

// Une heure, comme `status` les écrit : `14:05 UTC`.
const heureUtc = (iso: string) => `${new Date(iso).toISOString().slice(11, 16)} UTC`;
const liste = (noms: readonly string[]) => (noms.length <= 1 ? (noms[0] ?? "") : `${noms.slice(0, -1).join(", ")} and ${noms.at(-1)}`);

// La cause, d'après les stations qui servent le projet.
function causeDe(depot: string, stations: StationsLues, maintenant: number): { cause: Cause; stations: string[]; jusqua?: string } {
  if ("illisibles" in stations) return { cause: "inconnue", stations: [] };
  const servantes = servantesDe(stations.lues, depot, maintenant);
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
// pris n'a passé le délai. `stations` : null quand elles n'ont pas été lues.
export function diagnostiquer(options: { depot: string; nonPris: readonly TicketNonPris[]; stations: StationsLues | null; maintenant: number; delaiMs?: number }): RailBloque | null {
  const { depot, maintenant, delaiMs = DELAI_MS } = options;
  const bloquants = options.nonPris
    .filter(({ depuis }) => !Number.isNaN(Date.parse(depuis)) && maintenant - Date.parse(depuis) > delaiMs)
    .sort((a, b) => Date.parse(a.depuis) - Date.parse(b.depuis) || a.ticket - b.ticket);
  const [premier] = bloquants;
  if (premier === undefined) return null;
  const un = bloquants.length === 1;
  const duree = dureeCourte(maintenant - Date.parse(premier.depuis));
  const { cause, stations, jusqua } = options.stations === null ? { cause: "inconnue" as const, stations: [] } : causeDe(depot, options.stations, maintenant);
  const geste = GESTES[cause];
  const tete = `${bloquants.length} ticket${un ? "" : "s"} on the rail, no manager has taken ${un ? "it" : "them"} for ${duree}`;
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
// l'app (tableau/rail.ts, `blocAwaiting`).
const TITRE_DE_LA_FILE = "  STUCK RAIL  ";
export const ligneDeLaFile = (bloque: Pick<RailBloque, "phrase">) => `${TITRE_DE_LA_FILE}${bloque.phrase}`;
// Celle d'un rail qui n'a pas pu être lu : jamais un rail dit calme faute de l'avoir lu.
export const ligneNonLue = (depot: string, raison: string) => `${TITRE_DE_LA_FILE}not checked: the \`fire\` tickets of ${depot} could not be read on GitHub — ${raison}`;

const LABEL_FIRE = "fire";
// Le tableau de la cuisine : une issue `fire` qui n'est pas un ticket (tableau/mise-de-cote-github.ts).
const LABEL_DU_TABLEAU = "kitchen-board";
const PAR_PAGE = 100;

type Brut = Record<string, unknown>;
const objet = (valeur: unknown): Brut | null => (typeof valeur === "object" && valeur !== null && !Array.isArray(valeur) ? (valeur as Brut) : null);
const listeDe = (valeur: unknown): Brut[] => (Array.isArray(valeur) ? valeur.flatMap((un: unknown) => { const o = objet(un); return o === null ? [] : [o]; }) : []);
const texte = (valeur: unknown): string => (typeof valeur === "string" ? valeur : "");

// Pour chaque issue ouverte au label `fire` — ni PR, ni épique dont le corps
// liste les tickets, ni le tableau de la cuisine — dont les labels ne disent pas
// déjà qu'un manager l'a prise : ses commentaires, pour une prise ou un
// jugement du manager ; puis ses événements, pour l'instant où `fire` lui a été
// posé — à défaut, son ouverture.
// Les tickets non pris, dans l'ordre des issues. `issues` : les issues `fire` déjà lues ; absentes, elles se lisent.
export async function lireLesNonPris(options: { depot: string; lire: Lire; issues?: readonly unknown[] }): Promise<TicketNonPris[]> {
  const { depot, lire } = options;
  const issues = options.issues === undefined ? await lesFeux(depot, lire) : listeDe(options.issues);
  const nonPris: TicketNonPris[] = [];
  for (const issue of issues) {
    if (issue.pull_request !== undefined || typeof issue.number !== "number") continue;
    const labels = listeDe(issue.labels).flatMap(({ name }) => (typeof name === "string" ? [name] : []));
    if (!labels.includes(LABEL_FIRE) || labels.includes(LABEL_DU_TABLEAU) || porteListe(texte(issue.body)) || prisDApresSesLabels(labels)) continue;
    const brutes = await lire(`/repos/${depot}/issues/${issue.number}/comments?per_page=${PAR_PAGE}`);
    if (!Array.isArray(brutes)) throw new Error(`GitHub did not answer the comments of #${issue.number} with a list`);
    const commentaires = listeDe(brutes).map((commentaire) => ({ body: texte(commentaire.body), association: texte(commentaire.author_association) }));
    if (prisParUnManager(labels, commentaires)) continue;
    const evenements = await lire(`/repos/${depot}/issues/${issue.number}/events?per_page=${PAR_PAGE}`);
    if (!Array.isArray(evenements)) throw new Error(`GitHub did not answer the events of #${issue.number} with a list`);
    const depuis = feuPoseLe(listeDe(evenements)) ?? texte(issue.created_at);
    if (Number.isNaN(Date.parse(depuis))) throw new Error(`GitHub did not say when #${issue.number} was put on the rail`);
    nonPris.push({ ticket: issue.number, depuis });
  }
  return nonPris;
}
