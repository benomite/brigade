// La fiche d'un ticket, ouverte par sa carte sur le rail : #14, que le cook de parade tient. Ce
// qu'elle demande au pont — ses gestes — est calculé par les modules de l'app.
import { actionsOfCard } from "../../../app/src/card-actions.ts";
import type { Terminal } from "../../../app/src/terminals.ts";
import { carteDe, configuration, cuisine, demarrage, type Ecran, MAINTENANT } from "./commun.ts";
import { PROJETS, RENDUS } from "./cuisine-figee.ts";

const SECOND: Terminal = { id: 1, projet: "parade", genre: "second", titre: "second · claude", note: "session neuve", arrete: false };

export const ecran: Ecran = {
  dit: "La fiche de #14, ouverte par sa carte dans la colonne Taken du rail de parade",
  largeur: 1440,
  hauteur: 900,
  // La case de parade, puis la carte de la deuxième colonne (Taken) : #14.
  etapes: [{ cliquer: '#projets > button[title^="parade — "]' }, { cliquer: "#rail .colonne:nth-child(2) li.bon" }],
  donnees: () => {
    const carte = carteDe(RENDUS.parade!, "parade", 14);
    return {
      maintenant: MAINTENANT,
      reponses: { demarrage: demarrage(configuration(PROJETS)), espace: [SECOND], gestesDeFiche: actionsOfCard(carte) },
      envois: cuisine(RENDUS),
    };
  },
};
