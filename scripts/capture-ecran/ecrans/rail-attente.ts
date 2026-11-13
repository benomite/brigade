// Le rail de « parade » dont les tickets en file ne partent pas encore (#3433) : trois tickets `fire` entrés dans la file il y a
// deux minutes, aucun cook ne tourne, la box en ligne. En tête du rail, la phrase de l'attente normale ; sur #21, « after #12 ».
// La vue reçoit ce que l'app en tire (app/src/vue/rail/github.ts, `avecLeRail`), rien écrit à la main.
import type { TableauLu } from "../../../app/src/tableau/lecture.ts";
import { avecLeRail, type RailSurGithub } from "../../../app/src/vue/rail/github.ts";
import { configuration, cuisine, demarrage, type Ecran, MAINTENANT } from "./commun.ts";
import { PROJETS, RENDUS } from "./cuisine-figee.ts";
import { renduDeParade, signe, ticket } from "./github-seul-commun.ts";

const ENTREE = new Date(Date.parse(MAINTENANT) - 120_000).toISOString();
const RAIL: RailSurGithub = {
  lu: MAINTENANT,
  tickets: [
    ticket(12, "en attente", { entreLe: ENTREE }),
    ticket(21, "en attente", { entreLe: ENTREE, depend: [12] }),
    ticket(22, "en attente", { entreLe: ENTREE }),
  ],
};
const VIDE: TableauLu = {
  lu: true,
  depot: "chef/parade",
  luLe: MAINTENANT,
  cuisine: { rubriques: [] },
  faits: { etat: "ouverte", lu: MAINTENANT, dernierTick: null, dernierEvenement: null, compteurs: { rail: 0, auTravail: 0, aLaPass: 0, attend: 0, livres24h: 0 }, rail: [] },
  file: [],
  bilans: [],
  lignesDuRail: [],
  activites: [],
};

export const ecran: Ecran = {
  dit: "Le rail de « parade », trois tickets en file depuis deux minutes et aucun cook : la phrase de l'attente normale en tête, « after #12 » sur #21 (#3433)",
  largeur: 1440,
  hauteur: 640,
  etapes: [{ cliquer: '#projets > button[title^="parade — "]' }],
  donnees: () => ({
    maintenant: MAINTENANT,
    reponses: { demarrage: demarrage(configuration(PROJETS)), espace: [] },
    envois: cuisine({ ...RENDUS, parade: renduDeParade(avecLeRail(VIDE, RAIL, { lus: [signe("box", new Date(Date.parse(MAINTENANT) - 30_000).toISOString())] })) }),
  }),
};
