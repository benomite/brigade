// L'espace de « parade », son second qui pose une question à choix (#1520, épique #1518) : sous le terminal, un bouton
// par choix que le second a publié par son canal (runtime/src/second-propositions/), chacun avec son libellé d'une ligne.
import type { Proposition } from "../../../runtime/src/second-propositions/proposition.ts";
import type { Terminal } from "../../../app/src/terminaux.ts";
import { configuration, cuisine, demarrage, type Ecran, MAINTENANT } from "./commun.ts";
import { PROJETS, RENDUS } from "./cuisine-figee.ts";

const SECOND: Terminal = { id: 1, projet: "parade", genre: "second", titre: "second · claude", note: "fil repris : la session d'hier", arrete: false };
// Ce que le second affiche : sa question, telle qu'il l'écrit, et `claude` qui attend la réponse.
const ECRAN_DU_SECOND = [
  "\x1b[1msecond · parade\x1b[0m",
  "",
  "  #1480 is approved and its CI is green. What do we do?",
  "",
  "  A. Merge it now",
  "  B. Wait for the review of #1482 first",
  "  C. Send it back to its cook",
  "",
  "\x1b[2m> \x1b[0m",
].join("\r\n");
// Ce que le second a publié, tel que le canal le rend à l'app.
const PROPOSITION: Proposition = {
  kind: "choices",
  choices: [
    { value: "A", label: "Merge it now" },
    { value: "B", label: "Wait for the review of #1482 first" },
    { value: "C", label: "Send it back to its cook" },
  ],
  id: "4f6d2c1e-0b7a-4d1f-9a43-2c5e8b1d7f60",
  at: MAINTENANT,
};

export const ecran: Ecran = {
  dit: "L'espace de « parade », son second qui demande de choisir (#1520) : sous le terminal, un bouton par choix publié, avec son libellé",
  largeur: 1440,
  hauteur: 900,
  etapes: [{ cliquer: '#projets > button[title^="parade — "]' }],
  donnees: () => {
    const envois = cuisine(RENDUS);
    return {
      maintenant: MAINTENANT,
      reponses: { demarrage: demarrage(configuration(PROJETS)), espace: [SECOND], propositionsDuSecond: { parade: PROPOSITION } },
      envois: { ...envois, regarder: { ...envois.regarder, parade: [...(envois.regarder.parade ?? []), { sur: "surSortie", args: [SECOND.id, ECRAN_DU_SECOND] }] } },
    };
  },
};
