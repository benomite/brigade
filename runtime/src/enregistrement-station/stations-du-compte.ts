// Les stations enregistrées sous un compte GitHub, lues par le `gh` de qui les
// cherche — l'app, connectée au même compte (#1706), ou la commande :
//
//   node runtime/src/enregistrement-station/stations-du-compte.ts
//
// qui rend l'état en une ligne JSON — code 0 quand les stations sont listées,
// 1 sinon. `BRIGADE_GH_BIN` nomme le `gh` (`gh` par défaut).
//
// La lecture liste les gists du compte, garde ceux qui portent un
// enregistrement (`contrat.ts`), et lit chacun : la station, si elle est
// disponible à cet instant (la règle de fraîcheur du contrat), et la sélection
// que l'app lui a écrite. Les trois états sont ceux des stations appairées
// (`appairage/stations-du-chef.ts`), dont elle reprend le jugement d'un `gh`
// en échec : `listed`, `sign-in-required`, `unavailable` — jamais une liste
// vide sans raison.
import { enProcess, Sortie, type Appel } from "../appel.ts";
import { echecDeGh, type StationsDuChef } from "../appairage/stations-du-chef.ts";
import { execFile } from "../sans-invite.ts";
import { disponible, enregistrementLu, FICHIER_ENREGISTREMENT, FICHIER_SELECTION, selectionLue, type Plateforme } from "./contrat.ts";

export type StationEnregistree = {
  // Son gist : ce par quoi l'app la reconnaît, et lui écrit sa sélection.
  id: string;
  name: string;
  platform: Plateforme | string;
  machine: string;
  version: string;
  // Le compte sous lequel elle est enregistrée : le propriétaire du gist.
  account: string | null;
  available: boolean;
  registeredAt: string;
  lastSeen: string;
  stoppedAt: string | null;
  refreshMs: number;
  // Les dépôts que l'app lui a choisis ; null tant qu'elle n'en a écrit aucun.
  selection: string[] | null;
};

type Echec = Exclude<StationsDuChef, { state: "listed" }>;

export type StationsDuCompte =
  | { state: "listed"; stations: StationEnregistree[]; unreadable: Array<{ id: string; reason: string }>; reason?: string }
  | Echec;

export type OptionsDeLecture = {
  gh: string;
  delaiMs?: number;
  env?: NodeJS.ProcessEnv;
  maintenant?: () => number;
};

const PAR_PAGE = 100;
const PAGES_MAX = 30;
export const DELAI_MS = 30_000;
const ABSENT = /\(HTTP 404\)/;

class EchecDeGh extends Error {
  readonly etat: Echec;

  constructor(etat: Echec) {
    super(etat.reason);
    this.etat = etat;
  }
}

class Absent extends Error {}

const texte = (valeur: unknown): valeur is string => typeof valeur === "string" && valeur !== "";

// Une station enregistrée, telle que son gist la dit — ou pourquoi elle ne se lit pas.
export function stationDuGist(id: string, fichiers: Record<string, string>, proprietaire: string | null, instant: number): StationEnregistree | { illisible: string } {
  const brut = fichiers[FICHIER_ENREGISTREMENT];
  if (brut === undefined) return { illisible: "its gist no longer holds its registration" };
  const lu = enregistrementLu(brut);
  if ("illisible" in lu) return lu;
  const selection = fichiers[FICHIER_SELECTION] === undefined ? null : selectionLue(fichiers[FICHIER_SELECTION]);
  return {
    id,
    name: lu.name,
    platform: lu.platform,
    machine: lu.machine,
    version: lu.version,
    account: proprietaire,
    available: disponible(lu, instant),
    registeredAt: lu.registeredAt,
    lastSeen: lu.lastSeen,
    stoppedAt: lu.stoppedAt,
    refreshMs: lu.refreshMs,
    selection: selection?.repositories ?? null,
  };
}

// Lit les stations du compte sur GitHub. Ne lève pas : un échec est un état.
export async function lireLesStationsDuCompte(options: OptionsDeLecture): Promise<StationsDuCompte> {
  const { gh } = options;
  const delaiMs = options.delaiMs ?? DELAI_MS;
  const maintenant = options.maintenant ?? Date.now;
  const env = { ...(options.env ?? process.env), GH_PROMPT_DISABLED: "1", NO_COLOR: "1" };
  const appeler = (chemin: string): Promise<string> =>
    new Promise((resoudre, rejeter) => {
      execFile(gh, ["api", chemin], { timeout: delaiMs, maxBuffer: 16 * 1024 * 1024, env }, (erreur, sortie, erreurs) => {
        if (erreur === null) return resoudre(sortie);
        if (ABSENT.test(erreurs)) return rejeter(new Absent());
        const etat = echecDeGh(gh, delaiMs, erreur, erreurs);
        rejeter(new EchecDeGh(etat.state === "sign-in-required" ? { ...etat, reason: "This computer is not signed in to GitHub, so brigade cannot read the stations registered under your account." } : etat));
      });
    });

  try {
    const enregistrees: string[] = [];
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
        if (texte(gist?.id) && gist.files !== null && typeof gist.files === "object" && FICHIER_ENREGISTREMENT in gist.files) enregistrees.push(gist.id);
      }
      if (lus.length < PAR_PAGE) break;
    }
    const instant = maintenant();
    const stations: StationEnregistree[] = [];
    const unreadable: Array<{ id: string; reason: string }> = [];
    for (const id of enregistrees) {
      let corps: string;
      try {
        corps = await appeler(`/gists/${encodeURIComponent(id)}`);
      } catch (erreur) {
        // Supprimé entre la liste et sa lecture : il n'est plus une station du compte.
        if (erreur instanceof Absent) continue;
        throw erreur;
      }
      let lu: { files?: Record<string, { content?: unknown } | null>; owner?: { login?: unknown } | null };
      try {
        lu = JSON.parse(corps) as typeof lu;
      } catch {
        unreadable.push({ id, reason: "its gist is not what GitHub returns" });
        continue;
      }
      const fichiers = Object.fromEntries(Object.entries(lu.files ?? {}).flatMap(([nom, fichier]) => (typeof fichier?.content === "string" ? [[nom, fichier.content]] : [])));
      const station = stationDuGist(id, fichiers, texte(lu.owner?.login) ? lu.owner.login : null, instant);
      if ("illisible" in station) unreadable.push({ id, reason: station.illisible });
      else stations.push(station);
    }
    stations.sort((a, b) => a.name.localeCompare(b.name) || a.id.localeCompare(b.id));
    if (stations.length > 0) return { state: "listed", stations, unreadable };
    return {
      state: "listed",
      stations,
      unreadable,
      reason:
        unreadable.length > 0
          ? `${unreadable.length === 1 ? "1 station registered under this GitHub account publishes" : `${unreadable.length} stations registered under this GitHub account publish`} a registration brigade cannot read, so no station can be listed.`
          : "No station is registered under this GitHub account yet: install brigade's station on a machine, and sign it in to this account.",
    };
  } catch (erreur) {
    if (erreur instanceof EchecDeGh) return erreur.etat;
    if (erreur instanceof Absent) return { state: "unavailable", cause: "github", reason: "GitHub did not find the list of your gists, so your stations could not be read." };
    throw erreur;
  }
}

export async function principal(appel: Appel): Promise<void> {
  const etat = await lireLesStationsDuCompte({ gh: appel.env.BRIGADE_GH_BIN || "gh", env: appel.env });
  appel.dire(JSON.stringify(etat));
  if (etat.state !== "listed") throw new Sortie(1);
}

if (import.meta.main) await enProcess((appel) => principal(appel));
