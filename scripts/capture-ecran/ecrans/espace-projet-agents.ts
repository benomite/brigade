// L'onglet Agents de « parade » (ticket 4117) : une carte par agent — le second, le manager, les cooks, la pass, son reviewer, le
// second juge, le triage, le closer, le superviseur —, ce qu'il fait, son état, ses chiffres des sept derniers jours avec leur sens,
// ses réglages et, pour le closer, ce qu'il voit sur la base en mots simples. Les fiches sont composées, comme le process
// principal les compose, de ce que les commandes du runtime rendent dans la fixture du test (app/test/agents/faits-fixture.ts).
import { changementsLus, interrupteurLu } from "../../../app/src/vue/agents/agents-box.ts";
import { fichesDesAgents } from "../../../app/src/vue/agents/fiches.ts";
import { reglagesVus } from "../../../app/src/reglages-du-projet.ts";
import { FAITS, FERMETURE, JOURNAL, SETTING, SWITCH } from "../../../app/test/agents/faits-fixture.ts";
import { configuration, cuisine, demarrage, type Ecran, MAINTENANT } from "./commun.ts";
import { PROJETS, RENDUS } from "./cuisine-figee.ts";

export const FICHES = fichesDesAgents({
  maintenant: new Date(MAINTENANT),
  faits: FAITS,
  reglages: reglagesVus(SETTING) ?? { sans: "settings not readable" },
  interrupteur: interrupteurLu(SWITCH),
  fermeture: FERMETURE,
  changements: changementsLus(JOURNAL),
});

export const ecran: Ecran = {
  dit: "L'onglet Agents de « parade » : chaque agent, ce qu'il fait, ses chiffres de la semaine, ses réglages",
  largeur: 1440,
  hauteur: 2900,
  // Rail, Stations, Agents, Settings : l'onglet Agents est le troisième.
  etapes: [{ cliquer: '#projets > button[title^="parade — "]' }, { cliquer: '#onglets-du-projet > [role="tab"]:nth-child(3)' }],
  donnees: () => ({
    maintenant: MAINTENANT,
    reponses: { demarrage: demarrage(configuration(PROJETS)), lireLesAgentsDuProjet: FICHES },
    envois: cuisine(RENDUS),
  }),
};
