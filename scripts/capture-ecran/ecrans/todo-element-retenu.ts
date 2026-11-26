// L'espace de « parade » sur GitHub seul (#4425, épique #4358) : son TODO porte la carte de #77, l'issue retenue d'un auteur
// sans l'écriture — sa question, son auteur, « Accept it » et « Close it ». La carte est celle que la cuisine pose sur l'issue
// retenue ; « Accept it » y poste le geste `accept`, que la cuisine lit et accepte par son module de confiance.
import { configuration, cuisine, demarrage, type Ecran, MAINTENANT, type Rendu } from "./commun.ts";
import { MANAGER_ALLUME, PROJETS, RENDUS } from "./cuisine-figee.ts";
import { SECOND } from "./rail-waiting-commun.ts";

const PARADE = RENDUS.parade as Rendu;

const STATUS = ["project    parade", "kitchen    open", "", "awaiting   nothing awaits the chef", "end awaiting", ...PARADE.status.split("\n").slice(5)].join("\n");
const RETENUE = [
  "Held issue #77: accept it, so the kitchen reads it?",
  "",
  "- [accept] Accept it",
  "- [close] Close it",
  "",
  "Asks: Please add dark mode.",
  "Opened by @mallory, who has no write access to the repository.",
].join("\n");
const ATTEND = [{ ticket: 77, titre: "Please add dark mode", url: "https://github.com/chef/parade/issues/77", chef: { sorte: "product-question", texte: RETENUE } }];

export const ecran: Ecran = {
  dit: "« parade » sur GitHub seul (#4425) : la carte de #77, l'issue retenue de @mallory, sans l'écriture, dans TODO — sa question, son auteur, « Accept it » et « Close it »",
  largeur: 1440,
  hauteur: 900,
  etapes: [{ cliquer: '#projets > button[title^="parade — "]' }],
  donnees: () => ({
    maintenant: MAINTENANT,
    reponses: { demarrage: demarrage(configuration(PROJETS)), espace: [SECOND] },
    envois: cuisine({ ...RENDUS, parade: { ...PARADE, facts: { ...PARADE.facts, attend: ATTEND }, status: STATUS, manager: MANAGER_ALLUME } }),
  }),
};
