// Le rail de « parade » sur deux stations (#2039) : chaque carte de Taken et de Pass porte l'étiquette de sa station
// (`box`, le nom entier `box/claude` au survol) ; une carte dont le ticket demande des capacités porte une étiquette
// tiretée par capacité (`browser`, `docker`), dans n'importe quelle colonne. Ce que la box rend : `station` et `requires`
// des faits.
import type { Faits } from "../../../app/src/faits.ts";
import { configuration, cuisine, demarrage, type Ecran, MAINTENANT, type Rendu } from "./commun.ts";
import { PROJETS, RENDUS } from "./cuisine-figee.ts";

const PARADE = RENDUS.parade as Rendu;
const STATIONS: Record<number, string> = { 14: "box/claude", 30: "macbook-air-de-benoit/claude", 12: "box/claude" };
const REQUIERT: Record<number, string[]> = { 14: ["browser", "docker"], 12: ["docker"] };

const FACTS = {
  ...PARADE.facts,
  rail: PARADE.facts.rail.map((ligne) => ({
    ...ligne,
    ...(STATIONS[ligne.ticket] === undefined ? {} : { station: STATIONS[ligne.ticket] }),
    ...(REQUIERT[ligne.ticket] === undefined ? {} : { requires: REQUIERT[ligne.ticket] }),
  })),
} as Faits;

const donnees: Ecran["donnees"] = () => ({
  maintenant: MAINTENANT,
  reponses: { demarrage: demarrage(configuration(PROJETS)), espace: [] },
  envois: cuisine({ ...RENDUS, parade: { ...PARADE, facts: FACTS } }),
});

export const ecran: Ecran = {
  dit: "Le rail de « parade » sur deux stations : Taken et Pass montrent l'étiquette de leur station (`box`, `macbook-air-de-benoit`), #14 et #12 des étiquettes tiretées de capacité (`browser`, `docker`)",
  largeur: 1440,
  hauteur: 900,
  etapes: [{ cliquer: '#projets > button[title^="parade — "]' }],
  donnees,
};
