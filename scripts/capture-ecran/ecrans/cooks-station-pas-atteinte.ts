// Le même onglet (#1757), la box ne parvenant pas à atteindre ce Mac : sa pastille reste grise, et pourquoi
// se lit sur sa ligne avec le geste (#1758), et au survol (#1756).
import type { Ecran } from "./commun.ts";
import { donnees, OUVRIR, SUR_LA_BOX } from "./cuisine-demenagee.ts";

const [box, mac] = SUR_LA_BOX.stations;

export const ecran: Ecran = {
  dit: "L'onglet Cooks de « parade », cuisant sur la box, ce Mac ajouté à sa cuisine mais pas atteint : sa pastille grise, pourquoi au survol (#1757)",
  largeur: 1440,
  hauteur: 900,
  etapes: [OUVRIR, { cliquer: "#onglets-du-projet button:nth-child(2)" }],
  donnees: () => donnees({ ...SUR_LA_BOX, stations: [box!, { ...mac!, atteinte: { oui: false, dit: "not reached: no sign of life on GitHub since 2026-10-16T09:41:00.000Z", pourquoi: "not reached", geste: "open Brigade on that computer" } }] }),
};
