// « parade » passé sur GitHub seul (`githubOnlyState`, #2220) : sa box publie encore le tableau de sa cuisine, mais son
// rail y est celui de l'ancien chemin, figé — six tickets en attente, aucune station déclarée, la cuisine retenue et
// « oisive ». Sur GitHub, ses stations ont pris #14 (box/claude) et #16 (mac/claude), livré #30 (PR #41, cuisiné par
// box/claude), #40 attend un tiers, #21 et #22 attendent sur le rail. La vue reçoit ce que l'app en tire
// (app/src/vue/rail/github.ts, `avecLeRail`) — `facts` et `status` passés par le code de l'app, rien écrit à la main.
import type { Faits } from "../../../app/src/faits.ts";
import type { TableauLu } from "../../../app/src/tableau/lecture.ts";
import { statusDuTableau } from "../../../app/src/tableau/rail.ts";
import { avecLeRail, type RailSurGithub, type TicketSurGithub } from "../../../app/src/vue/rail/github.ts";
import { MAINTENANT, type Rendu } from "./commun.ts";
import { RENDUS } from "./cuisine-figee.ts";

const issue = (ticket: number) => `https://github.com/chef/parade/issues/${ticket}`;
const TITRES: Record<number, string> = { 12: "Validation SIRET", 14: "Le journal en ajout seul", 16: "Le menu du soir", 21: "L'export du journal", 22: "Un ticket libre", 30: "La pass verte", 40: "Le fournisseur de paiement" };

// Le tableau tel que la box le publie : le rail de son journal, d'avant la bascule.
const FIGE: Faits = {
  etat: "retenue",
  lu: "2026-10-13T10:04:11.000Z",
  dernierTick: "2026-10-13T10:04:02.000Z",
  compteurs: { rail: 6, auTravail: 0, aLaPass: 0, attend: 0, livres24h: 1 },
  dernierEvenement: { seq: 812, at: "2026-10-13T08:12:40.000Z", type: "rail.fed", ticket: null },
  rail: [12, 14, 16, 21, 22, 30].map((ticket) => ({ ticket, etat: "en attente", titre: TITRES[ticket] as string, url: issue(ticket), activite: null, attente: null })),
  cooks: [],
  stations: [],
  attend: [],
  livres: [],
  urgence: null,
  cuisineOisive: { depuis: "2026-10-13T08:12:40.000Z", cartes: [12, 14, 16, 21, 22, 30] },
} as unknown as Faits;

const RUBRIQUES = [
  { titre: "project", lignes: ["parade"] },
  { titre: "kitchen", lignes: ["open · breaker closed (0 failures in a row, opens at 3)"] },
  { titre: "stations", lignes: ["NONE DECLARED since 2026-10-13 08:12 UTC — no cook leaves, the tickets stay waiting"] },
  { titre: "rail", lignes: ["6 queued"] },
  { titre: "cooks", lignes: ["none running"] },
];

export const TABLEAU_FIGE = {
  lu: true,
  depot: "chef/parade",
  numero: 99,
  adresse: "https://github.com/chef/parade/issues/99",
  genereLe: "2026-10-13T10:04:11.000Z",
  luLe: MAINTENANT,
  age: 1,
  projet: "parade",
  file: [],
  pages: [],
  bilans: [],
  cuisine: { rubriques: RUBRIQUES },
  gestes: [],
  faits: FIGE,
  lignesDuRail: [12, 14, 16, 21, 22, 30].map((ticket) => ({ ticket, priorite: null, ligne: `  #${ticket}  queued  -  since 2026-10-13 08:12 UTC  ${TITRES[ticket]}` })),
  etatLuLe: "2026-10-13T10:04:11.000Z",
} as unknown as TableauLu;

const ticket = (numero: number, etat: string, autres: Partial<TicketSurGithub> = {}): TicketSurGithub => ({ ticket: numero, titre: TITRES[numero] as string, url: issue(numero), etat, priorite: null, creeLe: "2026-10-12T16:20:00.000Z", pr: null, prise: null, ...autres });

// Ce que GitHub dit du projet, à la même heure : ses issues `fire`, leurs labels, leurs prises et leurs PR.
export const SUR_GITHUB: RailSurGithub = {
  lu: MAINTENANT,
  tickets: [
    ticket(14, "pris", { priorite: 1, prise: { station: "box/claude", le: "2026-10-13T09:52:00.000Z" } }),
    ticket(16, "pris", { priorite: 2, prise: { station: "mac/claude", le: "2026-10-13T09:31:00.000Z" } }),
    ticket(30, "en pass", { pr: { numero: 41, url: "https://github.com/chef/parade/pull/41", le: "2026-10-13T09:58:00.000Z" }, prise: { station: "box/claude", le: "2026-10-13T09:12:00.000Z" } }),
    ticket(40, "WAITING"),
    ticket(21, "en attente", { priorite: 2, creeLe: "2026-10-13T07:40:00.000Z" }),
    ticket(22, "en attente", { creeLe: "2026-10-13T09:01:00.000Z" }),
  ],
};

// Les sorties que la vue reçoit pour « parade » : celles du tableau figé, ou celles qu'en tire l'app d'après GitHub.
export function renduDeParade(lu: TableauLu): Rendu {
  return { ...(RENDUS.parade as Rendu), facts: lu.faits as unknown as Faits, status: statusDuTableau(lu) };
}
export const RENDU_FIGE = renduDeParade(TABLEAU_FIGE);
export const RENDU_GITHUB = renduDeParade(avecLeRail(TABLEAU_FIGE, SUR_GITHUB));
