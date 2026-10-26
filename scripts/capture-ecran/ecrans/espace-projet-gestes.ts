// L'espace de « parade », la vue du rail seule (#1695), et la fiche de #12 ouverte : sa livraison verte attend un merge
// faute de grant, la décision est connue — la fiche offre ses gestes, « merge the PR » et « remove from the rail ».
import { gestesDeCarte } from "../../../app/src/gestes-fiche.ts";
import { situationDe } from "../../../app/src/histoire.ts";
import type { Faits } from "../../../app/src/faits.ts";
import type { Terminal } from "../../../app/src/terminaux.ts";
import { carteDe, configuration, cuisine, demarrage, type Ecran, MAINTENANT, type Rendu } from "./commun.ts";
import { PROJETS, RENDUS } from "./cuisine-figee.ts";

const SECOND: Terminal = { id: 1, projet: "parade", genre: "second", titre: "second · claude", note: "fil repris : la session d'hier", arrete: false };
const PARADE = RENDUS.parade as Rendu;

const FAITS = {
  ...PARADE.facts,
  attend: PARADE.facts.attend.map((ligne) => (ligne.ticket === 12 ? { ...ligne, decision: { quoi: "merge", motif: "no-grant", cause: null, pr: "https://github.com/chef/parade/pull/31" } } : ligne)),
} as Faits;
const RENDU: Rendu = { ...PARADE, facts: FAITS };

export const ecran: Ecran = {
  dit: "L'espace de « parade », la vue du rail seule (#1695) : la fiche de #12, dont la décision est connue, offre ses gestes",
  largeur: 1440,
  hauteur: 900,
  // La case de parade, puis la carte de #12 (colonne TODO).
  etapes: [{ cliquer: '#projets > button[title^="parade — "]' }, { cliquer: "#rail .colonne:nth-child(4) li.bon" }],
  donnees: () => {
    const carte = carteDe(RENDU, "parade", 12);
    return {
      maintenant: MAINTENANT,
      reponses: { demarrage: demarrage(configuration(PROJETS)), espace: [SECOND], situation: situationDe(carte), gestesDeFiche: gestesDeCarte(carte) },
      envois: cuisine({ ...RENDUS, parade: RENDU }),
    };
  },
};
