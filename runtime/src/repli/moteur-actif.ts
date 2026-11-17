// Le moteur de repli d'une station (épique #3518, ticket #3745). Le chef peut
// donner à une station un `fallbackEngine` : une autre valeur de `engine`, ou
// rien. Quand le moteur principal dit son quota épuisé (`station.86`, écrit
// par les gardes du tour), les cooks suivants partent sur le repli ; ceux qui
// tournent déjà ne sont pas interrompus. Avant chaque cook, l'heure de retour
// du principal est relue : passée, le cook suivant y revient, sans geste de
// personne. Sans repli, la station reste retenue comme avant.
//
// Le repli et l'épuisement de chaque moteur se lisent au journal
// (`station.fallback`, `station.86`) : la carte de la station (`station`)
// dit sur quel moteur elle cuisine, et un redémarrage n'oublie rien.
//
// Le moteur principal est celui du nom de la station (`<machine>/<engine>`) ;
// le repli se règle sur la ligne du projet de la station
// (`BRIGADE_FALLBACK_ENGINE=<engine>`, `station/configuration.ts`). Le moteur
// choisi est remis au cook dans `BRIGADE_ENGINE` : les moteurs eux-mêmes sont
// l'affaire d'un autre ticket.
import type { EtatStation } from "../projections/stations.ts";
import { NOM_DE_STATION } from "../stations-declarees.ts";

const VARIABLE_DU_REPLI = "BRIGADE_FALLBACK_ENGINE";
export const VARIABLE_DU_MOTEUR = "BRIGADE_ENGINE";

// Une station et ses moteurs, et jusqu'à quand chacun dit son quota épuisé
// (ISO) : null, il ne l'a pas dit. Les noms sont ceux de son état au journal.
export type StationEtMoteurs = Pick<EtatStation, "station" | "engine" | "fallbackEngine" | "quotaUntil" | "fallbackQuotaUntil">;

// Ce que la carte de la station montre : le moteur du prochain cook (null :
// aucun, la station est retenue), s'il est le repli, et jusqu'à quand le
// principal est bloqué.
export type StatutDuMoteur = {
  engine: string | null;
  fallback: boolean;
  blocked: boolean;
  blockedUntil: string | null;
};

const MOTEUR = /^[\p{Ll}\p{N}][\p{Ll}\p{N}-]*$/u;

// Les moteurs d'une station : le principal tiré de son nom, le repli de son
// environnement. Un repli qui n'est pas un nom de moteur, ou qui est le
// principal lui-même, est écarté et dit dans `refus` : la station tourne
// alors sans repli, comme avant.
export function moteursDeLaStation(nom: string, env: Record<string, string | undefined>): { engine: string; fallbackEngine: string | null; refus: string | null } {
  const engine = NOM_DE_STATION.test(nom) ? nom.slice(nom.indexOf("/") + 1) : nom;
  const lu = env[VARIABLE_DU_REPLI]?.trim() ?? "";
  if (lu === "") return { engine, fallbackEngine: null, refus: null };
  if (!MOTEUR.test(lu)) return { engine, fallbackEngine: null, refus: `${VARIABLE_DU_REPLI}=${lu} is not an engine name (lowercase letters, digits and dashes): station ${nom} runs with no fallback engine` };
  if (lu === engine) return { engine, fallbackEngine: null, refus: `${VARIABLE_DU_REPLI}=${lu} is the main engine of station ${nom} itself: the station runs with no fallback engine` };
  return { engine, fallbackEngine: lu, refus: null };
}

const tient = (jusqua: string | null, maintenant: Date) => jusqua !== null && jusqua > maintenant.toISOString();

// Le moteur du prochain cook de `station`, relu à `maintenant`.
export function activeEngine(station: StationEtMoteurs, maintenant: Date = new Date()): StatutDuMoteur {
  if (!tient(station.quotaUntil, maintenant)) return { engine: station.engine, fallback: false, blocked: false, blockedUntil: null };
  const blockedUntil = station.quotaUntil;
  if (station.fallbackEngine === null) return { engine: null, fallback: false, blocked: true, blockedUntil };
  // Le repli épuisé lui aussi : la station est retenue jusqu'au premier retour.
  if (tient(station.fallbackQuotaUntil, maintenant)) {
    const premier = [blockedUntil, station.fallbackQuotaUntil].sort()[0] ?? blockedUntil;
    return { engine: null, fallback: false, blocked: true, blockedUntil: premier };
  }
  return { engine: station.fallbackEngine, fallback: true, blocked: false, blockedUntil };
}

// Le statut tel que la station le dit quand il change.
export function direLeStatut(station: Pick<StationEtMoteurs, "station" | "engine" | "fallbackEngine">, statut: StatutDuMoteur): string {
  const jusqua = statut.blockedUntil === null ? "" : ` until ${statut.blockedUntil}`;
  if (statut.blocked && station.fallbackEngine !== null) return `station ${station.station} cooks nothing: the quotas of ${station.engine} and of its fallback ${station.fallbackEngine} are reached${jusqua}`;
  if (statut.blocked) return `station ${station.station} cooks nothing: the quota of ${station.engine} is reached${jusqua}, and the station has no fallback engine`;
  if (statut.fallback) return `station ${station.station} cooks on ${statut.engine}: the quota of ${station.engine} is reached${jusqua}`;
  return `station ${station.station} cooks on ${statut.engine}`;
}

// La ligne « quota » de la carte de la station (`station`).
export function direLeQuotaDeLaCarte(station: StationEtMoteurs, maintenant: Date = new Date()): string {
  const statut = activeEngine(station, maintenant);
  if (statut.fallback) return `86 — ${station.engine} exhausted, back at ${statut.blockedUntil}; cooking on the fallback engine ${statut.engine} until then, the running cooks go on`;
  if (!statut.blocked) return "available";
  if (station.fallbackEngine !== null) return `86 — ${station.engine} and its fallback ${station.fallbackEngine} exhausted, back at ${statut.blockedUntil}; no ticket is taken until then`;
  return `86 — exhausted, back at ${statut.blockedUntil}; no ticket is taken until then, the station has no fallback engine`;
}
