// La page d'une station dont la connexion Max est perdue, « log in » cliqué sur un Mac sans Claude Code (#4059) : le
// login ne part pas, et l'écran de l'outil manquant le dit dans l'avis — Claude Code nommé, pourquoi, le lien de sa page d'installation.
import { outilsManquants } from "../../../runtime/src/outils-requis/machine.ts";
import type { Ecran } from "./commun.ts";
import { pageDeStation } from "./station-pannes.ts";

const page = pageDeStation("connexion-max", "", [{ cliquer: "p.panne[data-sujet=\"connexion-max\"] > button" }]);

export const ecran: Ecran = {
  ...page,
  dit: "la page d'une station dont la connexion Max est perdue, « log in » cliqué sans Claude Code : l'écran de l'outil manquant",
  donnees: () => {
    const donnees = page.donnees();
    return {
      ...donnees,
      reponses: { ...donnees.reponses, panne: { outilManquant: "claude", refus: "the login was not launched: Claude Code is not installed on this computer" }, outilsManquants: outilsManquants({ plateforme: "darwin", presents: ["git", "gh"] }, ["claude"]).map((manque) => ({ ...manque, installable: true })) },
    };
  },
};
