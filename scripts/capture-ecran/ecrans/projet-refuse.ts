// La page de « parade », confiée à sa box, que la station refuse de servir (#1178) : à la place d'un projet qui
// ne bouge pas, une phrase dit pourquoi et ce que le chef fait. Le refus est celui que la box publie (#1177).
import type { Ecran } from "./commun.ts";
import { donnees, OUVRIR, SUR_LA_BOX } from "./cuisine-demenagee.ts";

export const ecran: Ecran = {
  dit: "L'espace de « parade » que la station refuse de servir : pourquoi, en une phrase, et ce que le chef peut faire (#1178)",
  largeur: 1440,
  hauteur: 900,
  etapes: [OUVRIR],
  donnees: () =>
    donnees({
      ...SUR_LA_BOX,
      stations: SUR_LA_BOX.stations.map((station) => (station.principale ? { ...station, etat: "refuse" as const, dit: "refused" } : station)),
      refus: {
        code: "proxy-port-set",
        message: "This project's settings choose a network port that the station reserves for itself.",
        action: "Remove the port setting from the project's line in the station's configuration.",
      },
    }),
};
