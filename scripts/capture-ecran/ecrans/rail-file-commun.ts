// La file de « parade » quand quatre tickets attendent sur le rail (ticket 1347) : la colonne « On the rail » dans
// l'ordre où le runtime les sert — #21 et #23 en `prio:1`, #22 et #24 en `prio:2` —, chaque carte avec sa priorité. #21,
// en tête, ne part pas : #14 tient sa zone, et `facts` le dit (`rail[].raison`, #1346). Ce que la box rend, mot pour
// mot. Ce fichier n'est pas un écran.
import type { Faits } from "../../../app/src/faits.ts";
import { configuration, cuisine, demarrage, type Ecran, MAINTENANT, type Rendu } from "./commun.ts";
import { PROJETS, RENDUS } from "./cuisine-figee.ts";

const PARADE = RENDUS.parade as Rendu;
const ISSUE = (ticket: number) => `https://github.com/chef/parade/issues/${ticket}`;
const EN_FILE = (ticket: number, titre: string, raison: string | null = null) => ({ ticket, etat: "en attente", titre, url: ISSUE(ticket), activite: null, attente: null, raison });

const [PRIS, , , ...APRES] = PARADE.facts.rail;
export const FACTS = {
  ...PARADE.facts,
  compteurs: { ...PARADE.facts.compteurs, rail: 4 },
  rail: [
    PRIS,
    EN_FILE(21, "L'export du journal", "zone held by #14 (app/src)"),
    EN_FILE(23, "Le menu du soir"),
    EN_FILE(22, "Un ticket libre"),
    EN_FILE(24, "Les prix en euros"),
    ...APRES,
  ],
} as Faits;

const STATUS = [
  "project    parade",
  "kitchen    open",
  "",
  "attend     1 décision attend le chef depuis 2 j",
  "  #12  depuis 2 j  livraison verte, non mergée faute de grant `merge` — à merger à la main : gh pr merge 31",
  "fin attend",
  "",
  "rail       1 taken · 2 in pass · 4 queued",
  "  #14  taken  prio:1  by box/claude since 12 min, no progress since 3 min, lease 27 min left  Le journal en ajout seul",
  "  #21  queued  prio:1  zone held by #14 (app/src) — since 2 h 05  L'export du journal",
  "  #23  queued  prio:1  since 40 min  Le menu du soir",
  "  #22  queued  prio:2  since 3 min  Un ticket libre",
  "  #24  queued  prio:2  since 1 min  Les prix en euros",
  "  #30  in pass  -  since 4 min, cooked by box/claude  La pass verte",
  "  #12  in pass  -  since 2 d, cooked by box/claude  Validation SIRET",
  "",
  "cooks      1 running",
  "",
].join("\n");

// La carte de rang `n` dans « On the rail », la première colonne : dans l'ordre de service, #21, #23, #22, #24.
export const CARTE = (rang: number) => `#rail .colonnes > .colonne:first-child > ol > li.bon:nth-child(${rang})`;

export const FILE: Ecran = {
  dit: "La file de « parade », quatre tickets sur le rail dans l'ordre où le runtime les sert, chacun avec sa priorité : #21, en tête, dit pourquoi il ne part pas — #14 tient sa zone",
  largeur: 1440,
  hauteur: 900,
  etapes: [{ cliquer: '#projets > button[title^="parade — "]' }],
  donnees: () => ({
    maintenant: MAINTENANT,
    reponses: { demarrage: demarrage(configuration(PROJETS)), espace: [] },
    envois: cuisine({ ...RENDUS, parade: { ...PARADE, facts: FACTS, status: STATUS } }),
  }),
};
