// Le bouton d'une panne, joué : la vue nomme la station et la panne, le process principal fait le
// geste que la panne porte (outages.ts) — relire GitHub, écarter la ligne, lancer le login. Le
// rendu se dit en une ligne, sous celle de la panne, sans commande : il n'y a rien à taper.
//
// Le login ne se lance que pour la station de cet ordinateur — celle que l'app tient
// (workstation/station.ts) : c'est le `claude` d'ici qui se reconnecte. L'app ne joint aucune autre
// machine (stations/github.ts) : le login d'une station serveur ne part pas d'ici, et le refus le dit.
import type { Stations } from "../stations/stations.ts";

// `outilManquant` : l'outil que le geste demande n'est pas sur cet ordinateur — la vue montre l'écran qui renvoie à sa page d'installation
// (vue/tools-required/, #4059) ; le refus le dit en une ligne là où la vue ne le montre pas.
export type RenderedOfOutage = { fait: string } | { refus: string } | { outilManquant: "claude"; refus: string };

export type OptionsActions = {
  stations: Pick<Stations, "vu" | "relire" | "ecarter">;
  // Le gist de la station de cet ordinateur, quand l'app en tient une ; null sinon.
  stationLocale: () => string | null;
  // Lance le login de la station de cet ordinateur (login.ts).
  login: () => Promise<RenderedOfOutage>;
};

const message = (error: unknown) => (error instanceof Error ? error.message : String(error));

// Le bouton « check again » d'une station qui ne cuit pas encore (stations/reason.ts, #1758) : il ne vise pas une
// panne, il relit GitHub et dit si la station a reparlé.
export const REREAD_THE_STATION = "relire-la-station";

export async function playOutage(options: OptionsActions, id: unknown, key: unknown): Promise<RenderedOfOutage> {
  if (key === REREAD_THE_STATION) {
    const seenOne = await options.stations.relire();
    if (seenOne.sans !== undefined) return { refus: seenOne.sans };
    const rereadOne = seenOne.stations.find((candidate) => candidate.id === id);
    if (rereadOne === undefined) return { refus: "this station is no longer paired with this app" };
    return { fait: rereadOne.etat === "en-ligne" ? `${rereadOne.nom} is back` : `still no sign of life from ${rereadOne.nom} on GitHub` };
  }
  const station = options.stations.vu()?.stations.find((candidate) => candidate.id === id);
  const outage = station?.pannes.find((candidate) => candidate.cle === key);
  if (station === undefined || outage === undefined) return { refus: "this breakdown is no longer shown: the station was read again in the meantime" };
  switch (outage.bouton.geste) {
    case "relire": {
      const seenOne = await options.stations.relire();
      if (seenOne.sans !== undefined) return { refus: seenOne.sans };
      const rereadOne = seenOne.stations.find((candidate) => candidate.id === station.id);
      return rereadOne?.pannes.some(({ sujet: subject }) => subject === "injoignable") === false ? { fait: `${station.nom} is back` } : { fait: `still no sign of life from ${station.nom} on GitHub` };
    }
    case "ecarter":
      options.stations.ecarter(station.id, outage.cle);
      return { fait: "dismissed" };
    case "login":
      if (options.stationLocale() !== station.id) return { refus: `${station.nom} is not this computer: its login is not launched from this app yet — it is done on ${station.nom} itself` };
      try {
        return await options.login();
      } catch (error) {
        return { refus: `the login was not launched: ${message(error)}` };
      }
  }
}
