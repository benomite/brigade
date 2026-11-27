// Les stations enregistrées sous le compte GitHub du chef (#1706, épique #1702), et les projets que le chef choisit
// pour chacune. Chacune est un gist secret du compte, que main.ts lit sur GitHub ; ce module écrit la sélection : le
// fichier `brigade-selection.json` du gist de la station, réécrit en entier à chaque changement. L'app n'écrit que ce
// fichier-là — l'enregistrement est à la station seule, et un `PATCH` ne touche que les fichiers qu'il nomme.
//
// Et ce que chaque station a fait d'un dépôt choisi pour elle (#1790, épique #1785) : quand une autre station le servait
// déjà, elle en a rejoint la cuisine, ou elle refuse en une phrase (retiré par #2713 : aucun runtime ne l'écrit plus, toute
// station qui sert un projet en ouvre la cuisine). Elle l'écrit dans
// le suivi de ce même gist (`brigade-projets-suivi.json`, `rejoindre`) : l'app l'y lit, pour chaque station à qui un dépôt
// est choisi, et le joint à ce que GitHub en a dit (`ajouts`).
import { FILE_TRACKING, readTracking } from "./projects/request.ts";
// Le nom du projet tiré de son dépôt : celui que la station en fait.
import { nameOfProject } from "./projects/projects.ts";
import { available, type HeldByGitHub } from "./station-freshness.ts";

// Une station telle que son gist la dit : `id`, son gist ; `account`, le propriétaire du gist ; `selection`, les dépôts que
// l'app lui a choisis, null tant qu'elle n'en a écrit aucun.
type Recorded = {
  id: string;
  name: string;
  platform: string;
  machine: string;
  version: string;
  account: string | null;
  available: boolean;
  heldUntil?: string;
  heldBy?: HeldByGitHub;
  registeredAt: string;
  lastSeen: string;
  stoppedAt: string | null;
  refreshMs: number;
  selection: string[] | null;
};
// Les stations du compte, ou pourquoi elles ne se lisent pas : jamais une liste vide sans raison.
type OfAccount =
  | { state: "listed"; stations: Recorded[]; unreadable: Array<{ id: string; reason: string }>; reason?: string }
  | { state: "sign-in-required"; reason: string; action: { id: "github-sign-in"; label: string; command: string[] } }
  | { state: "unavailable"; cause: "gh-missing" | "network" | "timeout" | "rate-limit" | "github"; reason: string; link?: string; detail?: string };
export type StationsOfAccountRead = OfAccount;

// Ce qu'une station a fait d'un dépôt choisi pour elle, une fois lu : `seule` — aucune autre ne le servait, elle le
// prépare elle-même, comme avant ; `rejointe` — elle cuit dans la cuisine que `principale` fait tourner ; `refusee` —
// elle ne peut pas la rejoindre, n'en ouvre pas une seconde, et `phrase` dit pourquoi. Un dépôt qu'elle n'a pas encore
// lu n'y est pas.
export type IssueOfTheAddition = { depot: string; issue: "seule" } | { depot: string; issue: "rejointe"; principale: string } | { depot: string; issue: "refusee"; phrase: string };
// `offlineSince` : hors ligne, son dernier signe de vie — ou l'instant où elle s'est dite arrêtée (`avecLeurEtat`).
export type StationRecorded = Recorded & { ajouts?: IssueOfTheAddition[]; offlineSince?: string };
export type StationsOfAccount = Exclude<OfAccount, { state: "listed" }> | (Omit<Extract<OfAccount, { state: "listed" }>, "stations"> & { stations: StationRecorded[] });

// Ce que le contrat fixe de la sélection : son fichier et son format, que main.ts passe.
export type ContractOfTheSelection = { FICHIER_SELECTION: string; FORMAT: number };

export type OptionsOfChoice = {
  // Réécrit ces fichiers du gist, sans toucher aux autres (stations/github.ts, `ecrire`).
  ecrire(id: string, files: Record<string, string>): Promise<void>;
  contrat(): Promise<ContractOfTheSelection>;
  maintenant?: () => number;
};

// La sélection écrite — les dépôts tels qu'ils sont dans le gist —, ou pourquoi elle ne l'est pas : une ligne, son
// détail au survol. Une station hors ligne se choisit comme une autre : elle lit sa sélection à son retour.
export type Choice = { selection: string[] } | { refus: string; detail?: string };

// Un gist s'appelle par son identifiant hexadécimal ; un dépôt est `owner/repo`, comme le contrat le relit.
const GIST = /^[A-Za-z0-9]+$/;
const REPOSITORY = /^[\w.-]+\/[\w.-]+$/;

export const REFUSAL_STATION = "not saved: this is not a station the app has read";
export const REFUSAL_PROJECTS = "not saved: these are not GitHub repositories";
// Une écriture que GitHub n'a pas prise : sa cause en mots, et le geste qui la répare, sur la ligne même — ce que `gh` a
// dit reste au survol (#3187). Aucune ne coupe sa phrase d'un tiret : ce qui le suit irait au survol (projects-served.js,
// `refusDit`).
export const REFUSAL_PERMISSION = "not saved: this computer's GitHub sign-in lacks the “gist” permission, which writes a station's choice; grant it by signing in to GitHub again on this computer, then choose again";
export const REFUSAL_CONNECTION = "not saved: this computer's GitHub sign-in is no longer valid; sign in to GitHub again on this computer, then choose again";
export const REFUSAL_LIMIT = "not saved: GitHub's hourly limit on your account's calls is reached; choose again once it lifts, within the hour";
export const REFUSAL_NETWORK = "not saved: GitHub could not be reached from this computer; check its network connection, then choose again";
export const REFUSAL_ABSENT = "not saved: this station's registration is no longer on GitHub; start the station on its machine so it registers again, then choose again";
export const REFUSAL_GITHUB = "not saved: GitHub answered the write with an error (its answer on hover); choose again in a minute";

const LIMIT = /rate limit/i;
const PERMISSION = /"gist" scope|-s gist|HTTP 403|Resource not accessible|not have permission|must have (?:admin|write|push)/i;
const CONNECTION = /HTTP 401|Bad credentials|gh auth login|not logged in/i;
const NETWORK = /error connecting|ENOTFOUND|EAI_AGAIN|ECONNREFUSED|ECONNRESET|ETIMEDOUT|ENETUNREACH|could not resolve host|network is unreachable|i\/o timeout|TLS handshake|no answer within/i;
// La phrase de stations/github.ts quand GitHub répond 404 sans parler de permission.
const ABSENT = /no longer on GitHub/;

// Pourquoi une écriture de la sélection n'a pas été prise, d'après ce que `gh` en a dit.
export function refusalOfTheWriting(said: string): { refus: string; detail: string } {
  const refusal = LIMIT.test(said) ? REFUSAL_LIMIT : PERMISSION.test(said) ? REFUSAL_PERMISSION : CONNECTION.test(said) ? REFUSAL_CONNECTION : NETWORK.test(said) ? REFUSAL_NETWORK : ABSENT.test(said) ? REFUSAL_ABSENT : REFUSAL_GITHUB;
  return { refus: refusal, detail: refusal === REFUSAL_PERMISSION ? `${said} · from a terminal instead: gh auth refresh -h github.com -s gist` : said };
}

// Le contenu du fichier : la sélection entière, et l'instant où l'app l'écrit.
export function contentOfTheSelection(contract: ContractOfTheSelection, repositories: readonly string[], instant: number): string {
  return `${JSON.stringify({ brigade: "station-selection", format: contract.FORMAT, repositories: repositories, updatedAt: new Date(instant).toISOString() }, null, 2)}\n`;
}

// Le geste « choisir les projets d'une station » : ce que la vue envoie est vérifié, puis écrit dans son gist.
export function choiceOfProjects(options: OptionsOfChoice): (id: unknown, repositories: unknown) => Promise<Choice> {
  const now = options.maintenant ?? Date.now;
  return async (id, repositories) => {
    if (typeof id !== "string" || !GIST.test(id)) return { refus: REFUSAL_STATION };
    if (!Array.isArray(repositories) || !repositories.every((repository) => typeof repository === "string" && REPOSITORY.test(repository))) return { refus: REFUSAL_PROJECTS };
    const selection = [...new Set(repositories as string[])];
    try {
      const contract = await options.contrat();
      await options.ecrire(id, { [contract.FICHIER_SELECTION]: contentOfTheSelection(contract, selection, now()) });
    } catch (error) {
      return refusalOfTheWriting(error instanceof Error ? error.message : String(error));
    }
    return { selection };
  };
}

// Ce que le suivi d'une station dit des dépôts choisis pour elle : un par dépôt qu'elle a lu, dans l'ordre de sa sélection.
export function additionsOfTracking(raw: string | undefined, selection: readonly string[]): IssueOfTheAddition[] {
  const tracking = readTracking(raw);
  return selection.flatMap((repository): IssueOfTheAddition[] => {
    const said = tracking.find(({ nom: name }) => name === nameOfProject(repository));
    if (said === undefined) return [];
    const { rejoindre: join } = said;
    if (join === undefined) return [{ depot: repository, issue: "seule" }];
    return [join.issue === "rejointe" ? { depot: repository, issue: "rejointe", principale: join.principale } : { depot: repository, issue: "refusee", phrase: join.phrase }];
  });
}

// Les stations du compte, avec ce que chacune a fait des dépôts choisis pour elle, lu dans son gist (`lire`, celui de
// stations/github.ts). Un gist qui ne se lit pas n'en dit rien : la station reste telle que sa lecture l'a dite.
export async function withTheirAdditions(readEntries: OfAccount, read: (id: string) => Promise<Record<string, string> | null>): Promise<StationsOfAccount> {
  if (readEntries.state !== "listed") return readEntries;
  const stations = await Promise.all(
    readEntries.stations.map(async (station): Promise<StationRecorded> => {
      const selection = station.selection ?? [];
      if (selection.length === 0) return station;
      let files: Record<string, string> | null;
      try {
        files = await read(station.id);
      } catch {
        return station;
      }
      const additions = additionsOfTracking(files?.[FILE_TRACKING], selection);
      return additions.length === 0 ? station : { ...station, ajouts: additions };
    }),
  );
  return { ...readEntries, stations };
}

// Une station appairée telle que sa présence la dit (stations/stations.ts) : son nom, et si son signe de vie est frais.
export type Presence = { nom: string; etat: string };

// L'état de chaque station du compte d'après ce qu'elle fait à cet instant (#3187) : en ligne quand son dernier signe de
// vie est frais — celui de son enregistrement, à la règle de fraîcheur (`available`), ou celui de sa présence, que la
// station d'une même machine (même nom, sans égard à la casse) écrit toutes les 30 s pendant qu'elle tourne. Sinon hors
// ligne, avec depuis quand (`offlineSince`). Une station que la limite de GitHub retient garde son état.
export function withTheirState(readEntries: StationsOfAccount, presences: readonly Presence[], instant: number): StationsOfAccount {
  if (readEntries.state !== "listed") return readEntries;
  const alive = new Set(presences.filter(({ etat: state }) => state === "en-ligne").map(({ nom: name }) => name.toLowerCase()));
  const stations = readEntries.stations.map((station): StationRecorded => {
    const { offlineSince: _, ...without } = station;
    if (alive.has(station.name.toLowerCase()) || available(station, instant)) return { ...without, available: true };
    const stopped = station.stoppedAt !== null && Date.parse(station.stoppedAt) >= Date.parse(station.lastSeen);
    return { ...without, available: false, offlineSince: stopped ? (station.stoppedAt ?? station.lastSeen) : station.lastSeen };
  });
  return { ...readEntries, stations };
}
