// La page de « parade », confiée à sa box, que la station refuse de servir (#1178) : à la place d'un projet qui
// ne bouge pas, une phrase dit pourquoi et ce que le chef fait. Le refus est celui que la box publie (#1177), avec
// le remède qui le lève (#1203) : son bouton porte sa phrase, avant tout clic (#1205).
import type { ProjetVu } from "../../../app/src/projets/projets.ts";
import type { Ecran } from "./commun.ts";
import { donnees, OUVRIR, SUR_LA_BOX } from "./cuisine-demenagee.ts";

// Refusé par la box : `refus`, tel que la box le publie (runtime/src/projets/refus.ts, remedes/catalogue/port.ts).
export const refuse = (refus: NonNullable<ProjetVu["refus"]>): ProjetVu => ({
  ...SUR_LA_BOX,
  stations: SUR_LA_BOX.stations.map((station) => (station.principale ? { ...station, etat: "refuse" as const, dit: "refused" } : station)),
  refus,
});
export const PORT = {
  code: "proxy-port-set",
  message: "This project's settings choose a network port that the station reserves for itself.",
  action: "Remove the port setting from the app.",
  remedy: { id: "remove-port-setting", description: "Removes the network port setting from this project's line in the station's configuration.", destructive: true },
};
// Le refus se dit sur Rail par la ligne d'alerte (#1185) : son lien ouvre Cooks, où il est en entier.
export const COOKS = { cliquer: ".alerte-de-cuisine button.lien" };
// Le bouton du remède, puis le « yes » de sa confirmation.
export const REMEDE = { cliquer: "#stations-du-projet .depot-retenu button.recommande" };
export const OUI = { cliquer: "#stations-du-projet .depot-retenu .confirmation button.recommande" };

export const ecran: Ecran = {
  dit: "L'espace de « parade » que la station refuse de servir : pourquoi, en une phrase, ce que le chef peut faire, et le bouton du remède (#1178, #1205)",
  largeur: 1440,
  hauteur: 900,
  etapes: [OUVRIR, COOKS],
  donnees: () => donnees(refuse(PORT)),
};
