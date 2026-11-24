// Le premier lancement sur un Mac neuf, sans `gh` (#4059) : l'écran de l'outil manquant à la place du compte — le GitHub
// CLI nommé, pourquoi, son pas d'installation, « install the GitHub CLI » et « I installed it ». Le chemin est celui que
// le runtime choisit pour un Mac qui a Git mais pas Homebrew.
import { outilsManquants } from "../../../runtime/src/outils-requis/machine.ts";
import { premierLancement, SANS_GH } from "./premier-lancement-commun.ts";

export const ecran = premierLancement("Le premier lancement sur un Mac neuf, sans gh (#4059) : l'écran de l'outil manquant à la place du compte", SANS_GH, [], {
  outilsManquants: outilsManquants({ plateforme: "darwin", presents: ["outils-developpeur", "git"] }, ["git", "gh"]),
});
