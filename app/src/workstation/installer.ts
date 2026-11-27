// Le geste « Install this computer's station » de l'accueil (ticket 2640) : sur un ordinateur, installer l'app, c'est
// installer la station — elle tourne en fond, lancée par l'app ou à l'ouverture de session, et s'appaire seule
// (station-fond/). Le geste s'assure donc qu'elle tourne,
// et dit en une ligne pourquoi elle ne tourne pas : pas une station (rôle), ou un process qui a refusé de démarrer.
import type { StationLocale } from "./station.ts";

export type RefusalOfInstallation = { refus: string; detail?: string };

// `relire` redemande les stations du chef, pour que
// l'accueil voie la sienne dès qu'elle s'est appairée.
export async function installerTheStation(station: Pick<StationLocale, "etat"> | undefined, reread: () => Promise<unknown> | void): Promise<RefusalOfInstallation | undefined> {
  if (station === undefined) return { refus: "this app does not run a station on this computer", detail: "it is a viewer here, or it was started by its own update" };
  const state = station.etat();
  if (state === "refusee") return { refus: "the station refused to start on this computer", detail: "its reason is in the station's log, fond.log in its directory" };
  if (state === "arretee") return { refus: "the station is stopped" };
  await reread();
  return undefined;
}
