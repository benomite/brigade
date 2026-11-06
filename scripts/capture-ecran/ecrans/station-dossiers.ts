// La page d'une station en ligne qui n'est pas celle de cet ordinateur (#2644) : sa section « Folders and sandbox » se
// montre — les dossiers, le bac à sable, la porte réseau —, sans rien offrir de changer.
import type { Ecran } from "./commun.ts";
import { pageDeStation } from "./station-pannes.ts";

const base = pageDeStation("en-ligne", "la page d'une station en ligne, une autre que cet ordinateur : ses dossiers, son bac à sable et sa porte réseau, en lecture seule");

export const ecran: Ecran = {
  ...base,
  donnees: () => {
    const donnees = base.donnees();
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
