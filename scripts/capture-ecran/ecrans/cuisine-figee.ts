// Deux projets sur une box, tels qu'elle les rend à 10:04:12 (MAINTENANT) : « parade », dont un
// cook travaille, une livraison est à la pass et une décision attend le chef ; « cantine », calme.
// Ce sont des sorties de box, mot pour mot — rien de ce que la vue reçoit n'est écrit ici à la main.
import type { Project } from "../../../app/src/config.ts";
import type { Facts } from "../../../app/src/facts.ts";
import type { Rendu } from "./commun.ts";

export const PROJETS: Project[] = [
  { nom: "parade", dossier: "/Users/chef/code/parade", couleurs: { onglet: "#f2994a", accent: "#f2994a" } },
  { nom: "cantine", dossier: "/Users/chef/code/cantine", couleurs: { onglet: "#4fc7b5", accent: "#4fc7b5" } },
];

const issue = (ticket: number) => `https://github.com/chef/parade/issues/${ticket}`;

const carte = (ticket: number, titre: string, pr: number | null = null) => ({ ticket, title: titre, url: issue(ticket), tries: 0, pr: pr === null ? null : { number: pr, url: `https://github.com/chef/parade/pull/${pr}` } });
const colonnes = (cartes: Record<string, ReturnType<typeof carte>[]>) =>
  [["backlog", "Backlog"], ["ready", "Ready"], ["cooking", "Cooking"], ["pass", "At the pass"], ["parked", "Parked"], ["served", "Served"]].map(([key, title]) => ({ key: key as "backlog", title: title as string, cards: cartes[key as string] ?? [] }));

const FAITS_PARADE: Facts = {
  etat: "ouverte",
  lu: "2026-10-13T10:04:11.000Z",
  compteurs: { rail: 2, auTravail: 1, aLaPass: 1, attend: 1, livres24h: 2 },
  kitchenBoard: {
    columns: colonnes({
      ready: [carte(21, "L'export du journal"), carte(22, "Un ticket libre")],
      cooking: [carte(14, "Le journal en ajout seul")],
      pass: [carte(30, "La pass verte", 32), carte(12, "Validation SIRET", 31)],
      served: [carte(9, "Le relevé des mesures", 19), carte(7, "Les accès sous plafond", 8)],
    }),
  },
  attend: [{ ticket: 12, titre: "Validation SIRET", url: issue(12) }],
};

const STATUS_PARADE = [
  "project    parade",
  "kitchen    open",
  "",
  "attend     1 décision attend le chef depuis 2 j",
  "  #12  depuis 2 j  livraison verte, non mergée — à merger à la main : gh pr merge 31",
  "fin attend",
  "",
  "rail       1 taken · 2 in pass · 2 queued",
  "  #14  taken  prio:1  by box/claude since 12 min, no progress since 3 min, lease 27 min left  Le journal en ajout seul",
  "  #21  queued  -  zone held by #14 (app/src) — since 2 h 05  L'export du journal",
  "  #22  queued  -  since 3 min  Un ticket libre",
  "  #30  in pass  -  since 4 min, cooked by box/claude  La pass verte",
  "  #12  in pass  -  since 2 d, cooked by box/claude  Validation SIRET",
  "",
  "cooks      1 running",
  "",
].join("\n");

const FAITS_CANTINE: Facts = {
  etat: "ouverte",
  lu: "2026-10-13T10:04:10.000Z",
  compteurs: { rail: 1, auTravail: 0, aLaPass: 0, attend: 0, livres24h: 1 },
  kitchenBoard: {
    columns: colonnes({
      ready: [{ ...carte(5, "La carte du midi"), url: "https://github.com/chef/cantine/issues/5" }],
      served: [{ ...carte(3, "Les allergènes sur chaque plat", 4), url: "https://github.com/chef/cantine/issues/3" }],
    }),
  },
  attend: [],
};

const STATUS_CANTINE = ["project    cantine", "kitchen    open", "", "rail       1 queued", "  #5  queued  -  since 23 min  La carte du midi", "", "cooks      none running", ""].join("\n");

const STATION = ["station    box — Debian 12, 8 cœurs", "machine    disponible · charge 1.2", "quota      tient", ""].join("\n");

export const RENDUS: Record<string, Rendu> = {
  parade: { facts: FAITS_PARADE, status: STATUS_PARADE, station: STATION },
  cantine: { facts: FAITS_CANTINE, status: STATUS_CANTINE, station: STATION },
};
