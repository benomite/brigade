// « parade » sur GitHub seul (#3363) : une carte qui t'attend sans forme de carte de TODO (ni question, ni carte du chef lue) —
// porte « ask the second » dans TODO, au-dessus de « waiting for… ».
import type { Ecran } from "./commun.ts";
import { avecLAttenteDuChef } from "../../../app/src/tableau/attente-du-chef.ts";
import { avecLeRail } from "../../../app/src/vue/rail/github.ts";
import { configuration, cuisine, demarrage, type Donnees, MAINTENANT } from "./commun.ts";
import { MANAGER_ALLUME, PROJETS, RENDUS } from "./cuisine-figee.ts";
import { renduDeParade, SIGNES, SUR_GITHUB, TABLEAU_FIGE } from "./github-seul-commun.ts";
import { OUVRIR_PARADE } from "./attente-github-commun.ts";
import { SECOND } from "./rail-waiting-commun.ts";

const ATTENTES = [
  { ticket: 41, titre: "Export the journal as CSV", url: "https://github.com/chef/parade/issues/41", depuis: "2026-10-13T08:30:00.000Z", quoi: "carte" as const, ligne: "Gesture for the chef: from a machine with GitHub access, run the command the card names" },
];
const LU = avecLAttenteDuChef(avecLeRail(TABLEAU_FIGE, SUR_GITHUB, SIGNES), { attentes: ATTENTES, illisibles: [], enWaiting: [] } as Parameters<typeof avecLAttenteDuChef>[1]);

export const ecran: Ecran = {
  dit: "« parade » sur GitHub seul (#3363) : une carte qui attend sans forme de carte de TODO porte « ask the second »",
  largeur: 1440,
  hauteur: 900,
  etapes: [OUVRIR_PARADE],
  donnees: (): Donnees => ({
    maintenant: MAINTENANT,
    reponses: { demarrage: demarrage(configuration(PROJETS)), espace: [SECOND] },
    envois: cuisine({ ...RENDUS, parade: { ...renduDeParade(LU), manager: MANAGER_ALLUME } }),
  }),
};
