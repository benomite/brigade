// Le geste « Install this computer's station » de l'accueil (ticket 2640) : sur un ordinateur, installer l'app, c'est
// installer la station (poste/station.ts) — elle part avec l'app et s'appaire seule. Le geste s'assure donc qu'elle tourne,
// et dit en une ligne pourquoi elle ne tourne pas : pas une station (rôle), ou un process qui a refusé de démarrer.
import type { StationLocale } from "./station.ts";

export type RefusDInstallation = { refus: string; detail?: string };

// `relire` redemande les stations du chef, pour que
// l'accueil voie la sienne dès qu'elle s'est appairée.
export async function installerLaStation(station: StationLocale | undefined, relire: () => Promise<unknown> | void): Promise<RefusDInstallation | undefined> {
  if (station === undefined) return { refus: "this app does not run a station on this computer", detail: "it is a viewer here, or it was started by its own update" };
  const etat = station.etat();
  if (etat === "refusee") return { refus: "the station refused to start on this computer", detail: "its reason is in the terminal that started the app" };
  if (etat === "arretee") return { refus: "the station is stopped" };
  await relire();
  return undefined;
}
