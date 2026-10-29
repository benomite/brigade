// L'espace de « parade », son grant `merge` éteint de lui-même (#907), l'interrupteur cliqué : la
// confirmation d'accorder, telle que confirmation.ts la dit.
import { confirmationDe } from "../../../app/src/confirmation.ts";
import { configuration, CUISINE, cuisine, demarrage, type Ecran, MAINTENANT } from "./commun.ts";
import { PROJETS, RENDUS } from "./cuisine-figee.ts";
import { PARADE_EN_PANNE } from "./bande-alertes.ts";

const PARADE = PROJETS[0];
if (PARADE === undefined) throw new Error("pas de parade dans la cuisine figée");

export const ecran: Ecran = {
  dit: "L'espace de « parade », son grant `merge` éteint seul, l'interrupteur cliqué : la confirmation d'accorder",
  largeur: 1440,
  hauteur: 900,
  etapes: [{ cliquer: '#projets > button[title^="parade — "]' }, { cliquer: "#interrupteur-merge .bascule" }],
  donnees: () => ({
    maintenant: MAINTENANT,
    reponses: {
      demarrage: demarrage(configuration(PROJETS)),
      espace: [],
      confirmer: confirmationDe("grant-activer", PARADE, { faits: PARADE_EN_PANNE.facts, a: MAINTENANT }, "merge", CUISINE),
    },
    envois: cuisine({ ...RENDUS, parade: PARADE_EN_PANNE }),
  }),
};
