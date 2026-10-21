// L'onglet Cooks de « parade » (#1270) : un bloc par station du projet, chacune dans un des quatre états — la box
// cuit #14, le Mac arrêté par le chef y finit #15, l'atelier saturé cuit encore #16, le PC refuse le projet —, son
// bouton, et les cartes des tickets qui y sont en cours.
import type { Faits } from "../../../app/src/faits.ts";
import { configuration, cuisine, demarrage, type Ecran, MAINTENANT, type Rendu } from "./commun.ts";
import { PROJETS, RENDUS } from "./cuisine-figee.ts";

const PARADE = RENDUS.parade as Rendu;
const issue = (ticket: number) => `https://github.com/chef/parade/issues/${ticket}`;
const COOK_14 = { ticket: 14, titre: "Le journal en ajout seul", station: "box/claude" };
const COOK_15 = { ticket: 15, titre: "La carte des desserts", station: "mac/claude" };
const COOK_16 = { ticket: 16, titre: "Le menu du soir", station: "atelier/claude" };
const station = { plafond: 2, ordinaires: false, bacASable: null, prendOrdinaires: true, arreteeDepuis: null, refus: null } as const;
const REFUS = {
  status: "refused" as const,
  code: "sandbox-unusable" as const,
  message: "This computer cannot run the project's cooks in Claude Code's sandbox.",
  action: "Install or repair the sandbox on this computer, then wait: the station tries again by itself.",
  noRemedy: "Repairing the sandbox means installing software on this computer, which the app does not do for you.",
};
export const FACTS: Faits = {
  ...PARADE.facts,
  compteurs: { ...PARADE.facts.compteurs, auTravail: 3 },
  rail: [
    ...PARADE.facts.rail.slice(0, 1),
    { ticket: 15, etat: "pris", titre: COOK_15.titre, url: issue(15), activite: null, attente: null },
    { ticket: 16, etat: "pris", titre: COOK_16.titre, url: issue(16), activite: { fait: "teste", cible: "app/test", depuis: "2026-10-13T10:01:00.000Z" }, attente: null },
    ...PARADE.facts.rail.slice(1),
  ],
  cooks: [COOK_14, COOK_15, COOK_16],
  stations: [
    { ...station, station: "box/claude", distante: false, cuisson: "cooking", cooks: [COOK_14] },
    { ...station, station: "mac/claude", distante: true, cuisson: "stopped", arreteeDepuis: "2026-10-13T09:52:00.000Z", cooks: [COOK_15] },
    { ...station, station: "atelier/claude", distante: false, cuisson: "saturated", cooks: [COOK_16] },
    { ...station, station: "pc/claude", distante: true, cuisson: "refused", refus: REFUS, cooks: [] },
  ],
} as Faits;

export const ecran: Ecran = {
  dit: "L'onglet Cooks de « parade » : un bloc par station — cooking, stopped, saturated, refused —, son bouton et les cartes de ses tickets en cours",
  largeur: 1440,
  hauteur: 1000,
  etapes: [{ cliquer: '#projets > button[title^="parade — "]' }, { cliquer: "#onglets-du-projet button:nth-child(2)" }],
  donnees: () => ({
    maintenant: MAINTENANT,
    reponses: { demarrage: demarrage(configuration(PROJETS)), espace: [] },
    envois: cuisine({ ...RENDUS, parade: { ...PARADE, facts: FACTS } }),
  }),
};
