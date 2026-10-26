// L'onglet Cooks de « parade », qui cuit sur la box, et ce Mac ajouté à sa cuisine (#1757) : la box dit le Mac
// atteint (#1756) — sa pastille est verte, « reached » au survol.
import type { Ecran } from "./commun.ts";
import { donnees, OUVRIR, SUR_LA_BOX } from "./cuisine-demenagee.ts";

const [box, mac] = SUR_LA_BOX.stations;

export const ecran: Ecran = {
  dit: "L'onglet Cooks de « parade », cuisant sur la box, ce Mac ajouté à sa cuisine et atteint : sa pastille verte, « reached » au survol (#1757)",
  largeur: 1440,
  hauteur: 900,
  etapes: [OUVRIR, { cliquer: "#onglets-du-projet button:nth-child(2)" }],
  donnees: () => donnees({ ...SUR_LA_BOX, stations: [box!, { ...mac!, atteinte: { oui: true, dit: "reached: it is online on GitHub" } }] }),
};
