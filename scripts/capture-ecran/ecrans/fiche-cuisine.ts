// La fiche de #22, revenu de WAITING dans la colonne TODO de « parade » : « back to the kitchen » cliqué, puis confirmé.
// Le geste part sur le tableau de la cuisine (#1740) : la fiche dit qu'il y est posté, son commentaire au survol.
import { gestesDeCarte } from "../../../app/src/gestes-fiche.ts";
import { situationDe } from "../../../app/src/histoire.ts";
import { POSTE } from "../../../app/src/tableau-gestes/rail.ts";
import { carteDe, configuration, cuisine, demarrage, type Ecran, MAINTENANT } from "./commun.ts";
import { PROJETS, RENDUS } from "./cuisine-figee.ts";
import { RENDU, SECOND } from "./rail-waiting-commun.ts";

export const ecran: Ecran = {
  dit: "La fiche de #22, revenu de WAITING dans TODO de « parade » : « back to the kitchen » cliqué et confirmé (#1740), posté sur le tableau de la cuisine",
  largeur: 1440,
  hauteur: 900,
  etapes: [
    { cliquer: '#projets > button[title^="parade — "]' },
    // La carte de #22, la seconde de TODO (la quatrième colonne).
    { cliquer: "#rail .colonne:nth-child(4) li.bon:nth-child(2)" },
    { cliquer: '#fiche li[data-geste="cuisine"] button.recommande' },
    { cliquer: "#fiche .gestes-fiche .confirmation button.recommande" },
  ],
  donnees: () => {
    const carte = carteDe(RENDU, "parade", 22);
    return {
      maintenant: MAINTENANT,
      reponses: { demarrage: demarrage(configuration(PROJETS)), espace: [SECOND], situation: situationDe(carte), gestesDeFiche: gestesDeCarte(carte), gesteDeFiche: { fait: POSTE, detail: "https://github.com/chef/parade/issues/7#issuecomment-9001" } },
      envois: cuisine({ ...RENDUS, parade: RENDU }),
    };
  },
};
