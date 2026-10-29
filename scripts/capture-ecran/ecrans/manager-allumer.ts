// L'espace de « parade », son manager éteint, et son interrupteur cliqué (#906) : la confirmation
// s'ouvre dessous, et dit en une phrase ce qu'il va juger — d'après `manager backlog`, que la box
// rend ici : 23 issues ouvertes, dont 2 portent `blocked-on-human`.
import { backlogDe, dire } from "../../../app/src/allumage.ts";
import { confirmationDe } from "../../../app/src/confirmation.ts";
import { configuration, CUISINE, cuisine, demarrage, type Ecran, MAINTENANT, type Rendu } from "./commun.ts";
import { MANAGER_ETEINT, PROJETS, RENDUS } from "./cuisine-figee.ts";

const PARADE = RENDUS.parade as Rendu;
const BACKLOG = "backlog               23 issues ouvertes, dont 2 portent `blocked-on-human` — le manager ne juge jamais une issue qui le porte\n";

export const ecran: Ecran = {
  dit: "L'espace de « parade », son manager éteint, l'interrupteur cliqué : la confirmation et ce qu'il va juger",
  largeur: 1440,
  hauteur: 900,
  etapes: [{ cliquer: '#projets > button[title^="parade — "]' }, { cliquer: "#interrupteur-manager .bascule" }],
  donnees: () => {
    const backlog = backlogDe(BACKLOG);
    if ("informe" in backlog) throw new Error(backlog.informe);
    const parade = PROJETS.find(({ nom }) => nom === "parade");
    if (parade === undefined) throw new Error("pas de parade");
    return {
      maintenant: MAINTENANT,
      reponses: {
        demarrage: demarrage(configuration(PROJETS)),
        espace: [],
        confirmer: confirmationDe("manager-allumer", parade, { faits: PARADE.facts, a: MAINTENANT }, undefined, CUISINE),
        compter: { projet: "parade", a: MAINTENANT, ...backlog, dit: dire(backlog) },
      },
      envois: cuisine({ ...RENDUS, parade: { ...PARADE, manager: MANAGER_ETEINT } }),
    };
  },
};
