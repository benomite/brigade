// Les stations d'un projet servi sur l'état GitHub seul, telles que GitHub les
// dit (#2358, épique #2356) : aucune n'y est principale, la box pas plus qu'un
// ordinateur — une seule règle pour toutes, et une seule source, GitHub. Ni le
// journal d'une station, ni ses `facts`.
//
// Deux choses s'y lisent :
//   - ses prises : le commentaire de prise qui tient chaque ticket du rail
//     (`github-etat/prise.ts`) — la station qui le tient le cuisine ;
//   - son signe de vie : l'enregistrement que chaque station réécrit dans son
//     gist, sous le compte du chef (`enregistrement-station/contrat.ts`,
//     `lastSeen`), et les dépôts que l'app lui a choisis (`selection`).
//
// Une station du projet est l'une de celles à qui l'app a choisi son dépôt, ou
// une station qui tient un de ses tickets. Elle est dans l'un de trois états :
//   - `cooking` : elle tient au moins un ticket, quoi que dise son signe de vie ;
//   - `idle` : elle n'en tient aucun, et son signe de vie est frais — la règle
//     de fraîcheur du contrat (`disponible`) ;
//   - `silent` : elle n'en tient aucun, et elle s'est tue — arrêtée, ou plus de
//     signe de vie depuis deux rafraîchissements manqués.
// `atteinte` dit, à part, si son signe de vie est frais : une station qui tient
// un ticket et s'est tue cuit encore pour GitHub — le bail le lui reprendra —,
// et l'écran le dit. Null : aucun signe de vie ne se lit pour elle.
//
// Le nom d'une station est celui de ses prises : `<machine>/claude`, la
// machine tirée du nom qu'elle publie, comme le projet la déclare
// (`projets/preparer.ts`, `machineDe`, que ce module redit sans l'importer :
// preparer.ts tire avec lui le journal, que l'app ne charge pas — un test les
// compare).
import { disponible } from "../enregistrement-station/contrat.ts";

// Le moteur des stations qu'un poste lance (`une-station.ts`).
const MOTEUR = "claude";

// La prise qui tient un ticket du rail : sa station, le ticket et son titre, l'heure du commentaire.
export type PriseDuRail = { ticket: number; titre: string; station: string; le: string };

// Ce que l'enregistrement d'une station dit d'elle (`StationEnregistree` de
// `enregistrement-station/stations-du-compte.ts`, en partie).
export type SigneDeVie = { name: string; lastSeen: string; stoppedAt: string | null; refreshMs: number; selection: readonly string[] | null };

export type EtatSurGithub = "cooking" | "idle" | "silent";

export type StationSurGithub = {
  // Son nom, celui de ses prises.
  station: string;
  // Le nom qu'elle publie dans son enregistrement ; null sans enregistrement lu.
  nom: string | null;
  etat: EtatSurGithub;
  atteinte: boolean | null;
  // Ses cooks : les tickets qu'elle tient, dans l'ordre de leur prise.
  cooks: { ticket: number; titre: string }[];
  // Son dernier signe de vie sur GitHub — nul sans enregistrement lu.
  signeDeVie: string | null;
};

// Le nom de machine d'une station, tel que `projets/preparer.ts` le tire.
export const machineDe = (nom: string) => nom.toLowerCase().replace(/[^\p{Ll}\p{N}-]+/gu, "-").replace(/^-+|-+$/g, "") || "station";

// Le nom sous lequel une station enregistrée prend les tickets.
export const stationDe = (nom: string) => `${machineDe(nom)}/${MOTEUR}`;

const memeDepot = (a: string, b: string) => a.toLowerCase() === b.toLowerCase();

// Les stations du projet `depot`, dans l'ordre de leur nom. `signes` : les
// enregistrements du compte, ou null quand ils n'ont pas pu être lus — seules
// les stations qui tiennent un ticket se disent alors, sans signe de vie.
// Deux enregistrements de la même machine : le plus frais l'emporte.
export function stationsSurGithub(options: { depot: string; prises: readonly PriseDuRail[]; signes: readonly SigneDeVie[] | null; maintenant: number }): StationSurGithub[] {
  const { depot, prises, signes, maintenant } = options;
  const parStation = new Map<string, SigneDeVie>();
  for (const signe of signes ?? []) {
    const station = stationDe(signe.name);
    const tenu = parStation.get(station);
    if (tenu === undefined || Date.parse(signe.lastSeen) > Date.parse(tenu.lastSeen)) parStation.set(station, signe);
  }
  const tenues = new Map<string, PriseDuRail[]>();
  for (const prise of [...prises].sort((a, b) => Date.parse(a.le) - Date.parse(b.le) || a.ticket - b.ticket)) tenues.set(prise.station, [...(tenues.get(prise.station) ?? []), prise]);
  const choisies = [...parStation].filter(([, { selection }]) => selection?.some((choisi) => memeDepot(choisi, depot)) === true).map(([station]) => station);
  const noms = [...new Set([...choisies, ...tenues.keys()])].sort((a, b) => a.localeCompare(b));
  return noms.map((station) => {
    const signe = parStation.get(station);
    const cooks = (tenues.get(station) ?? []).map(({ ticket, titre }) => ({ ticket, titre }));
    const atteinte = signe === undefined ? null : disponible(signe, maintenant);
    const etat: EtatSurGithub = cooks.length > 0 ? "cooking" : atteinte === true ? "idle" : "silent";
    return { station, nom: signe?.name ?? null, etat, atteinte, cooks, signeDeVie: signe?.lastSeen ?? null };
  });
}
