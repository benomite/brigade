// Le rail d'un projet, lu sur un ordinateur où le chef n'a rien que l'app
// (#1432) : ni `ssh` vers la station qui le sert, ni état local. Les tickets
// viennent de la source même que le Mac lit sur la station — le journal du
// projet —, telle que la station la publie dans son gist (`rail-publie.ts`) :
// mêmes numéros, même ordre, même mot d'état que le `rail` de `facts`.
//
// La lecture est celle des stations du chef (`stations-du-chef.ts`), par le
// `gh` de l'ordinateur : elle garde les stations appairées qui servent le
// projet — par son nom, ou par son dépôt `<owner>/<repo>` —, en ligne d'abord,
// puis la plus récente, et lit le rail que la première publie.
//
// Elle rend toujours l'un de trois états, jamais une liste vide sans raison :
//   - `listed` : `tickets`, le rail, dans son ordre — chacun son `ticket`, son
//     `state` (le mot `etat` de `facts`), son `title` et son `url` ; `station`,
//     celle qui le publie, et `publishedAt`, l'heure de sa publication. Un rail
//     vide le dit en une phrase (`reason`) ;
//   - `sign-in-required` : ce `gh` n'est connecté à aucun compte GitHub, ou son
//     jeton n'est plus bon — `reason` en une phrase, et `action`, le geste que
//     l'app sait déclencher ;
//   - `unavailable` : le rail n'a pas pu être lu — `cause` (stable :
//     `gh-missing`, `network`, `timeout`, `rate-limit`, `github`, `not-served` —
//     aucune station du compte ne sert le projet —, `not-published` — sa station
//     ne publie pas de rail —, `unreadable`), `reason` en une phrase, `link`
//     quand une page lève la cause, `action` quand l'app peut la lever (se
//     connecter à GitHub, sous un autre compte), et `detail`, ce que `gh` a dit.
//
// L'app l'importe (`lireLeRailDuProjet`), ou lance la commande :
//
//   node runtime/src/appairage/rail-du-projet.ts <projet | owner/repo>
//
// qui rend cet état en une ligne JSON — code 0 quand le rail est lu, 1 sinon.
// `BRIGADE_GH_BIN` nomme le `gh` (`gh` par défaut).
import { enProcess, Sortie, type Appel } from "../appel.ts";
import { FICHIER_RAIL, railDuDocument } from "./rail-publie.ts";
import { connexionGitHub, DELAI_MS, lireLesStationsEtLeursGists, type CauseIndisponible, type Connexion, type OptionsDeLecture, type StationAppairee, type StationsDuChef } from "./stations-du-chef.ts";

export type TicketDuRail = { ticket: number; state: string; title: string; url: string };

export type CauseSansRail = CauseIndisponible | "not-served" | "not-published" | "unreadable";

export type RailDuProjet =
  | {
      state: "listed";
      project: string;
      repository: string | null;
      station: { id: string; name: string; online: boolean };
      publishedAt: string;
      tickets: TicketDuRail[];
      reason?: string;
    }
  | { state: "sign-in-required"; project: string; reason: string; action: Connexion }
  | { state: "unavailable"; project: string; cause: CauseSansRail; reason: string; link?: string; action?: Connexion; detail?: string };

export type OptionsDuRail = OptionsDeLecture & {
  // Le nom du projet, ou son dépôt `<owner>/<repo>`.
  project: string;
};

const derniereLigne = (texte: string) => texte.trim().split("\n").at(-1)?.trim().replace(/[.\s]+$/, "") ?? "";

// Pourquoi les stations n'ont pas pu être lues, dit du rail du projet.
function sansLesStations(projet: string, gh: string, delaiMs: number, etat: Exclude<StationsDuChef, { state: "listed" }>): RailDuProjet {
  if (etat.state === "sign-in-required") {
    return { state: "sign-in-required", project: projet, reason: `This computer is not signed in to GitHub, so brigade cannot read the rail of ${projet}, which its station publishes there.`, action: etat.action };
  }
  const { cause, link, detail } = etat;
  const autour = { ...(link === undefined ? {} : { link }), ...(detail === undefined ? {} : { detail }) };
  const reasons: Record<CauseIndisponible, string> = {
    "gh-missing": `The GitHub CLI (\`${gh}\`) is not installed on this computer, and brigade reads the rail of ${projet} on GitHub through it.`,
    timeout: `GitHub gave no answer within ${Math.round(delaiMs / 1000)} s, so the rail of ${projet} could not be read.`,
    "rate-limit": `GitHub is limiting this account's calls for now, so the rail of ${projet} could not be read: it will be once its window ends.`,
    network: `GitHub cannot be reached from this computer, so the rail of ${projet} could not be read: check its network connection.`,
    github: `GitHub refused to give the rail of ${projet}${detail === undefined || derniereLigne(detail) === "" ? "" : `: ${derniereLigne(detail)}`}.`,
  };
  return { state: "unavailable", project: projet, cause, reason: reasons[cause], ...autour };
}

// Ce que la station dit du projet, s'il est des siens.
const projetDe = (station: StationAppairee, projet: string) => station.projects.find(({ name, repository }) => name === projet || repository === projet);

// Lit le rail du projet sur GitHub. Ne lève pas : un échec est un état.
export async function lireLeRailDuProjet(options: OptionsDuRail): Promise<RailDuProjet> {
  const { gh, project: projet } = options;
  const { etat, gists } = await lireLesStationsEtLeursGists(options);
  if (etat.state !== "listed") return sansLesStations(projet, gh, options.delaiMs ?? DELAI_MS, etat);

  // Celles qui le servent : en ligne d'abord, puis la plus récente.
  const siennes = etat.stations
    .filter((station) => projetDe(station, projet) !== undefined)
    .sort((a, b) => Number(b.online) - Number(a.online) || Date.parse(b.lastSeen) - Date.parse(a.lastSeen));
  if (siennes.length === 0) {
    return {
      state: "unavailable",
      project: projet,
      cause: "not-served",
      reason: `No station paired with this GitHub account serves ${projet}, so its rail cannot be read: sign in to GitHub with the account your stations publish to.`,
      action: connexionGitHub(gh),
    };
  }

  let illisible: StationAppairee | null = null;
  for (const station of siennes) {
    const sien = projetDe(station, projet);
    if (sien === undefined) continue;
    const lu = railDuDocument(gists.get(station.id)?.[FICHIER_RAIL], sien.name);
    if (lu === "illisible") illisible ??= station;
    if (typeof lu === "string") continue;
    const tickets = lu.tickets.map(({ ticket, etat: mot, titre, url }) => ({ ticket, state: mot, title: titre, url }));
    return {
      state: "listed",
      project: sien.name,
      repository: sien.repository,
      station: { id: station.id, name: station.name, online: station.online },
      publishedAt: station.lastSeen,
      tickets,
      ...(tickets.length === 0 ? { reason: `The rail of ${sien.name}, as ${station.name} publishes it, holds no ticket.` } : {}),
    };
  }
  if (illisible !== null) {
    return { state: "unavailable", project: projet, cause: "unreadable", reason: `The station ${illisible.name} publishes a rail for ${projet} that this version of brigade cannot read: update brigade on this computer.` };
  }
  const premiere = siennes[0] as StationAppairee;
  // Une station qui publie des rails, mais pas encore le sien : son journal ne
  // s'est pas lu à sa dernière écriture.
  const publieDesRails = gists.get(premiere.id)?.[FICHIER_RAIL] !== undefined;
  return {
    state: "unavailable",
    project: projet,
    cause: "not-published",
    reason: publieDesRails
      ? `The station ${premiere.name} serves ${projet} but has not published its rail yet: it does at its next sign of life, within five minutes.`
      : `The station ${premiere.name} serves ${projet} but publishes no rail on GitHub: update brigade on it, and its rail shows here within five minutes.`,
  };
}

const USAGE = "usage: node runtime/src/appairage/rail-du-projet.ts <project | owner/repo>";

export async function principal(appel: Appel): Promise<void> {
  const [projet, ...reste] = appel.args;
  if (projet === undefined || projet === "" || reste.length > 0) {
    appel.redire(USAGE);
    throw new Sortie(2);
  }
  const etat = await lireLeRailDuProjet({ gh: appel.env.BRIGADE_GH_BIN || "gh", env: appel.env, project: projet });
  appel.dire(JSON.stringify(etat));
  if (etat.state !== "listed") throw new Sortie(1);
}

if (import.meta.main) await enProcess((appel) => principal(appel));
