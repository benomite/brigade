// Le détail en grand de la carte « Validate its screen » de #61, une fois « Validate » cliqué (ticket 3386) : GitHub n'a pas
// encore répondu — le bouton cliqué dit « validating… », les autres gestes et le champ sont éteints.
import type { Ecran } from "./commun.ts";
import { donnees, OUVRIR_PARADE } from "./validation-design-commun.ts";

export const ecran: Ecran = {
  dit: "« parade » sur GitHub seul (ticket 3386) : le détail en grand de la carte « Validate its screen » de #61 juste après un clic sur « Validate » — le bouton dit « validating… », rien d'autre ne se clique",
  largeur: 1440,
  hauteur: 900,
  etapes: [OUVRIR_PARADE, { cliquer: ".carte-validation .captures-de-validation" }, { cliquer: '.detail-de-validation button[data-bouton="recommande"]' }],
  donnees: () => {
    const base = donnees();
    return { ...base, reponses: { ...base.reponses, gesteDeValidation: { __enAttente: true } } };
  },
};
