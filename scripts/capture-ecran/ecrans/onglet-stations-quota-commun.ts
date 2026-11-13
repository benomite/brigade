// La jauge du quota GitHub (#3483) sur l'onglet Stations de « parade » : les faits de l'écran « onglet-stations » portent
// `quotaGithub`, que le runtime donne dans `facts` ; seul le quota change d'un écran à l'autre.
import { ongletStations } from "./onglet-stations-commun.ts";

export const APPELS = [
  { station: "parade-box", projet: "parade", typeAppel: "reads on pull requests", nombre: 31 },
  { station: "Mac station", projet: "secondes", typeAppel: "writes on issues", nombre: 39 },
  { station: "Mac station", projet: "parade", typeAppel: "writes on comments", nombre: 12 },
];

export const quotaOnglet = (dit: string, utilise: number, appels: typeof APPELS, ouvrir: boolean) =>
  ongletStations(dit, ouvrir ? [{ cliquer: ".quota-github summary" }] : [], { limite: "ecriture", pauseJusqua: null, utilise, maximum: 500, renouvellement: "2026-10-13T11:00:00.000Z", parStationEtProjet: appels });
