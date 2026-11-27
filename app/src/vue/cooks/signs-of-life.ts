// Les signes de vie des stations du compte, pour l'onglet Cooks d'un projet sur GitHub seul (ticket 2358) : ce qu'une
// lecture des stations du compte en dit — le dernier signe de chacune, sa cadence, ce qui la retient.
import type { StationsOfAccountRead as StationsDuCompte } from "../../stations-of-account.ts";
import type { SignOfLife } from "./taken.ts";

// Les signes de vie des stations du compte, tels que le process principal les a lus — ou pourquoi ils ne l'ont pas été,
// en une phrase. `id` : son gist.
export type SignsOfLife = { lus: (SignOfLife & { id?: string })[] } | { illisible: string };

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
