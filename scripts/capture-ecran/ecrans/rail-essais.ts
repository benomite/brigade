// La colonne « Taken » de « parade » (#1895) : #14 est prise depuis près d'une heure, sur trois essais — les deux premiers
// arrêtés (le garde-fou des tours, puis l'inactivité), le troisième cuit — : son âge compte depuis la première prise, en
// rouge, et trois points disent les essais, la raison de chaque arrêt au survol. #16, à son premier essai, n'en montre
// aucun. Ce que la box rend, mot pour mot : `depuis` et `essais` des faits.
import type { Faits } from "../../../app/src/faits.ts";
import { configuration, cuisine, demarrage, type Ecran, MAINTENANT, type Rendu } from "./commun.ts";
import { PROJETS, RENDUS } from "./cuisine-figee.ts";
import { FACTS as CADENCE } from "./rail-cadence.ts";

const PARADE = RENDUS.parade as Rendu;
const ISSUE = (ticket: number) => `https://github.com/chef/parade/issues/${ticket}`;
const minutes = (n: number) => new Date(Date.parse(MAINTENANT) - n * 60_000).toISOString();
const PRIS = (ticket: number, titre: string, depuis: string, essais: unknown[]) => ({
  ticket,
  etat: "pris",
  titre,
  url: ISSUE(ticket),
  depuis,
  essais,
  activite: { fait: "écrit", faitEn: "writing", cible: "app/src/bon.ts", depuis: minutes(2) },
  attente: null,
});

const [, ...SUITE] = PARADE.facts.rail;
const FACTS = {
  ...PARADE.facts,
  cadence: CADENCE.cadence,
  compteurs: { ...PARADE.facts.compteurs, auTravail: 2 },
  rail: [
    PRIS(14, "Le journal en ajout seul", minutes(50), [
      { depuis: minutes(50), jusqua: minutes(33), arret: "turns", enCours: false },
      { depuis: minutes(33), jusqua: minutes(17), arret: "idle", enCours: false },
      { depuis: minutes(17), jusqua: null, arret: null, enCours: true },
    ]),
    PRIS(16, "Le menu du soir", minutes(6), [{ depuis: minutes(6), jusqua: null, arret: null, enCours: true }]),
    ...SUITE,
  ],
} as Faits;

export const ecran: Ecran = {
  dit: "La colonne Taken de « parade » : #14, prise depuis 50 min sur trois essais, montre `50 min` en rouge et trois points (deux finis, le dernier plein) ; #16, à son premier essai, n'a que son âge",
  largeur: 1440,
  hauteur: 900,
  etapes: [{ cliquer: '#projets > button[title^="parade — "]' }],
  donnees: () => ({
    maintenant: MAINTENANT,
    reponses: { demarrage: demarrage(configuration(PROJETS)), espace: [] },
    envois: cuisine({ ...RENDUS, parade: { ...PARADE, facts: FACTS } }),
  }),
};
