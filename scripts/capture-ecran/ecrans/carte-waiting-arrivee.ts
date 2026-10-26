// La carte de #23 dans la colonne WAITING de « parade » : « it arrived, back to the kitchen » cliqué (#1740). Le geste
// part sur le tableau de la cuisine : la carte dit qu'il y est posté, son commentaire au survol, et reste dans WAITING
// jusqu'à ce que la box l'ait joué.
import { POSTE } from "../../../app/src/tableau-gestes/rail.ts";
import { configuration, cuisine, demarrage, type Ecran, MAINTENANT } from "./commun.ts";
import { PROJETS, RENDUS } from "./cuisine-figee.ts";
import { RENDU, SECOND } from "./rail-waiting-commun.ts";

// L'écran, avec ce que le pont rend pour le geste : posté, ou pourquoi rien ne l'est.
export const carteWaitingArrivee = (dit: string, rendu: unknown): Ecran => ({
  dit,
  largeur: 1920,
  hauteur: 900,
  etapes: [{ cliquer: '#projets > button[title^="parade — "]' }, { cliquer: '#rail button[data-attente="attente-arrivee"]' }],
  donnees: () => ({
    maintenant: MAINTENANT,
    reponses: { demarrage: demarrage(configuration(PROJETS)), espace: [SECOND], attente: rendu },
    envois: cuisine({ ...RENDUS, parade: RENDU }),
  }),
});

export const ecran: Ecran = carteWaitingArrivee("La carte de #23 dans WAITING de « parade » : « it arrived, back to the kitchen » cliqué (#1740), posté sur le tableau de la cuisine", {
  fait: POSTE,
  detail: "https://github.com/chef/parade/issues/7#issuecomment-9001",
});
