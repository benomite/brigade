// La page de la station de cet ordinateur (#2644) : sa section « Folders and sandbox » montre les dossiers, le bac à
// sable et la porte réseau, avec de quoi changer un dossier et ouvrir un hôte.
import type { Ecran } from "./commun.ts";
import { pageDeStation } from "./station-pannes.ts";

const base = pageDeStation("en-ligne", "la page de la station de cet ordinateur : ses dossiers, son bac à sable et sa porte réseau, à changer");

export const ecran: Ecran = {
  ...base,
  donnees: () => {
    const donnees = base.donnees();
    (donnees.reponses.demarrage as { projetsDesStations: { locale: string | null } }).projetsDesStations.locale = "box";
    donnees.reponses.ecrireReglagesDeLaStation = { fait: "saved on this machine" };
    donnees.reponses.lireReglagesDeLaStation = {
      clones: "/Users/chef/.brigade/station/clones",
      worktrees: "/Users/chef/.brigade/station/worktrees",
      bac: "on",
      hotes: [
        { hote: "anthropic.com", origine: "Anthropic — the model, through the Max connection", ajoute: false },
        { hote: "github.com", origine: "GitHub — the repository, the issues, the archives", ajoute: false },
        { hote: "registry.npmjs.org", origine: "opened by you on this machine", ajoute: true },
      ],
    };
    return donnees;
  },
};
