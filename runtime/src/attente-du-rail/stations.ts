// Les stations du compte et ce qui se dit d'elles, pour le rail qui attend
// (`raison.ts`, `status.ts`) et l'app (vue/rail/github.ts) : celles qui servent
// le projet, une durée en mots courts, et le geste qui débloque.
//
// Ce module ne lit rien et n'importe rien de lourd — l'app le charge dans son
// process principal.
import { disponible, type RetenueParGitHub } from "../enregistrement-station/contrat.ts";
import { stationDe } from "../stations-github/stations.ts";

// Au-delà de ce délai, l'attente d'un ticket sur le rail est plus longue que d'ordinaire (`raison.ts`).
export const DELAI_MS = 5 * 60_000;

// Les labels d'une issue que le manager écarte (`events/manager.ts`, `Ecart`) : il l'a prise. Une issue parquée l'est
// aussi (`estParque`, github-etat/etats.ts).
export const LABELS_D_ECART: readonly string[] = ["roadmap", "epic", "served-elsewhere", "idea"];

// Une station du compte, telle que son enregistrement la dit
// (`enregistrement-station/stations-du-compte.ts`, `StationEnregistree` ;
// `stations-github/stations.ts`, `SigneDeVie`).
export type StationDuCompte = { name: string; lastSeen: string; stoppedAt: string | null; refreshMs: number; heldBy?: RetenueParGitHub | null; selection: readonly string[] | null };

// Une station qui cuit ou juge un ticket du projet le sert, quoi que dise sa sélection : montée sur sa machine, aucune
// app ne lui a écrit de sélection (#3797). Son nom est celui de la prise (`stations-github/stations.ts`, `stationDe`).
export function avecLesStationsQuiCuisent<T extends { name: string; selection: readonly string[] | null }>(lues: readonly T[], depot: string, cuisinent: readonly string[]): T[] {
  return lues.map((station) => {
    const sert = station.selection?.some((choisi) => choisi.toLowerCase() === depot.toLowerCase()) === true;
    return sert || !cuisinent.includes(stationDe(station.name)) ? station : { ...station, selection: [...(station.selection ?? []), depot] };
  });
}

// Les stations du compte, ou pourquoi elles ne se lisent pas.
export type StationsLues = { lues: readonly StationDuCompte[] } | { illisibles: string };

// Le geste qui débloque, quand il y en a un.
export type Geste = "demarrer-la-station" | "ajouter-a-une-station";

const memeDepot = (a: string, b: string) => a.toLowerCase() === b.toLowerCase();

// Une durée, en mots courts : « 3 min », « 14 h », « 2 d ».
export function dureeCourte(ms: number): string {
  const minutes = Math.max(0, Math.floor(ms / 60_000));
  if (minutes < 60) return `${minutes} min`;
  const heures = Math.floor(minutes / 60);
  return heures < 48 ? `${heures} h` : `${Math.floor(heures / 24)} d`;
}

// Les stations qui servent le projet : celles dont la sélection le nomme, et
// celles, disponibles, qui n'en publient aucune — montées sur leur machine,
// elles servent ce que leur appairage demande, que le compte ne montre pas.
// On ne sait pas ce qu'elles servent : on ne dit donc pas qu'aucune ne le sert
// (ticket 3818). Arrêtée ou muette, une station sans sélection ne compte pas.
export function servantesDe<S extends StationDuCompte>(lues: readonly S[], depot: string, maintenant: number): S[] {
  return lues.filter((station) => (station.selection === null ? disponible(station, maintenant) : station.selection.some((choisi) => memeDepot(choisi, depot))));
}

// Le geste, dans les mots du chef : le libellé du bouton de l'app, et la fin de la phrase.
export const MOTS_DU_GESTE: Record<Geste, string> = {
  "demarrer-la-station": "Start it on its computer",
  "ajouter-a-une-station": "Add the project to a station",
};
