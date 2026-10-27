// Le rail de « parade » avec #22 mis de côté faute de station (1752) : ce qu'il attend est une action que le chef ne fait
// pas par un bouton, brancher une station — sa carte est dans WAITING et dit ce qui est attendu, de qui, et qu'il repart
// seul. Les textes sont ceux que la box écrit (`direMiseDeCote`, `attenteDUneStation`), pas des textes recopiés.
import type { Faits } from "../../../app/src/faits.ts";
import { attenteDUneStation, direMiseDeCote } from "../../../runtime/src/mise-de-cote.ts";
import { configuration, cuisine, demarrage, type Ecran, MAINTENANT, type Rendu } from "./commun.ts";
import { PROJETS, RENDUS } from "./cuisine-figee.ts";

const PARADE = RENDUS.parade as Rendu;
const ISSUE = (ticket: number) => `https://github.com/chef/parade/issues/${ticket}`;

const [PRIS, , , ...APRES] = PARADE.facts.rail;
const MOTIF = "no-station: chrome-connecté";
export const FACTS = {
  ...PARADE.facts,
  compteurs: { ...PARADE.facts.compteurs, rail: 3 },
  rail: [
    PRIS,
    {
      ticket: 22,
      etat: "WAITING",
      titre: "La capture du formulaire",
      url: ISSUE(22),
      activite: null,
      attente: { raison: direMiseDeCote(MOTIF), colonne: "WAITING", retour: null },
      tiers: { ...(attenteDUneStation(MOTIF) as NonNullable<ReturnType<typeof attenteDUneStation>>), depuis: "2026-10-13T09:04:12.000Z", relance: null },
    },
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
  dit: "Le rail de « parade » avec #22 mis de côté faute de station : sa carte, dans WAITING, dit ce qui est attendu : une station qui fournit la capacité, de la part d'un humain (1752)",
  largeur: 2600,
  hauteur: 900,
  etapes: [{ cliquer: '#projets > button[title^="parade — "]' }],
  donnees: () => ({
    maintenant: MAINTENANT,
    reponses: { demarrage: demarrage(configuration(PROJETS)), espace: [] },
    envois: cuisine({ ...RENDUS, parade: { ...PARADE, facts: FACTS, status: STATUS } }),
  }),
};
