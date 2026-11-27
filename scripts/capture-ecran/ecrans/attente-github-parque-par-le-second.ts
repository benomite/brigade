// « parade » sur GitHub seul (#4262) : #40 parqué par le second, avec la commande de parking que l'app lui donne
// (app/src/second/parking.ts). Sa carte de WAITING se lit du commentaire que cette commande pose sur l'issue — celui que
// « waiting for… » de l'app pose, écrit par la même fonction (`parquer`, `marqueDAttente`) : quoi, de qui, sa relance.
import { brandOfWait, thirdOfComments } from "../../../app/src/vue/wait/wait-github.ts";
import { withTheWaitOfChef } from "../../../app/src/board/wait-of-chef.ts";
import { withTheRail } from "../../../app/src/vue/rail/github.ts";
import { configuration, cuisine, demarrage, type Donnees, type Ecran, MAINTENANT } from "./commun.ts";
import { OUVRIR_PARADE } from "./attente-github-commun.ts";
import { MANAGER_ALLUME, PROJETS, RENDUS } from "./cuisine-figee.ts";
import { renduDeParade, SIGNES, SUR_GITHUB, TABLEAU_FIGE } from "./github-seul-commun.ts";
import { SECOND } from "./rail-waiting-commun.ts";

// Ce que le second a posé sur #40 : « mets #40 en attente du support de Stripe jusqu'au 17 ».
const PAR_LE_SECOND = { body: brandOfWait({ quoi: "the payment provider's sandbox keys", qui: "Stripe support" }, new Date("2026-10-10T14:00:00.000Z"), new Date("2026-10-17T00:00:00.000Z")), created_at: "2026-10-10T14:00:05Z" };

const LU = withTheWaitOfChef(withTheRail(TABLEAU_FIGE, SUR_GITHUB, SIGNES), {
  attentes: [],
  illisibles: [],
  enWaiting: [{ ticket: 40, titre: "Le fournisseur de paiement", url: "https://github.com/chef/parade/issues/40", tiers: thirdOfComments([PAR_LE_SECOND]) }],
} as Parameters<typeof withTheWaitOfChef>[1]);

const donnees = (): Donnees => ({
  maintenant: MAINTENANT,
  reponses: { demarrage: demarrage(configuration(PROJETS)), espace: [SECOND] },
  envois: cuisine({ ...RENDUS, parade: { ...renduDeParade(LU), manager: MANAGER_ALLUME } }),
});

export const ecran: Ecran = {
  dit: "« parade » sur GitHub seul (#4262) : #40 parqué par le second — sa carte de WAITING dit quoi, de qui, sa relance, lus du commentaire que sa commande de parking a posé, le même que « waiting for… » de l'app",
  largeur: 2200,
  hauteur: 760,
  etapes: [OUVRIR_PARADE],
  donnees,
};
