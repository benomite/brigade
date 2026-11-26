// Le rail de « parade » quand une carte `taken` n'a aucun cook qui la cuise (#3884) : #14 est prise et son cook cuit — rien de
// plus sur sa carte —, #15 est prise et aucun cook ne la tient, sans attente chronométrée : sa carte dit « Taken, no cook running ».
import type { Faits } from "../../../app/src/faits.ts";
import { configuration, cuisine, demarrage, type Ecran, MAINTENANT, type Rendu } from "./commun.ts";
import { PROJETS, RENDUS } from "./cuisine-figee.ts";

const PARADE = RENDUS.parade as Rendu;
const PRISE = PARADE.facts.rail.find((ligne) => ligne.ticket === 14) as Faits["rail"][number];

const FACTS = {
  ...PARADE.facts,
  rail: [...PARADE.facts.rail, { ...PRISE, ticket: 15, titre: "La clé de cache du build", url: PRISE.url.replace(/14$/, "15") }],
} as Faits;

const donnees: Ecran["donnees"] = () => ({
  maintenant: MAINTENANT,
  reponses: { demarrage: demarrage(configuration(PROJETS)), espace: [] },
  envois: cuisine({ ...RENDUS, parade: { ...PARADE, facts: FACTS } }),
});

export const ecran: Ecran = {
  dit: "Le rail de « parade » : #14, prise et cuite par un cook, n'a rien de plus ; #15, prise sans aucun cook ni attente, dit « Taken, no cook running » (#3884)",
  largeur: 1440,
  hauteur: 900,
  etapes: [{ cliquer: '#projets > button[title^="parade — "]' }],
  donnees,
};
