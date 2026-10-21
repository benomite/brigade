// Un projet monté avant l'app (#1288) : sa box le sert déjà, l'app n'a rien gardé de lui. « + station »
// cliqué et ce Mac coché — « Add a station », la phrase qui dit qui garde le manager et la passe, et
// aucun champ à redire : le dépôt, la branche et les cooks viennent de la première station.
import type { Ecran } from "./commun.ts";
import { donnees, OUVRIR, SUR_LA_BOX } from "./cuisine-demenagee.ts";

export const AJOUTER = { cliquer: "#stations-du-projet button.ajout-de-station:not([hidden])" };
export const COCHER = { cliquer: '#stations-du-projet label.machine input[type="checkbox"]' };

// parade n'est pas dans le fichier des projets de l'app côté stations : la box le sert, c'est tout.
export function avantLApp(reponses: Record<string, unknown> = {}) {
  const tout = donnees(SUR_LA_BOX, { depotsDuChef: { depots: [{ depot: "benomite/parade", base: "main" }] }, ...reponses });
  const lu = tout.reponses.demarrage as { stations: { stations: { id: string; projets: string[] }[] }; projetsDesStations: { projets: unknown[] } };
  lu.projetsDesStations.projets = [];
  for (const station of lu.stations.stations) if (station.id === "box") station.projets = ["cantine", "parade"];
  return tout;
}

export const ecran: Ecran = {
  dit: "L'espace d'un projet d'avant l'app, servi par sa box : « + station » ouvert, ce Mac coché — « Add a station », aucun champ à redire (#1288)",
  largeur: 1440,
  hauteur: 900,
  etapes: [OUVRIR, AJOUTER, COCHER],
  donnees: () => avantLApp(),
};
