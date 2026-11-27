// Les signes de vie des stations du compte, pour l'onglet Cooks d'un projet sur GitHub seul (ticket 2358) : ce qu'une
// lecture des stations du compte en dit — le dernier signe de chacune, sa cadence, ce qui la retient.
import type { StationsOfAccountRead as StationsDuCompte } from "../../stations-of-account.ts";
import type { SignOfLife } from "./taken.ts";
import { quotaGithubRead, type QuotaGithub } from "../pause-quota/pause-quota.ts";

// Les signes de vie des stations du compte, tels que le process principal les a lus — ou pourquoi ils ne l'ont pas été,
// en une phrase. `quotaGithub` : son état de quota GitHub, quand elle le publie (ticket 3482, vue/pause-quota/) ; `id`, son gist.
export type SignsOfLife = { lus: (SignOfLife & { id?: string; quotaGithub?: QuotaGithub })[] } | { illisible: string };

// Ce qu'une lecture des stations du compte dit de leurs signes de vie.
export function signsOf(readOne: StationsDuCompte): SignsOfLife {
  if (readOne.state !== "listed") return { illisible: readOne.reason };
  // La limite de GitHub qui la retient (ticket 2443) : elle reste la station de ses projets. Son état de quota GitHub
  // (ticket 3482), quand son état le porte et qu'il se lit.
  return {
    lus: readOne.stations.map((station) => {
      const { id, name, lastSeen, stoppedAt, refreshMs, selection, heldBy } = station;
      const quotaGithub = quotaGithubRead((station as { quotaGithub?: unknown }).quotaGithub);
      return { id, name, lastSeen, stoppedAt, refreshMs, selection, ...(heldBy ? { heldBy } : {}), ...(quotaGithub === null ? {} : { quotaGithub }) };
    }),
  };
}
