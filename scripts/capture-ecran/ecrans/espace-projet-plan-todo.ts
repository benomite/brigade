// Le plan de « parade » (espace-projet-plan.ts) sans équipe lue (#4354) : en haut, la carte du supervisor et celle du closer
// sur une ligne, d'après les rôles de la cuisine ; « 2 wait for you » cliqué, les entrées du TODO dépliées dessous.
import { configuration, cuisine, demarrage, type Ecran, MAINTENANT, type Rendu } from "./commun.ts";
import { PROJETS, RENDUS } from "./cuisine-figee.ts";
import { FACTS } from "./espace-projet-plan.ts";

export const ecran: Ecran = {
  dit: "L'espace de « parade » sans équipe lue : les cartes du supervisor et du closer sur une ligne, et « 2 wait for you » déplié — chaque entrée, sa question et ses boutons (#4354)",
  largeur: 1900,
  hauteur: 1000,
  etapes: [{ cliquer: '#projets > button[title^="parade — "]' }, { cliquer: "#rail .ligne-du-todo" }],
  donnees: () => ({
    maintenant: MAINTENANT,
    reponses: { demarrage: demarrage(configuration(PROJETS)) },
    envois: cuisine({ ...RENDUS, parade: { ...(RENDUS.parade as Rendu), facts: FACTS } }),
  }),
};
