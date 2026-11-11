// « Add a project » (#3181) : ouvert par le « + » de la barre, le choix du dépôt et rien d'autre — les dépôts du compte
// GitHub de ce poste, connecté, les derniers poussés d'abord, sous le champ qui les cherche, puis le champ où coller un
// dépôt public.
import { configuration, cuisine, demarrage, type Ecran, MAINTENANT } from "./commun.ts";
import { PROJETS, RENDUS } from "./cuisine-figee.ts";
import { COMPTE } from "./premier-lancement-commun.ts";

export const ecran: Ecran = {
  dit: "« Add a project » : les dépôts du compte, les derniers poussés d'abord, à choisir d'un clic (#3181 : ni dossier, ni branche, ni étapes)",
  largeur: 1440,
  hauteur: 900,
  etapes: [{ cliquer: "#entree-ajout" }],
  donnees: () => ({
    maintenant: MAINTENANT,
    reponses: {
      demarrage: demarrage(configuration(PROJETS)),
      compteGitHub: COMPTE,
      depotsDuChef: { depots: [{ depot: "chef/cantine", base: "main" }, { depot: "atelier-org/escale", base: "trunk" }, { depot: "chef/calculus", base: "main" }] },
    },
    envois: cuisine(RENDUS),
  }),
};
