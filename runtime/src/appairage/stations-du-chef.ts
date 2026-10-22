// Les stations que le chef a déjà appairées, et les projets que chacune porte,
// lues sur GitHub par le `gh` de l'ordinateur où l'app tourne — et rien
// d'autre : ni projet local, ni état de station, ni configuration. C'est ce
// que voit l'app sur un ordinateur neuf, où rien n'est encore installé que
// l'app elle-même (#1428).
//
// Chaque station publie son état dans un gist secret du compte
// (`document.ts`) ; celles que le chef a appairées y portent aussi
// `brigade-appairage.json`. La lecture liste les gists du compte, garde ceux
// des stations appairées, et lit chacun : sa station, ses projets (`projets`),
// le dépôt de chacun — celui que la station publie (`depots`), à défaut celui
// de la demande de l'app (`brigade-projets.json`, `projets/demande.ts`), à
// défaut inconnu.
//
// Elle rend toujours l'un de trois états, jamais une liste vide sans raison :
//   - `listed` : les stations appairées. Sans aucune, `reason` dit pourquoi en
//     une phrase (aucune appairée, ou des stations qui attendent leur code) ;
//   - `sign-in-required` : ce `gh` n'est connecté à aucun compte GitHub, ou
//     son jeton n'est plus bon — `reason` en une phrase, et `action`, le geste
//     que l'app sait déclencher : la commande `gh auth login` à lancer ;
//   - `unavailable` : les stations n'ont pas pu être lues pour une autre
//     raison — `cause` (stable : `gh-missing`, `network`, `timeout`,
//     `rate-limit`, `github`), `reason` en une phrase, `link` quand une page
//     lève la cause, et `detail`, ce que `gh` a dit, pour qui le demande.
//
// L'app l'importe (`lireLesStationsDuChef`), ou lance la commande :
//
//   node runtime/src/appairage/stations-du-chef.ts
//
// qui rend cet état en une ligne JSON — code 0 quand les stations sont
// listées, 1 sinon. `BRIGADE_GH_BIN` nomme le `gh` (`gh` par défaut).
import { enProcess, Sortie, type Appel } from "../appel.ts";
import { lireDemande, FICHIER_PROJETS } from "../projets/demande.ts";
import { execFile } from "../sans-invite.ts";
import { sorteLue, type Sorte } from "../stations-globales/sorte.ts";
import { FICHIER_APPAIRAGE, FICHIER_STATION } from "./document.ts";

export type ProjetPorte = {
  name: string;
  // `<owner>/<repo>`, ou null quand ni la station ni la demande de l'app ne le disent.
  repository: string | null;
};

export type StationAppairee = {
  // Son gist : ce par quoi l'app la reconnaît, et lui écrit.
  id: string;
  name: string;
  machine: string;
  // Null : une sorte que ce runtime ne connaît pas (`stations-globales/sorte.ts`).
  kind: Sorte | null;
  // Faux : elle ne fait tourner aucun cook — un téléphone.
  cooks: boolean;
  version: string;
  // Le même jugement que l'app : arrêtée proprement, ou deux signes de vie manqués.
  online: boolean;
  lastSeen: string;
  stoppedAt: string | null;
  projects: ProjetPorte[];
};

export type Connexion = {
  id: "github-sign-in";
  label: string;
  // La commande à lancer, telle quelle : le premier mot est le `gh` lu.
  command: string[];
};

export type CauseIndisponible = "gh-missing" | "network" | "timeout" | "rate-limit" | "github";

export type StationsDuChef =
  | { state: "listed"; stations: StationAppairee[]; unreadable: Array<{ id: string; reason: string }>; reason?: string }
  | { state: "sign-in-required"; reason: string; action: Connexion }
  | { state: "unavailable"; cause: CauseIndisponible; reason: string; link?: string; detail?: string };

export type OptionsDeLecture = {
  // Le `gh` de cet ordinateur.
  gh: string;
  delaiMs?: number;
  env?: NodeJS.ProcessEnv;
  maintenant?: () => number;
};

const PAR_PAGE = 100;
const PAGES_MAX = 30;
export const DELAI_MS = 30_000;
const ABSENT = /\(HTTP 404\)/;
// Ce que `gh` dit quand il n'a pas de compte, ou un jeton refusé ; et son code
// de sortie dans ce cas (« authentication required »).
const NON_CONNECTE = /gh auth login|not logged in|authentication required|requires authentication|bad credentials|HTTP 401/i;
const CODE_NON_CONNECTE = 4;
const LIMITE = /rate limit|HTTP 429/i;
const RESEAU = /error connecting|could not resolve|no such host|dial tcp|network is unreachable|connection refused|connection reset|i\/o timeout|TLS handshake|EAI_AGAIN|ENOTFOUND|ECONNREFUSED/i;

class EchecDeGh extends Error {
  readonly etat: Exclude<StationsDuChef, { state: "listed" }>;

  constructor(etat: Exclude<StationsDuChef, { state: "listed" }>) {
    super(etat.reason);
    this.etat = etat;
  }
}

class Absent extends Error {}

// Ce qu'un lancement de `gh` en échec dit de lui (l'erreur d'`execFile`) :
// `code`, son code de sortie, ou celle du système (`ENOENT`) ; `killed`, arrêté au délai.
export type ErreurDeLancement = { code?: string | number | null; killed?: boolean; message: string };

// Le geste qui connecte ce `gh` : dans le navigateur, sans rien demander au terminal
// que la connexion ne demande pas, et en HTTPS — le protocole des clones (#1390).
export const connexionGitHub = (gh: string): Connexion => ({
  id: "github-sign-in",
  label: "Sign in to GitHub",
  command: [gh, "auth", "login", "--hostname", "github.com", "--web", "--git-protocol", "https"],
});

const derniereLigne = (texte: string) => texte.trim().split("\n").at(-1)?.trim() ?? "";

// Ce qu'un `gh` en échec veut dire, en un état et une phrase.
export function echecDeGh(gh: string, delaiMs: number, erreur: ErreurDeLancement, erreurs: string): Exclude<StationsDuChef, { state: "listed" }> {
  const detail = erreurs.trim() || erreur.message;
  if (erreur.code === "ENOENT") {
    return { state: "unavailable", cause: "gh-missing", reason: `The GitHub CLI (\`${gh}\`) is not installed on this computer, and brigade reads your stations on GitHub through it.`, link: "https://cli.github.com", detail };
  }
  if (erreur.killed === true) return { state: "unavailable", cause: "timeout", reason: `GitHub gave no answer within ${Math.round(delaiMs / 1000)} s, so your stations could not be read.`, detail };
  if (erreur.code === CODE_NON_CONNECTE || NON_CONNECTE.test(erreurs)) {
    return { state: "sign-in-required", reason: "This computer is not signed in to GitHub, so brigade cannot read the stations you have paired.", action: connexionGitHub(gh) };
  }
  if (LIMITE.test(erreurs)) return { state: "unavailable", cause: "rate-limit", reason: "GitHub is limiting this account's calls for now, so your stations could not be read: they will be once its window ends.", detail };
  if (RESEAU.test(erreurs)) return { state: "unavailable", cause: "network", reason: "GitHub cannot be reached from this computer, so your stations could not be read: check its network connection.", detail };
  const dit = derniereLigne(erreurs) || erreur.message;
  return { state: "unavailable", cause: "github", reason: `GitHub refused to list your stations: ${dit.replace(/[.\s]+$/, "")}.`, detail };
}

const texte = (valeur: unknown): valeur is string => typeof valeur === "string" && valeur !== "";
const date = (valeur: unknown): valeur is string => texte(valeur) && !Number.isNaN(Date.parse(valeur));

// Le jugement de l'app (`app/src/stations/stations.ts`, `etatDe`) : hors ligne
// arrêtée proprement depuis son dernier signe, ou quand elle en a manqué deux.
const horsLigneApres = (cadenceMs: number) => 2 * cadenceMs + 30_000;
const enLigne = (signeDeVie: string, arreteeLe: string | null, cadenceMs: number, instant: number) => {
  const signe = Date.parse(signeDeVie);
  if (arreteeLe !== null && Date.parse(arreteeLe) >= signe) return false;
  return instant - signe <= horsLigneApres(cadenceMs);
};

// Une station appairée, telle que son gist la dit — ou pourquoi ce n'est pas lisible.
export function stationDuGist(id: string, fichiers: Record<string, string>, instant: number): StationAppairee | { illisible: string } {
  const brut = fichiers[FICHIER_STATION];
  if (brut === undefined) return { illisible: "its gist no longer holds its state" };
  let lu: Record<string, unknown>;
  try {
    lu = JSON.parse(brut) as Record<string, unknown>;
  } catch {
    return { illisible: "its state on GitHub is not JSON" };
  }
  if (lu === null || typeof lu !== "object" || lu.brigade !== "station") return { illisible: "its state on GitHub is not a brigade station's" };
  const { nom, machine, version, projets, signeDeVie, cadenceMs, arreteeLe, depots } = lu;
  if (!texte(nom) || !texte(version) || !date(signeDeVie)) return { illisible: "its state on GitHub lacks its name, version or last sign of life" };
  if (!Array.isArray(projets) || !projets.every(texte)) return { illisible: "its state on GitHub does not list its projects" };
  const publies = depots !== null && typeof depots === "object" ? (depots as Record<string, unknown>) : {};
  const demandes = new Map((fichiers[FICHIER_PROJETS] === undefined ? [] : (lireDemande(fichiers[FICHIER_PROJETS])?.projets ?? [])).map((projet) => [projet.nom, projet.depot]));
  const arretee = date(arreteeLe) ? arreteeLe : null;
  const { sorte, cuisine } = sorteLue(lu);
  return {
    id,
    name: nom,
    machine: typeof machine === "string" ? machine : "",
    kind: sorte,
    cooks: cuisine,
    version,
    online: enLigne(signeDeVie, arretee, typeof cadenceMs === "number" && cadenceMs > 0 ? cadenceMs : 60_000, instant),
    lastSeen: signeDeVie,
    stoppedAt: arretee,
    projects: projets.map((name) => {
      const publie = publies[name];
      return { name, repository: texte(publie) ? publie : (demandes.get(name) ?? null) };
    }),
  };
}

// Lit les stations du chef sur GitHub. Ne lève pas : un échec est un état.
export async function lireLesStationsDuChef(options: OptionsDeLecture): Promise<StationsDuChef> {
  return (await lireLesStationsEtLeursGists(options)).etat;
}

// La même lecture, avec les fichiers du gist de chaque station listée, par son
// id : ce qu'elle publie d'autre que son état — le rail de ses projets
// (`rail-du-projet.ts`) — se lit sans rappeler GitHub.
export async function lireLesStationsEtLeursGists(options: OptionsDeLecture): Promise<{ etat: StationsDuChef; gists: Map<string, Record<string, string>> }> {
  const gists = new Map<string, Record<string, string>>();
  const etat = await lireEtRanger(options, gists);
  return { etat, gists };
}

async function lireEtRanger(options: OptionsDeLecture, gists: Map<string, Record<string, string>>): Promise<StationsDuChef> {
  const { gh } = options;
  const delaiMs = options.delaiMs ?? DELAI_MS;
  const maintenant = options.maintenant ?? Date.now;
  const env = { ...(options.env ?? process.env), GH_PROMPT_DISABLED: "1", NO_COLOR: "1" };
  const appeler = (chemin: string): Promise<string> =>
    new Promise((resoudre, rejeter) => {
      execFile(gh, ["api", chemin], { timeout: delaiMs, maxBuffer: 16 * 1024 * 1024, env }, (erreur, sortie, erreurs) => {
        if (erreur === null) return resoudre(sortie);
        if (ABSENT.test(erreurs)) return rejeter(new Absent());
        rejeter(new EchecDeGh(echecDeGh(gh, delaiMs, erreur, erreurs)));
      });
    });

  try {
    const appairees: string[] = [];
    let enAttente = 0;
    for (let page = 1; page <= PAGES_MAX; page++) {
      let lus: unknown;
      try {
        lus = JSON.parse(await appeler(`/gists?per_page=${PAR_PAGE}&page=${page}`));
      } catch (erreur) {
        if (erreur instanceof SyntaxError) return { state: "unavailable", cause: "github", reason: "GitHub answered the list of your gists with something that is not JSON, so your stations could not be read." };
        throw erreur;
      }
      if (!Array.isArray(lus)) return { state: "unavailable", cause: "github", reason: "GitHub answered the list of your gists with something that is not a list, so your stations could not be read." };
      for (const gist of lus as Array<{ id?: unknown; files?: Record<string, unknown> } | null>) {
        if (!texte(gist?.id) || gist.files === undefined || gist.files === null || !(FICHIER_STATION in gist.files)) continue;
        if (FICHIER_APPAIRAGE in gist.files) appairees.push(gist.id);
        else enAttente += 1;
      }
      if (lus.length < PAR_PAGE) break;
    }
    const instant = maintenant();
    const stations: StationAppairee[] = [];
    const unreadable: Array<{ id: string; reason: string }> = [];
    for (const id of appairees) {
      let corps: string;
      try {
        corps = await appeler(`/gists/${encodeURIComponent(id)}`);
      } catch (erreur) {
        // Supprimé entre la liste et sa lecture : il n'est plus une station du chef.
        if (erreur instanceof Absent) continue;
        throw erreur;
      }
      let files: Record<string, { content?: unknown } | null> = {};
      try {
        files = (JSON.parse(corps) as { files?: typeof files }).files ?? {};
      } catch {
        unreadable.push({ id, reason: "its gist is not what GitHub returns" });
        continue;
      }
      const fichiers = Object.fromEntries(Object.entries(files).flatMap(([nom, fichier]) => (typeof fichier?.content === "string" ? [[nom, fichier.content]] : [])));
      const station = stationDuGist(id, fichiers, instant);
      if ("illisible" in station) unreadable.push({ id, reason: station.illisible });
      else {
        stations.push(station);
        gists.set(id, fichiers);
      }
    }
    stations.sort((a, b) => a.name.localeCompare(b.name) || a.id.localeCompare(b.id));
    if (stations.length > 0) return { state: "listed", stations, unreadable };
    return { state: "listed", stations, unreadable, reason: pourquoiAucune(unreadable.length, enAttente) };
  } catch (erreur) {
    if (erreur instanceof EchecDeGh) return erreur.etat;
    if (erreur instanceof Absent) return { state: "unavailable", cause: "github", reason: "GitHub did not find the list of your gists, so your stations could not be read." };
    throw erreur;
  }
}

const stationsDe = (combien: number) => (combien === 1 ? "1 station" : `${combien} stations`);

// Pourquoi la liste est vide, en une phrase.
function pourquoiAucune(illisibles: number, enAttente: number): string {
  if (illisibles > 0) return `${stationsDe(illisibles)} paired with this GitHub account ${illisibles === 1 ? "publishes" : "publish"} a state brigade cannot read, so no station can be listed.`;
  if (enAttente > 0) return `No station is paired with this GitHub account yet: ${stationsDe(enAttente)} ${enAttente === 1 ? "waits" : "wait"} for you to type the code ${enAttente === 1 ? "it shows" : "they show"} in its log.`;
  return "No station is paired with this GitHub account yet: start brigade on a machine, then type the code it shows.";
}

export async function principal(appel: Appel): Promise<void> {
  const etat = await lireLesStationsDuChef({ gh: appel.env.BRIGADE_GH_BIN || "gh", env: appel.env });
  appel.dire(JSON.stringify(etat));
  if (etat.state !== "listed") throw new Sortie(1);
}

if (import.meta.main) await enProcess((appel) => principal(appel));
