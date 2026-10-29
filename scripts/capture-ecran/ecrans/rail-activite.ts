// La colonne « Taken » de « parade » (#1894) : la ligne d'activité de chaque carte est dite en anglais — #14 écrit un
// fichier (`writing app/src/bon.ts · 2 min`), #16 ne fait que réfléchir (`in the kitchen`, sans durée), #17 lance une
// commande —, et la carte en pass dit `running the gates`. Ce que la box rend, mot pour mot : `fait` en français,
// `faitEn` en anglais.
import type { Faits } from "../../../app/src/faits.ts";
import { configuration, cuisine, demarrage, type Ecran, MAINTENANT, type Rendu } from "./commun.ts";
import { PROJETS, RENDUS } from "./cuisine-figee.ts";

const PARADE = RENDUS.parade as Rendu;
const ISSUE = (ticket: number) => `https://github.com/chef/parade/issues/${ticket}`;
const depuis = "2026-10-13T10:02:11.000Z";
const PRIS = (ticket: number, titre: string, activite: { fait: string; faitEn: string; cible: string | null }) => ({
  ticket,
  etat: "pris",
  titre,
  url: ISSUE(ticket),
  depuis,
  activite: { ...activite, depuis },
  attente: null,
});

const [, ...SUITE] = PARADE.facts.rail;
const FACTS = {
  ...PARADE.facts,
  compteurs: { ...PARADE.facts.compteurs, auTravail: 3 },
  rail: [
    PRIS(14, "Le journal en ajout seul", { fait: "écrit", faitEn: "writing", cible: "app/src/bon.ts" }),
    PRIS(16, "Le menu du soir", { fait: "réfléchit", faitEn: "thinking", cible: null }),
    PRIS(17, "Les prix en euros", { fait: "lance une commande", faitEn: "running a command", cible: null }),
    ...SUITE.map((carte) => (carte.ticket === 30 ? { ...carte, activite: { fait: "gates en cours", faitEn: "running the gates", cible: null, depuis: "2026-10-13T10:03:41.000Z" } } : carte)),
  ],
} as Faits;

export const ecran: Ecran = {
  dit: "La colonne Taken de « parade » : #14 dit « writing app/src/bon.ts · 2 min », #16, qui ne fait que réfléchir, dit « in the kitchen » sans durée, #17 « running a command · 2 min » ; la pass dit « running the gates »",
  largeur: 1440,
  hauteur: 900,
  etapes: [{ cliquer: '#projets > button[title^="parade — "]' }],
  donnees: () => ({
    maintenant: MAINTENANT,
    reponses: { demarrage: demarrage(configuration(PROJETS)), espace: [] },
    envois: cuisine({ ...RENDUS, parade: { ...PARADE, facts: FACTS } }),
  }),
};
