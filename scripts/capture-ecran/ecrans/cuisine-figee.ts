// Deux projets sur une box, tels qu'elle les rend à 10:04:12 (MAINTENANT) : « parade », dont un
// cook travaille, une livraison est à la pass et une décision attend le chef ; « cantine », calme.
// Ce sont des sorties de box, mot pour mot — rien de ce que la vue reçoit n'est écrit ici à la main.
import type { Projet } from "../../../app/src/config.ts";
import type { Faits } from "../../../app/src/faits.ts";
import type { Rendu } from "./commun.ts";

export const PROJETS: Projet[] = [
  { nom: "parade", dossier: "/Users/chef/code/parade", box: { hote: "box" }, couleurs: { onglet: "#f2994a", accent: "#f2994a" } },
  { nom: "cantine", dossier: "/Users/chef/code/cantine", box: { hote: "box" }, couleurs: { onglet: "#4fc7b5", accent: "#4fc7b5" } },
];

const issue = (ticket: number) => `https://github.com/chef/parade/issues/${ticket}`;

const FAITS_PARADE: Faits = {
  etat: "ouverte",
  lu: "2026-10-13T10:04:11.000Z",
  dernierTick: "2026-10-13T10:04:02.000Z",
  compteurs: { rail: 2, auTravail: 1, aLaPass: 1, attend: 1, livres24h: 2 },
  dernierEvenement: { seq: 812, at: "2026-10-13T10:03:58.000Z", type: "merge.done", ticket: 9 },
  rail: [
    { ticket: 14, etat: "pris", titre: "Le journal en ajout seul", url: issue(14), activite: { fait: "écrit", cible: "app/src/bon.ts", depuis: "2026-10-13T10:02:11.000Z" }, attente: null },
    { ticket: 21, etat: "en attente", titre: "L'export du journal", url: issue(21), activite: null, attente: null },
    { ticket: 22, etat: "en attente", titre: "Un ticket libre", url: issue(22), activite: null, attente: null },
    { ticket: 30, etat: "en pass", titre: "La pass verte", url: issue(30), activite: { fait: "gates en cours", cible: null, depuis: "2026-10-13T10:03:41.000Z" }, attente: null },
    { ticket: 12, etat: "en pass", titre: "Validation SIRET", url: issue(12), activite: null, attente: null },
  ],
  cooks: [{ ticket: 14, titre: "Le journal en ajout seul", station: "box/claude" }],
  attend: [{ ticket: 12, titre: "Validation SIRET", url: issue(12) }],
  livres: [
    {
      ticket: 9,
      titre: "Le relevé des mesures",
      url: issue(9),
      livre: "2026-10-13T10:03:58.000Z",
      station: "box/claude",
      pr: "https://github.com/chef/parade/pull/19",
      relecture: { resume: "Le relevé des mesures se lit par station, et un seuil franchi se dit en tête de `status`.", constats: [{ gravite: "remarque", fichier: "runtime/src/mesures.ts", constat: "Le seuil par défaut est répété dans deux fichiers." }] },
    },
    { ticket: 7, titre: "Les grants sous plafond", url: issue(7), livre: "2026-10-13T07:12:40.000Z", station: "box/claude", pr: "https://github.com/chef/parade/pull/8", relecture: { resume: "Un grant porte désormais un plafond d'usages.", constats: [] } },
  ],
  urgence: null,
};

const STATUS_PARADE = [
  "projet     parade",
  "cuisine    ouverte",
  "",
  "attend     1 décision attend le chef depuis 2 j",
  "  #12  depuis 2 j  livraison verte, non mergée faute de grant `merge` — à merger à la main : gh pr merge 31",
  "fin attend",
  "",
  "rail       2 en attente · 1 pris · 2 en pass",
  "  #14  pris  prio:1  par box/claude depuis 12 min, sans progrès depuis 3 min, bail encore 27 min  Le journal en ajout seul",
  "  #21  en attente  -  zone tenue par #14 (app/src) — depuis 2 h 05  L'export du journal",
  "  #22  en attente  -  depuis 3 min  Un ticket libre",
  "  #30  en pass  -  depuis 4 min, cuisiné par box/claude  La pass verte",
  "  #12  en pass  -  depuis 2 j, cuisiné par box/claude  Validation SIRET",
  "",
  "cooks      1 en cours",
  "",
].join("\n");

const FAITS_CANTINE: Faits = {
  etat: "ouverte",
  lu: "2026-10-13T10:04:10.000Z",
  dernierTick: "2026-10-13T10:04:05.000Z",
  compteurs: { rail: 1, auTravail: 0, aLaPass: 0, attend: 0, livres24h: 1 },
  dernierEvenement: { seq: 140, at: "2026-10-13T09:41:20.000Z", type: "ticket.queued", ticket: 5 },
  rail: [{ ticket: 5, etat: "en attente", titre: "La carte du midi", url: "https://github.com/chef/cantine/issues/5", activite: null, attente: null }],
  cooks: [],
  attend: [],
  livres: [{ ticket: 3, titre: "Les allergènes sur chaque plat", url: "https://github.com/chef/cantine/issues/3", livre: "2026-10-13T08:20:00.000Z", station: "box/claude", pr: "https://github.com/chef/cantine/pull/4", relecture: null }],
  urgence: null,
};

const STATUS_CANTINE = ["projet     cantine", "cuisine    ouverte", "", "rail       1 en attente", "  #5  en attente  -  depuis 23 min  La carte du midi", "", "cooks      aucun", ""].join("\n");

const STATION = ["station    box — Debian 12, 8 cœurs", "machine    disponible · charge 1.2", "quota      tient", ""].join("\n");

export const RENDUS: Record<string, Rendu> = {
  parade: { facts: FAITS_PARADE, status: STATUS_PARADE, station: STATION },
  cantine: { facts: FAITS_CANTINE, status: STATUS_CANTINE, station: STATION },
};
