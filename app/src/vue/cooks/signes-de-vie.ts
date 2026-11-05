// Les signes de vie des stations du compte, pour l'onglet Cooks d'un projet sur GitHub seul (ticket 2358) : chaque station
// réécrit son enregistrement dans son gist toutes les deux minutes (runtime/src/enregistrement-station/contrat.ts,
// `RAFRAICHI_MS`) ; le process principal le relit à ce pas, pas plus vite — le rail, lui, se relit toutes les trente
// secondes, et chaque lecture reprend la dernière lecture des signes. Une lecture que la vue a déjà faite (les stations
// de l'accueil) la remplace, sans appel de plus.
//
// Une lecture qui échoue garde la dernière qui a réussi : ses signes de vie vieillissent d'eux-mêmes, et une station
// qui s'est tue depuis se dit tue. Sans aucune lecture réussie, la raison de l'échec, en une phrase.
import type { StationsDuCompte } from "../../../../runtime/src/enregistrement-station/stations-du-compte.ts";
import type { SignesDeVie } from "../rail/github.ts";

// Le pas où une station réécrit son signe de vie.
export const PAS_DES_SIGNES_MS = 120_000;

// Ce qu'une lecture des stations du compte dit de leurs signes de vie.
export function signesDe(lu: StationsDuCompte): SignesDeVie {
  if (lu.state !== "listed") return { illisible: lu.reason };
  return { lus: lu.stations.map(({ name, lastSeen, stoppedAt, refreshMs, selection }) => ({ name, lastSeen, stoppedAt, refreshMs, selection })) };
}

export function tenirLesSignesDeVie(options: { lire: () => Promise<StationsDuCompte>; maintenant?: () => number; pasMs?: number }) {
  const maintenant = options.maintenant ?? Date.now;
  const pas = options.pasMs ?? PAS_DES_SIGNES_MS;
  let dernier: { signes: SignesDeVie; a: number } | null = null;
  let enCours: Promise<SignesDeVie> | null = null;
  const garder = (signes: SignesDeVie, a: number) => {
    // Un échec n'efface pas une lecture réussie.
    if ("lus" in signes || dernier === null || !("lus" in dernier.signes)) dernier = { signes, a };
    else dernier = { ...dernier, a };
  };
  return {
    // Les derniers signes de vie, relus quand ils ont plus d'un pas.
    signes(): Promise<SignesDeVie> {
      if (dernier !== null && maintenant() - dernier.a < pas) return Promise.resolve(dernier.signes);
      enCours ??= options
        .lire()
        .then(signesDe, (erreur: unknown) => ({ illisible: `your stations could not be read on GitHub: ${erreur instanceof Error ? erreur.message : String(erreur)}` }))
        .then((signes) => {
          garder(signes, maintenant());
          return (dernier as { signes: SignesDeVie }).signes;
        })
        .finally(() => (enCours = null));
      return enCours;
    },
    // Une lecture faite ailleurs.
    poser(lu: StationsDuCompte): void {
      garder(signesDe(lu), maintenant());
    },
  };
}
