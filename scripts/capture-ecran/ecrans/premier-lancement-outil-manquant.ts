// Le premier lancement sur un Mac neuf, sans `gh` (#4059) : l'écran de l'outil manquant à la place du compte — le GitHub
// CLI nommé, pourquoi, « install gh » (#4350), le lien de sa page d'installation et « I installed it ». La page est celle que
// le runtime choisit pour un Mac qui a Git mais pas Homebrew.
import { outilsManquants } from "../../../runtime/src/outils-requis/machine.ts";
import { premierLancement, SANS_GH } from "./premier-lancement-commun.ts";

export const ecran = premierLancement("Le premier lancement sur un Mac neuf, sans gh (#4059) : l'écran de l'outil manquant à la place du compte", SANS_GH, [], {
  // `installable` : ce que le process principal y ajoute (#4350) — l'écran offre « install gh ».
  outilsManquants: outilsManquants({ plateforme: "darwin", presents: ["outils-developpeur", "git"] }, ["git", "gh"]).map((manque) => ({ ...manque, installable: true })),
});
