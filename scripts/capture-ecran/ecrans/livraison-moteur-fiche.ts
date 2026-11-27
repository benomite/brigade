// La fiche de #7, livrée sur une clé d'API Claude : sa ligne « cooked with » dit le moteur et son prix (#3747).
import { actionsOfCard } from "../../../app/src/card-actions.ts";
import { situationOf } from "../../../app/src/story.ts";
import { discussionOf, storyOf } from "../../../app/test/helpers/cards-said.ts";
import { carteDe, configuration, cuisine, demarrage, type Ecran, MAINTENANT } from "./commun.ts";
import { PROJETS } from "./cuisine-figee.ts";
import { AVEC_MOTEUR } from "./livraison-moteur-commun.ts";

export const ecran: Ecran = {
  dit: "La fiche de #7, livré sur une clé d'API Claude : le moteur et son prix, sous « what the queue says »",
  largeur: 1440,
  hauteur: 900,
  etapes: [{ cliquer: '#projets > button[title^="parade — "]' }, { cliquer: '#rail .colonne li.bon[data-ticket="7"]' }],
  donnees: () => {
    const carte = carteDe(AVEC_MOTEUR.parade!, "parade", 7);
    return {
      maintenant: MAINTENANT,
      reponses: {
        demarrage: demarrage(configuration(PROJETS)),
        espace: [],
        situation: situationOf(carte),
        gestesDeFiche: actionsOfCard(carte),
        lireHistoire: storyOf({ steps: [], cost: { attempts: 1, tokens: 412806, durationMs: 722000, incomplete: false } }),
        lireDiscussion: discussionOf({ issue: { title: "Les accès sous plafond", state: "closed", body: { author: "chef", at: "2026-10-12T17:20:00.000Z", body: "Un relevé par station." }, comments: [] } }),
      },
      envois: cuisine(AVEC_MOTEUR),
    };
  },
};
