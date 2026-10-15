// Le bouton d'une panne, joué : la vue nomme la station et la panne, le process principal fait le
// geste que la panne porte (pannes.ts) — relire GitHub, écarter la ligne, lancer le login. Le
// rendu se dit en une ligne, sous celle de la panne, sans commande : il n'y a rien à taper.
//
// Le login ne se lance que pour la station de cet ordinateur — celle que l'app tient
// (poste/station.ts) : c'est le `claude` d'ici qui se reconnecte. L'app ne joint aucune autre
// machine (stations/github.ts) : le login d'une station serveur ne part pas d'ici, et le refus le dit.
import type { Stations } from "../stations/stations.ts";

export type RenduDePanne = { fait: string } | { refus: string };

export type OptionsGestes = {
  stations: Pick<Stations, "vu" | "relire" | "ecarter">;
  // Le gist de la station de cet ordinateur, quand l'app en tient une ; null sinon.
  stationLocale: () => string | null;
  // Lance le login de la station de cet ordinateur (login.ts).
  login: () => Promise<RenduDePanne>;
};

const message = (erreur: unknown) => (erreur instanceof Error ? erreur.message : String(erreur));

export async function jouerPanne(options: OptionsGestes, id: unknown, cle: unknown): Promise<RenduDePanne> {
  const station = options.stations.vu()?.stations.find((candidate) => candidate.id === id);
  const panne = station?.pannes.find((candidate) => candidate.cle === cle);
  if (station === undefined || panne === undefined) return { refus: "this breakdown is no longer shown: the station was read again in the meantime" };
  switch (panne.bouton.geste) {
    case "relire": {
      const vu = await options.stations.relire();
      if (vu.sans !== undefined) return { refus: vu.sans };
      const relue = vu.stations.find((candidate) => candidate.id === station.id);
      return relue?.pannes.some(({ sujet }) => sujet === "injoignable") === false ? { fait: `${station.nom} is back` } : { fait: `still no sign of life from ${station.nom} on GitHub` };
    }
    case "ecarter":
      options.stations.ecarter(station.id, panne.cle);
      return { fait: "dismissed" };
    case "login":
      if (options.stationLocale() !== station.id) return { refus: `${station.nom} is not this computer: its login is not launched from this app yet — it is done on ${station.nom} itself` };
      try {
        return await options.login();
      } catch (erreur) {
        return { refus: `the login was not launched: ${message(erreur)}` };
      }
  }
}
