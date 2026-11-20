// Les stations du compte, telles que la file du rail les lit (#3433) : qui sert
// le projet, et le geste qui débloque une file qu'aucune ne cuit. La même lecture
// pour le rail de l'app (vue/rail/github.ts) et pour `brigade <project> status`
// (`status.ts`), venue du rail bloqué que le superviseur a remplacé (#3914).
//
// Ce module ne lit rien et n'importe que des feuilles : l'app le charge dans son
// process principal.
import { disponible, type RetenueParGitHub } from "../enregistrement-station/contrat.ts";
import { stationDe } from "../stations-github/stations.ts";

// Au-delà de ce délai, une file qui attend attend plus longtemps que d'ordinaire :
// un cook prend d'ordinaire un ticket au tour qui suit.
export const DELAI_MS = 5 * 60_000;

// Les labels que le manager pose quand il écarte une issue (`events/manager.ts`, `Ecart`) : elle n'est pas en file.
export const LABELS_D_ECART: readonly string[] = ["roadmap", "epic", "question", "decision", "blocked-on-human", "served-elsewhere", "set-aside:failures", "idea"];

// Une station du compte, telle que son enregistrement la dit
// (`enregistrement-station/stations-du-compte.ts`, `StationEnregistree` ;
// `stations-github/stations.ts`, `SigneDeVie`).
export type StationDuCompte = { name: string; lastSeen: string; stoppedAt: string | null; refreshMs: number; heldBy?: RetenueParGitHub | null; selection: readonly string[] | null };

// Les stations du compte, ou pourquoi elles ne se lisent pas.
export type StationsLues = { lues: readonly StationDuCompte[] } | { illisibles: string };

// Le geste qui débloque, quand il y en a un.
export type Geste = "demarrer-la-station" | "ajouter-a-une-station";

// Le geste, dans les mots du chef : le libellé du bouton de l'app, et la fin de la phrase.
export const MOTS_DU_GESTE: Record<Geste, string> = {
  "demarrer-la-station": "Start it on its computer",
  "ajouter-a-une-station": "Add the project to a station",
};

// Une station qui cuit ou juge un ticket du projet le sert, quoi que dise sa sélection : montée sur sa machine, aucune
// app ne lui a écrit de sélection (#3797). Son nom est celui de la prise (`stations-github/stations.ts`, `stationDe`).
export function avecLesStationsQuiCuisent<T extends { name: string; selection: readonly string[] | null }>(lues: readonly T[], depot: string, cuisinent: readonly string[]): T[] {
  return lues.map((station) => {
    const sert = station.selection?.some((choisi) => choisi.toLowerCase() === depot.toLowerCase()) === true;
    return sert || !cuisinent.includes(stationDe(station.name)) ? station : { ...station, selection: [...(station.selection ?? []), depot] };
  });
}

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
