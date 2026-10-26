// Le rail de « parade » avec #22 mis de côté faute de station (1752) : sa carte, dans la colonne 86, dit qu'il faut un humain,
// ce qui manque et le geste. Le texte est celui que la box écrit (`direMiseDeCote`), pas un texte recopié.
import type { Faits } from "../../../app/src/faits.ts";
import { direMiseDeCote } from "../../../runtime/src/mise-de-cote.ts";
import { configuration, cuisine, demarrage, type Ecran, MAINTENANT, type Rendu } from "./commun.ts";
import { PROJETS, RENDUS } from "./cuisine-figee.ts";

const PARADE = RENDUS.parade as Rendu;
const ISSUE = (ticket: number) => `https://github.com/chef/parade/issues/${ticket}`;

const [PRIS, , , ...APRES] = PARADE.facts.rail;
export const FACTS = {
  ...PARADE.facts,
  compteurs: { ...PARADE.facts.compteurs, rail: 3 },
  rail: [
    PRIS,
    { ticket: 22, etat: "86", titre: "La capture du formulaire", url: ISSUE(22), activite: null, attente: { raison: direMiseDeCote("no-station: chrome-connecté"), colonne: "86", retour: null }, tiers: null },
    ...APRES,
  ],
} as Faits;

const STATUS = [
  "project    parade",
  "kitchen    open",
  "",
  "rail       1 taken · 2 in pass · 1 86",
  "  #14  taken  prio:1  by box/claude since 12 min, no progress since 3 min, lease 27 min left  Le journal en ajout seul",
  "  #22  86  -  since 1 h  La capture du formulaire",
  "  #30  in pass  -  since 4 min, cooked by box/claude  La pass verte",
  "  #12  in pass  -  since 2 d, cooked by box/claude  Validation SIRET",
  "",
  "cooks      1 running",
  "",
].join("\n");

export const ecran: Ecran = {
  dit: "Le rail de « parade » avec #22 mis de côté faute de station : sa carte dit qu'il faut un humain, la capacité qui manque et le geste (1752)",
  largeur: 2600,
  hauteur: 900,
  etapes: [{ cliquer: '#projets > button[title^="parade — "]' }],
  donnees: () => ({
    maintenant: MAINTENANT,
    reponses: { demarrage: demarrage(configuration(PROJETS)), espace: [] },
    envois: cuisine({ ...RENDUS, parade: { ...PARADE, facts: FACTS, status: STATUS } }),
  }),
};
