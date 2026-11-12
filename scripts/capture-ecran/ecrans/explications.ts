// Les explications des mots de la cuisine (#3308) : l'espace de « parade » ouvert par un chef dont le registre est vide
// (`explanations`, runtime/src/explications/) — sous l'onglet Rail, « Rail » et sa ligne du glossaire ; sous la bande,
// « Cooks » ; sous les titres de Pass, Awaiting you et Waiting, la leur ; sous l'onglet du second, la sienne. Chacune
// avec « got it ».
import { ecran as espace } from "./espace-projet.ts";
import type { Ecran } from "./commun.ts";

export const ecran: Ecran = {
  ...espace,
  dit: "L'espace de « parade », un chef qui n'a encore vu aucune explication (#3308) : à côté de rail, cook, pass, TODO (Awaiting you), WAITING et du second, la ligne du glossaire et « got it »",
  donnees: () => {
    const donnees = espace.donnees();
    return { ...donnees, reponses: { ...donnees.reponses, lireLesExplications: { vus: [] }, marquerUneExplication: { vus: [] } } };
  },
};
