// « Tous les projets » tel que Home.dc.html le dessine (#2912) : une ligne par projet — son état, ce qui s'y passe, et la
// pastille « N awaiting you » quand le chef est attendu —, « Add a project » à droite du titre, et la carte de la station de
// cet ordinateur, installée, sa version en retard d'une.
import type { Accueil } from "../../../app/src/accueil.ts";
import { configuration, cuisine, demarrage, type Ecran, MAINTENANT } from "./commun.ts";
import { PROJETS, RENDUS } from "./cuisine-figee.ts";
import { stationsDuChef } from "./stations-une-liste.ts";

const LU = "read at 10:04:12 AM — open it to act";

export const ecran: Ecran = {
  ...stationsDuChef("x"),
  dit: "« Tous les projets » comme Home.dc.html le dessine : parade attend le chef (1 awaiting you), cantine au repos, la carte de la station de ce Mac, sa version en retard",
  largeur: 1280,
  hauteur: 860,
  donnees: () => {
    const base = stationsDuChef("x").donnees();
    const lu = base.reponses.demarrage as { stations: { stations: Array<{ id: string; nom: string }> } };
    const mac = lu.stations.stations.find(({ nom }) => nom === "macbook-air-de-benoit");
    const accueil: Accueil = {
      projets: [
        { nom: "parade", ton: "jaune", dit: "1 decision awaits you, for 2 d · #14 cooking", survol: LU, attend: 1 },
        { nom: "cantine", ton: "vert", dit: "nothing cooking, nothing waits for you", survol: LU },
      ],
      stations: [],
      sante: { ton: "vert", dit: "", survol: "" },
    };
    return {
      maintenant: MAINTENANT,
      reponses: {
        ...base.reponses,
        demarrage: { ...demarrage(configuration(PROJETS)), stations: lu.stations, projetsDesStations: { ...(demarrage(configuration(PROJETS)).projetsDesStations as object), locale: mac?.id ?? null }, accueil },
        statutDeLaStation: { stationVersion: "1.0.152", latestStationVersion: "1.0.153", behind: true },
      },
      envois: cuisine(RENDUS),
    };
  },
};
