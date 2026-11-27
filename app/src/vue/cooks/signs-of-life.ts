// Les signes de vie des stations du compte, pour l'onglet Cooks d'un projet sur GitHub seul (ticket 2358) : chaque station
// réécrit son enregistrement dans son gist toutes les deux minutes (runtime/src/enregistrement-station/contrat.ts,
// `RAFRAICHI_MS`) ; le process principal le relit à ce pas, pas plus vite — le rail, lui, se relit toutes les trente
// secondes, et chaque lecture reprend la dernière lecture des signes. Une lecture que la vue a déjà faite (les stations
// de l'accueil) la remplace, sans appel de plus.
//
// Une lecture qui échoue garde la dernière qui a réussi : ses signes de vie vieillissent d'eux-mêmes, et une station
// qui s'est tue depuis se dit tue. Sans aucune lecture réussie, la raison de l'échec, en une phrase.
import type { StationsDuCompte } from "../../../../runtime/src/enregistrement-station/stations-du-compte.ts";
import type { SignsOfLife } from "../rail/github.ts";
import { quotaGithubRead } from "../pause-quota/pause-quota.ts";

// Le pas où une station réécrit son signe de vie.
export const NOT_OF_SIGNS_MS = 120_000;

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
