// Le rail de « parade » sur GitHub seul, tenu depuis 26 h sans rien servir (#3823) : les rejeux de #3812 et de #3813. La vue
// reçoit ce que l'app en tire (app/src/vue/rail/github.ts, `avecLeRail`), rien écrit à la main.
import { withTheRail, type RailOnGithub } from "../../../app/src/vue/rail/github.ts";
import { configuration, cuisine, demarrage, type Ecran, MAINTENANT } from "./commun.ts";
import { PROJETS, RENDUS } from "./cuisine-figee.ts";
import { renduDeParade, signe } from "./github-seul-commun.ts";
import { VIDE } from "./pause-quota-commun.ts";

// Il y a 26 h : le 2026-11-17, main rouge a tenu la cuisine 26 h (#3812), et #824 de mirrorlab a été relancé 1 198 fois en 26 h (#3813).
export const IL_Y_A_26_H = new Date(Date.parse(MAINTENANT) - 26 * 3_600_000).toISOString();

export const ecranDuRail = (dit: string, rail: RailOnGithub): Ecran => ({
  dit,
  largeur: 1440,
  hauteur: 640,
  etapes: [{ cliquer: '#projets > button[title^="parade — "]' }],
  donnees: () => ({
    maintenant: MAINTENANT,
    reponses: { demarrage: demarrage(configuration(PROJETS)), espace: [] },
    envois: cuisine({ ...RENDUS, parade: renduDeParade(withTheRail(VIDE, rail, { lus: [signe("box", new Date(Date.parse(MAINTENANT) - 30_000).toISOString())] })) }),
  }),
});
