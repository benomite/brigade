// La file de « parade » quand deux cartes attendent le chef dans TODO (#1281, épique #1277) : la box
// donne, dans `attend[].carte`, la question de chacune, ses choix et ses captures
// (runtime/src/carte-todo.ts). #12, une validation de design : sa livraison verte attend, ses deux
// captures — l'écran avant et après — sont sur la carte. #21, un choix de produit, sans écran : sa
// carte n'a pas de zone de captures. Chacune a un bouton par choix et un champ pour répondre en
// texte libre.
import { readFileSync } from "node:fs";
import type { Faits } from "../../../app/src/faits.ts";
import { configuration, cuisine, demarrage, type Ecran, MAINTENANT, type Rendu } from "./commun.ts";
import { PROJETS, RENDUS } from "./cuisine-figee.ts";

const PARADE = RENDUS.parade as Rendu;
const ISSUE = (ticket: number) => `https://github.com/chef/parade/issues/${ticket}`;
const CAPTURE = (moment: string) => `https://github.com/chef/parade/blob/5d41402abc4b2a76b9719d911017c592/docs/captures/12/formulaire-siret-${moment}.png?raw=true`;
// L'image que le `gh` du poste rendrait pour chaque capture : une capture d'écran du dépôt, la même pour les deux.
const IMAGE = `data:image/png;base64,${readFileSync(new URL("../../../docs/captures/1081/station-avant.png", import.meta.url)).toString("base64")}`;

const DESIGN = {
  type: "design",
  question: "Does the SIRET field read as the mockup draws it?",
  choix: [
    { texte: "Yes, merge it as delivered.", suite: "merge" },
    { texte: "No: the error line goes under the field, not beside it.", suite: "resume" },
  ],
  captures: { complet: true, ecrans: [{ ecran: "formulaire-siret", avant: CAPTURE("avant"), apres: CAPTURE("apres") }] },
};
const PRODUIT = {
  type: "product",
  question: "One journal export per project, or a single one for all projects?",
  choix: [
    { texte: "One per project: each project keeps its own file.", suite: "resume" },
    { texte: "A single export, all projects together.", suite: "resume" },
  ],
  captures: null,
};

export const FACTS = {
  ...PARADE.facts,
  compteurs: { ...PARADE.facts.compteurs, attend: 2 },
  attend: [
    { ticket: 12, titre: "Validation SIRET", url: ISSUE(12), decision: { quoi: "carte", motif: "design", cause: DESIGN.question, pr: null }, carte: DESIGN },
    { ticket: 21, titre: "L'export du journal", url: ISSUE(21), decision: { quoi: "carte", motif: "product", cause: PRODUIT.question, pr: null }, carte: PRODUIT },
  ],
} as Faits;

const STATUS = [
  "project    parade",
  "kitchen    open",
  "",
  "attend     2 décisions attendent le chef — la plus ancienne depuis 2 j",
  `  #12  depuis 2 j  design : ${DESIGN.question} — choix : 1. ${DESIGN.choix[0]?.texte} · 2. ${DESIGN.choix[1]?.texte} — captures : 1 écran, avant et après`,
  `  #21  depuis 1 h  produit : ${PRODUIT.question} — choix : 1. ${PRODUIT.choix[0]?.texte} · 2. ${PRODUIT.choix[1]?.texte}`,
  "fin attend",
  "",
  "rail       1 taken · 2 in pass · 2 queued",
  "  #14  taken  prio:1  by box/claude since 12 min, no progress since 3 min, lease 27 min left  Le journal en ajout seul",
  "  #21  queued  -  since 1 h  L'export du journal",
  "  #22  queued  -  since 3 min  Un ticket libre",
  "  #30  in pass  -  since 4 min, cooked by box/claude  La pass verte",
  "  #12  in pass  -  since 2 d, cooked by box/claude  Validation SIRET",
  "",
  "cooks      1 running",
  "",
].join("\n");

export const ecran: Ecran = {
  dit: "La file de « parade » avec deux cartes dans TODO : une validation de design et ses captures, un choix de produit sans écran — chacune sa question, un bouton par choix, un champ de texte libre",
  largeur: 1440,
  hauteur: 1400,
  etapes: [{ cliquer: '#projets > button[title^="parade — "]' }],
  donnees: () => ({
    maintenant: MAINTENANT,
    reponses: { demarrage: demarrage(configuration(PROJETS)), espace: [], lireCapture: { image: IMAGE } },
    envois: cuisine({ ...RENDUS, parade: { ...PARADE, facts: FACTS, status: STATUS } }),
  }),
};
