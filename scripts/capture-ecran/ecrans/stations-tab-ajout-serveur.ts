// L'onglet Stations de « parade », qu'aucune station ne sert (#3195), « Add a server » cliqué (#4347) : la phrase, la ligne
// d'installation et « copy », le mot pour un Mac, « Waiting for its first check-in » et « check again » ; les gestes de la
// ligne du haut s'effacent tant que le panneau est ouvert.
import { BOX, CONFIE, MAC, ongletDesStations } from "./stations-tab-commun.ts";

const base = ongletDesStations("L'onglet Stations de « parade », qu'aucune station ne sert : « Add a server » cliqué — la ligne d'installation à copier, l'attente du serveur (#4347)", { stations: [{ ...BOX, projets: [] }, MAC], projet: { ...CONFIE, suiviPar: undefined, stations: [], cuitSur: null } as never });

export const ecran = { ...base, etapes: [...base.etapes, { cliquer: "#rail button.ajouter-un-serveur" }] };
