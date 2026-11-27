// L'espace de « parade », la vue du rail seule (#1695), et la fiche de #12 ouverte : sa livraison verte attend un merge
// à la main, la décision est connue — la fiche offre ses gestes, « merge the PR » et « remove from the rail ».
import { actionsOfCard } from "../../../app/src/card-actions.ts";
import { situationOf } from "../../../app/src/story.ts";
import type { Facts } from "../../../app/src/facts.ts";
import type { Terminal } from "../../../app/src/terminals.ts";
import { carteDe, configuration, cuisine, demarrage, type Ecran, MAINTENANT, type Rendu } from "./commun.ts";
import { PROJETS, RENDUS } from "./cuisine-figee.ts";

const SECOND: Terminal = { id: 1, projet: "parade", genre: "second", titre: "second · claude", note: "fil repris : la session d'hier", arrete: false };
const PARADE = RENDUS.parade as Rendu;

const FAITS = {
  ...PARADE.facts,
  attend: PARADE.facts.attend.map((ligne) => (ligne.ticket === 12 ? { ...ligne, decision: { quoi: "merge", motif: "review-required", cause: null, pr: "https://github.com/chef/parade/pull/31" } } : ligne)),
} as Facts;
const RENDU: Rendu = { ...PARADE, facts: FAITS };

export const ecran: Ecran = {
  dit: "L'espace de « parade », la vue du rail seule (#1695) : la fiche de #12, dont la décision est connue, offre ses gestes",
  largeur: 1440,
  hauteur: 900,
  // La case de parade, puis la carte de #12 (colonne TODO).
  etapes: [{ cliquer: '#projets > button[title^="parade — "]' }, { cliquer: '#rail .colonne li.bon[data-ticket="12"]' }],
  donnees: () => {
    const carte = carteDe(RENDU, "parade", 12);
    return {
      maintenant: MAINTENANT,
      reponses: { demarrage: demarrage(configuration(PROJETS)), espace: [SECOND], situation: situationOf(carte), gestesDeFiche: actionsOfCard(carte) },
      envois: cuisine({ ...RENDUS, parade: RENDU }),
    };
  },
};
