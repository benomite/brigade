// Le parcours guidé du premier projet à soi (#3166) : sur un ordinateur où l'app n'a encore aucun projet, « cantine »
// est ajouté par son dossier — le clone de `chef/cantine`, où le compte peut écrire. Sa lecture arrivée, son espace
// s'ouvre sur le parcours : la station, puis la mise en place s'il le faut, puis prêt. Le second de « cantine » est à
// droite ; le titre que `claude` donne à son terminal dit s'il tourne.
import type { Projet } from "../../../app/src/config.ts";
import type { Terminal } from "../../../app/src/terminaux.ts";
import { configuration, cuisine, demarrage, type Ecran, type Etape, MAINTENANT } from "./commun.ts";
import { PROJETS, RENDUS } from "./cuisine-figee.ts";
import { AUCUNE } from "./ajout-station-commun.ts";
import { COMPTE } from "./premier-lancement-commun.ts";

const CANTINE: Projet = { ...(PROJETS.find(({ nom }) => nom === "cantine") ?? PROJETS[0]!), depot: "chef/cantine", base: "main" };
const SECOND: Terminal = { id: 1, projet: "cantine", genre: "second", titre: "second · claude", note: "", arrete: false };
// Ce que le second affiche : `claude` qui lit le dépôt, le titre de son terminal au travail (« ◐ »). Pas un vrai.
const ECRAN_DU_SECOND = ["\x1b]0;◐ Setting up cantine for Brigade\x07\x1b[1msecond · cantine\x1b[0m", "", "  Reading chef/cantine: its default branch, its test scripts, its folders…", ""].join("\r\n");

// Le bouton recommandé du parcours : « add this computer » à l'étape de la station.
export const AJOUTER_ICI: Etape = { cliquer: '#parcours-premier-projet button[data-bouton="recommande"]' };

// `pret` : ce que la lecture de la mise en place rend — prêt, ou ce qui manque.
export function parcoursPremierProjet(dit: string, pret: boolean, etapes: Etape[] = []): Ecran {
  return {
    dit,
    largeur: 1440,
    hauteur: 900,
    etapes: [{ cliquer: "#entree-ajout" }, { cliquer: "#dossier" }, { cliquer: "#ajouter" }, ...etapes],
    donnees: () => {
      const envois = cuisine({ cantine: RENDUS.cantine! });
      return {
        maintenant: MAINTENANT,
        reponses: {
          demarrage: demarrage(configuration([CANTINE])),
          compteGitHub: COMPTE,
          choisirDossier: CANTINE.dossier,
          lireClone: { depot: "chef/cantine", base: "main", raisons: {} },
          ajouter: { etat: "ajoute", nom: "cantine" },
          stationsDuCompte: AUCUNE,
          projetsServis: { depots: [] },
          servirUnProjet: { depots: ["chef/cantine"] },
          checkRepoSetup: pret ? { ready: true, missingBindings: [], missingLabels: [] } : { ready: false, missingBindings: ["Branche d'intégration", "Gates", "Zones de fichiers"], missingLabels: ["fire", "taken"] },
          espace: [SECOND],
        },
        envois: { ...envois, regarder: { ...envois.regarder, cantine: [...(envois.regarder.cantine ?? []), { sur: "surSortie", args: [SECOND.id, ECRAN_DU_SECOND] }] } },
      };
    },
  };
}
