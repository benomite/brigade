// La file de « parade » quand une zone de son code rate plus souvent qu'à son tour (#1053, épique 1033) :
// `facts` porte un profil de cook proposé pour `app/src/vue`, que le chef tranche. Ce que la box rend de
// plus que la cuisine figée : le champ `profils` (runtime/src/profils/cartes.ts), une proposition — son
// nom, le domaine, les chiffres qui la justifient et ses six tickets, ce que le profil contiendrait.
import type { ProfilLu } from "../../../app/src/profil.ts";
import type { Faits } from "../../../app/src/faits.ts";
import { configuration, cuisine, demarrage, type Ecran, MAINTENANT, type Rendu } from "./commun.ts";
import { PROJETS, RENDUS } from "./cuisine-figee.ts";

const PARADE = RENDUS.parade as Rendu;
const ISSUE = (ticket: number) => `https://github.com/chef/parade/issues/${ticket}`;

export const PROFIL: ProfilLu = {
  proposition: 377,
  nom: "app-src-vue",
  domaine: "app/src/vue",
  chiffres: {
    tickets: [4, 7, 9, 11, 14, 17].map((ticket) => ({ ticket, url: ISSUE(ticket) })),
    fenetre: 20,
    domaine: { premiers: 2, retenus: 6, part: 2 / 6 },
    projet: { premiers: 15, retenus: 20, part: 15 / 20 },
    ecart: 41.666666666666664,
    seuils: { fenetre: 20, tickets: 5, ecart: 20 },
  },
  skills: [],
  perimetre: ["app/src/vue"],
  carnet: [
    { id: "L-007", texte: "A view change is judged on a screenshot, before and after — never on the code alone.", retros: ["#9"] },
    { id: "L-012", texte: "Reuse the bricks of briques.js and the tokens of jetons.css before writing a new style.", retros: ["#14", "#17"] },
  ],
  proposee: "2026-10-13T09:41:05.000Z",
};

const FACTS: Faits = { ...PARADE.facts, profils: [PROFIL] };

export const ecran: Ecran = {
  dit: "La file de « parade » avec un profil de cook proposé pour app/src/vue : son nom, le domaine, les chiffres et ses six tickets, ses skills, son périmètre et son carnet, « yes » et « no »",
  largeur: 1440,
  hauteur: 900,
  etapes: [{ cliquer: '#projets > button[title^="parade — "]' }],
  donnees: () => ({
    maintenant: MAINTENANT,
    reponses: { demarrage: demarrage(configuration(PROJETS)), espace: [] },
    envois: cuisine({ ...RENDUS, parade: { ...PARADE, facts: FACTS } }),
  }),
};
