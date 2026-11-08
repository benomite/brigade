// Les stations contributrices du projet, sous Settings (#2936, épique #2927) : celles qui ont pris un ticket, et la liste de
// celles que le chef refuse, lues et changées par la commande du runtime `contributor-stations`, là où la cuisine du projet
// tourne, comme les humains (humains-du-projet.ts) :
//   - `contributor-stations` : `{"stations":[{station, login, refused}]}` ;
//   - `contributor-stations refuse <station>`, `… accept <station>` : `{"ok":true}`, ou `{"ok":false,"message":<la ligne du refus>}`.
// L'app ne juge que ce qui ne s'écrirait pas en mots d'une commande : un nom de station. Le reste est jugé par le runtime.
import type { Lu, Rendu } from "./box.ts";
import { detailDe, sansLaCommande } from "./reglages-du-projet.ts";

export type StationContributrice = { station: string; login: string | null; refused: boolean };
export type LectureDesStations = StationContributrice[] | { sans: string; detail?: string };
export type EcritureDUneStation = { ok: true } | { refus: string; detail?: string };

const estObjet = (valeur: unknown): valeur is Record<string, unknown> => typeof valeur === "object" && valeur !== null && !Array.isArray(valeur);
// Le nom d'une station : celui que sa prise signe (runtime/src/station-contributrice/reclamation.ts).
const NOM_DE_STATION = /^[A-Za-z0-9._/-]+$/;

// La dernière ligne de la sortie, lue en JSON ; `null` si elle ne se lit pas.
function reponseDe(rendu: Rendu): unknown {
  try {
    return JSON.parse(rendu.sortie.trim().split("\n").at(-1) ?? "");
  } catch {
    return null;
  }
}

// Les stations contributrices du projet, là où sa cuisine tourne ; sinon, pourquoi elles ne se lisent pas.
export async function lireLesStations(projet: string, lu: Lu | undefined, lancer: (lu: Lu, commande: string) => Promise<Rendu>): Promise<LectureDesStations> {
  if (lu === undefined) return { sans: `${projet} has no station: its contributor stations are read where its kitchen runs` };
  const rendu = await lancer(lu, "contributor-stations");
  if (sansLaCommande(rendu)) return { sans: "contributor stations unavailable: this station's runtime does not give them yet — update it", detail: detailDe(rendu) };
  const reponse = rendu.erreur === null ? reponseDe(rendu) : null;
  const stations = estObjet(reponse) && Array.isArray(reponse.stations) ? reponse.stations : null;
  if (stations === null || !stations.every((station) => estObjet(station) && typeof station.station === "string" && typeof station.refused === "boolean" && (station.login === null || typeof station.login === "string"))) {
    return { sans: "contributor stations unavailable", detail: detailDe(rendu) };
  }
  return stations.map((station) => ({ station: station.station as string, login: station.login as string | null, refused: station.refused as boolean }));
}

// Les mots de l'écriture, ou pourquoi elle ne s'écrit pas.
export function commandeDesStations(geste: { refuse: unknown } | { accept: unknown }): { commande: string } | { refus: string } {
  const [verbe, station] = "refuse" in geste ? (["refuse", geste.refuse] as const) : (["accept", geste.accept] as const);
  return typeof station === "string" && NOM_DE_STATION.test(station) ? { commande: `contributor-stations ${verbe} ${station}` } : { refus: "nothing was sent: this is not a station name" };
}

// Refuse une station, ou la réaccepte, par le runtime du projet : `ok`, ou la ligne du refus.
export async function ecrireLesStations(projet: string, lu: Lu | undefined, geste: { refuse: unknown } | { accept: unknown }, lancer: (lu: Lu, commande: string) => Promise<Rendu>): Promise<EcritureDUneStation> {
  const ecrite = commandeDesStations(geste);
  if ("refus" in ecrite) return ecrite;
  if (lu === undefined) return { refus: `nothing was sent: “${projet}” has no station — there is no runtime to keep the list` };
  const rendu = await lancer(lu, ecrite.commande);
  if (sansLaCommande(rendu)) return { refus: "nothing was changed: this station's runtime cannot keep the list yet — update it", detail: detailDe(rendu) };
  const reponse = reponseDe(rendu);
  if (estObjet(reponse) && reponse.ok === true) return { ok: true };
  if (estObjet(reponse) && reponse.ok === false && typeof reponse.message === "string" && reponse.message !== "") {
    return { refus: (reponse.message.split("\n")[0] ?? "").replaceAll("`", ""), detail: detailDe(rendu) };
  }
  return { refus: "nothing was changed: the runtime's answer could not be read", detail: detailDe(rendu) };
}
