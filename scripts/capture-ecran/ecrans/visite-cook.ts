// La visite d'une vraie cuisine (#4087), sa deuxième étape : la carte du ticket qu'un cook cuisine en ce moment, entourée
// de l'accent, et ce que la bulle en dit.
import { visite } from "./visite-commun.ts";

export const ecran = visite("La visite d'une vraie cuisine (#4087) : sa deuxième étape, la carte qu'un cook cuisine en ce moment", [{ cliquer: '#visite button[data-bouton="recommande"]' }]);
