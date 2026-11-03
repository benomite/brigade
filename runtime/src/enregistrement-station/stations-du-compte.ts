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
import { Absent, appelDeGhApi, etatDeLEchec, parcourirLesGists, texte, type OptionsDeLecture, type StationsDuChef } from "../appairage/stations-du-chef.ts";
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
  const maintenant = options.maintenant ?? Date.now;
  const appeler = appelDeGhApi(options, (etat) => (etat.state === "sign-in-required" ? { ...etat, reason: "This computer is not signed in to GitHub, so brigade cannot read the stations registered under your account." } : etat));

  try {
    const enregistrees: string[] = [];
    const illisible = await parcourirLesGists(appeler, (id, fichiers) => {
      if (FICHIER_ENREGISTREMENT in fichiers) enregistrees.push(id);
    });
    if (illisible !== null) return illisible;
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
    return etatDeLEchec(erreur);
  }
}

export async function principal(appel: Appel): Promise<void> {
  const etat = await lireLesStationsDuCompte({ gh: appel.env.BRIGADE_GH_BIN || "gh", env: appel.env });
  appel.dire(JSON.stringify(etat));
  if (etat.state !== "listed") throw new Sortie(1);
}

if (import.meta.main) await enProcess((appel) => principal(appel));
