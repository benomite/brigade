// La file de « parade » quand deux tickets en file attendent d'autres tickets (ticket 3510, épique 3502) : #21 attend #14,
// #23 attend #12 et #15, #22 n'attend personne — sa carte reste comme avant. Même file que `rail-file`, avec le champ
// `attend` (les numéros des tickets attendus) sur les entrées de `rail` que le runtime ordonnance.
import type { Faits } from "../../../app/src/faits.ts";
import { configuration, cuisine, demarrage, type Ecran, MAINTENANT, type Rendu } from "./commun.ts";
import { PROJETS, RENDUS } from "./cuisine-figee.ts";
import { FACTS, STATUS } from "./rail-file-commun.ts";

const PARADE = RENDUS.parade as Rendu;
const ATTEND: Record<number, number[]> = { 21: [14], 23: [12, 15] };

export const ecran: Ecran = {
  dit: "La file de « parade » : #21 dit « after #14 » et #23 « after #12, #15 » ; #22, qui n'attend personne, n'a rien de plus",
  largeur: 1900,
  hauteur: 700,
  etapes: [{ cliquer: '#projets > button[title^="parade — "]' }],
  donnees: () => ({
    maintenant: MAINTENANT,
    reponses: { demarrage: demarrage(configuration(PROJETS)), espace: [] },
    envois: cuisine({
      ...RENDUS,
      parade: { ...PARADE, facts: { ...FACTS, rail: FACTS.rail.map((entree) => (ATTEND[entree.ticket] === undefined ? entree : { ...entree, attend: ATTEND[entree.ticket] })) } as Faits, status: STATUS },
    }),
  }),
};
