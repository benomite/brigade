// Settings → Closer de « parade » quand aucun closer n'y est réglé (#990) : `closing --json` ne dit que
// cela, et la partie donne le geste qui en règle un — aucun chiffre.
import { ecran as closer, lu } from "./closer.ts";
import { configuration, cuisine, demarrage, type Ecran, MAINTENANT } from "./commun.ts";
import { PROJETS, RENDUS } from "./cuisine-figee.ts";

const SANS = { configured: false, text: "the closer is not set on this project: no closing pass writes, there is nothing to observe for it" };

export const ecran: Ecran = {
  ...closer,
  dit: "Settings → Closer de « parade » sans closer réglé : le message, et les deux commandes qui en règlent un",
  donnees: () => ({
    maintenant: MAINTENANT,
    reponses: { demarrage: demarrage(configuration(PROJETS)), espace: [] },
    envois: { ...cuisine(RENDUS), onglet: { "parade/closer": [lu(SANS)] } },
  }),
};
