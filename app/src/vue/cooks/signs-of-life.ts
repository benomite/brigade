// Les signes de vie des stations du compte, pour l'onglet Cooks d'un projet sur GitHub seul (ticket 2358) : chaque station
// réécrit son enregistrement dans son gist toutes les deux minutes (`refreshMs`) ; le process principal le relit à ce pas, pas plus vite — le rail, lui, se relit toutes les trente
// secondes, et chaque lecture reprend la dernière lecture des signes. Une lecture que la vue a déjà faite (les stations
// de l'accueil) la remplace, sans appel de plus.
//
// Une lecture qui échoue garde la dernière qui a réussi : ses signes de vie vieillissent d'eux-mêmes, et une station
// qui s'est tue depuis se dit tue. Sans aucune lecture réussie, la raison de l'échec, en une phrase.
import type { StationsOfAccountRead as StationsDuCompte } from "../../stations-of-account.ts";
import type { SignsOfLife } from "../rail/github.ts";

// Le pas où une station réécrit son signe de vie.
export const NOT_OF_SIGNS_MS = 120_000;

// Ce qu'une lecture des stations du compte dit de leurs signes de vie.
export function signsOf(readOne: StationsDuCompte): SignsOfLife {
  if (readOne.state !== "listed") return { illisible: readOne.reason };
  // La limite de GitHub qui la retient (ticket 2443) : elle reste la station de ses projets.
  return { lus: readOne.stations.map(({ id, name, lastSeen, stoppedAt, refreshMs, selection, heldBy }) => ({ id, name, lastSeen, stoppedAt, refreshMs, selection, ...(heldBy ? { heldBy } : {}) })) };
}

// La station de cet ordinateur, que l'app voit tourner (son process, workstation/station.ts), n'est pas tue, même quand le quota
// GitHub l'empêche d'écrire son signe de vie : son dernier signe est cet instant. `id` : son gist (outages/login.ts,
// `gistLocal`), nul quand elle ne tourne pas ici — rien ne change alors.
export function withTheStationLocale<S extends { lastSeen: string; id?: string }>(signs: readonly S[], id: string | null, now: number): S[] {
  if (id === null) return [...signs];
  const instant = new Date(now).toISOString();
  return signs.map((sign) => (sign.id === id && Date.parse(sign.lastSeen) < now ? { ...sign, lastSeen: instant } : sign));
}

// Les présences qui disent une station du compte en ligne (stations-of-account.ts, `avecLeurEtat`), et celle de la station de
// cet ordinateur quand l'app la voit tourner : son nom, celui de son enregistrement.
export type Presence = { nom: string; etat: string };
export function withThePresenceLocale(presences: readonly Presence[], stations: readonly { id: string; name: string }[], id: string | null): Presence[] {
  const here = id === null ? undefined : stations.find((station) => station.id === id);
  return here === undefined ? [...presences] : [...presences, { nom: here.name, etat: "en-ligne" }];
}

export function holdTheSignsOfLife(options: { lire: () => Promise<StationsDuCompte>; maintenant?: () => number; pasMs?: number }) {
  const now = options.maintenant ?? Date.now;
  const not = options.pasMs ?? NOT_OF_SIGNS_MS;
  let last: { signes: SignsOfLife; a: number } | null = null;
  let inProgress: Promise<SignsOfLife> | null = null;
  const keep = (signs: SignsOfLife, a: number) => {
    // Un échec n'efface pas une lecture réussie.
    if ("lus" in signs || last === null || !("lus" in last.signes)) last = { signes: signs, a };
    else last = { ...last, a };
  };
  return {
    // Les derniers signes de vie, relus quand ils ont plus d'un pas.
    signes(): Promise<SignsOfLife> {
      if (last !== null && now() - last.a < not) return Promise.resolve(last.signes);
      inProgress ??= options
        .lire()
        .then(signsOf, (error: unknown) => ({ illisible: `your stations could not be read on GitHub: ${error instanceof Error ? error.message : String(error)}` }))
        .then((signs) => {
          keep(signs, now());
          return (last as { signes: SignsOfLife }).signes;
        })
        .finally(() => (inProgress = null));
      return inProgress;
    },
    // Une lecture faite ailleurs.
    poser(readOne: StationsDuCompte): void {
      keep(signsOf(readOne), now());
    },
  };
}
