// Le rail de « parade », l'étiquette d'un besoin découpé cliquée (#3460) : son détail sous la ligne — son contexte, ses
// tickets comptés par étape, le lien de son issue —, ses tickets qui ressortent dans le rail, les autres cartes effacées.
// Les données sont celles de `rail-backlog`.
import type { Ecran } from "./commun.ts";
import { donnees } from "./rail-backlog.ts";

export const ecran: Ecran = {
  dit: "Le rail de « parade », l'étiquette de #47 cliquée : son détail sous le bandeau, ses tickets en avant dans le rail",
  largeur: 1440,
  hauteur: 900,
  etapes: [{ cliquer: '#projets > button[title^="parade — "]' }, { cliquer: '#rail .backlog-tag[data-ticket="47"]' }],
  donnees,
};
