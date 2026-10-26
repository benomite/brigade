// Le rail de « parade » quand un ticket attend un tiers et qu'un autre en est revenu (#1740) : #23 dans WAITING — il
// attend la validation écrite du client —, #22 dans TODO, revenu de WAITING et repris par le chef. Ce que la box rend,
// mot pour mot. Ce fichier n'est pas un écran.
import type { Faits } from "../../../app/src/faits.ts";
import type { Terminal } from "../../../app/src/terminaux.ts";
import type { Rendu } from "./commun.ts";
import { RENDUS } from "./cuisine-figee.ts";

const PARADE = RENDUS.parade as Rendu;
const ISSUE = (ticket: number) => `https://github.com/chef/parade/issues/${ticket}`;
const TIERS = {
  quoi: "sa validation écrite du devis",
  qui: "le client",
  depuis: "2026-10-12T10:04:20.000Z",
  relance: "2026-10-19T00:00:00.000Z",
  aLArrivee: "il repart en cuisine, sans repasser par TODO : il est remis sur le rail, et un cook le prend à son tour",
};

const [PRIS, , , ...APRES] = PARADE.facts.rail;
export const FACTS = {
  ...PARADE.facts,
  compteurs: { ...PARADE.facts.compteurs, rail: 3, attend: 2 },
  rail: [
    PRIS,
    { ticket: 21, etat: "en attente", titre: "L'export du journal", url: ISSUE(21), activite: null, attente: null },
    { ticket: 23, etat: "WAITING", titre: "Le menu du soir", url: ISSUE(23), activite: null, attente: { raison: "attend : un tiers (WAITING)", colonne: "WAITING", retour: null }, tiers: TIERS },
    { ticket: 22, etat: "86", titre: "Un ticket libre", url: ISSUE(22), activite: null, attente: { raison: "attend : le chef — revenu de WAITING", colonne: "86", retour: null }, tiers: null },
    ...APRES,
  ],
  attend: [...PARADE.facts.attend, { ticket: 22, titre: "Un ticket libre", url: ISSUE(22), decision: { quoi: "repris", motif: null, cause: null, pr: null } }],
} as Faits;

export const STATUS = [
  "project    parade",
  "kitchen    open",
  "",
  "attend     2 décisions attendent le chef depuis 2 j",
  "  #12  depuis 2 j  livraison verte, non mergée faute de grant `merge` — à merger à la main : gh pr merge 31",
  "  #22  depuis 1 h  revenu de WAITING, repris par le chef (il attendait le client : « sa validation écrite du devis »)",
  "fin attend",
  "",
  "rail       1 taken · 2 in pass · 1 queued · 1 86 · 1 WAITING",
  "  #14  taken  prio:1  by box/claude since 12 min, no progress since 3 min, lease 27 min left  Le journal en ajout seul",
  "  #21  queued  -  zone held by #14 (app/src) — since 2 h 05  L'export du journal",
  "  #23  WAITING  -  since 2 d  Le menu du soir",
  "  #22  86  -  since 1 h  Un ticket libre",
  "  #30  in pass  -  since 4 min, cooked by box/claude  La pass verte",
  "  #12  in pass  -  since 2 d, cooked by box/claude  Validation SIRET",
  "",
  "cooks      1 running",
  "",
].join("\n");

export const RENDU: Rendu = { ...PARADE, facts: FACTS, status: STATUS };

export const SECOND: Terminal = { id: 1, projet: "parade", genre: "second", titre: "second · claude", note: "fil repris : la session d'hier", arrete: false };
