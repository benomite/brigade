// La file de « parade » quand trois cartes attendent le chef dans TODO, chacune dans la forme unique
// de l'épique #1764 (runtime/src/carte-todo/forme.ts) : en tête ce qui se passe, en deux phrases au
// plus, puis la question, un bouton par choix, un champ pour répondre en texte libre, et « ask the
// second » en action secondaire. #12, une validation de design et ses captures avant et après ; #21,
// un choix de produit sans écran ; #31, un seul geste — merger à la main une livraison verte que le
// grant ne laisse pas merger — : un seul bouton, et aucune question (#1767).
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
  resume: "The SIRET form is redrawn and its delivery is green. The cook put the error line under the field.",
  question: "Does the SIRET field read as the mockup draws it?",
  choix: [
    { texte: "Yes, merge it as delivered.", suite: "merge" },
    { texte: "No: the error line goes beside the field.", suite: "resume" },
  ],
  captures: { complet: true, ecrans: [{ ecran: "formulaire-siret", avant: CAPTURE("avant"), apres: CAPTURE("apres") }] },
};
const PRODUIT = {
  type: "product",
  resume: "The journal export is ready to cook. It can write one file per project, or one for all.",
  question: "One journal export per project, or a single one for all projects?",
  choix: [
    { texte: "One per project.", suite: "resume" },
    { texte: "A single export for all projects.", suite: "resume" },
  ],
  captures: null,
};
const MERGE = {
  type: "product",
  resume: "The delivery of #31 is green. The grant does not let the pass merge it.",
  question: null,
  choix: [{ texte: "Merge the PR", suite: "merge" }],
  captures: null,
};

export const FACTS = {
  ...PARADE.facts,
  compteurs: { ...PARADE.facts.compteurs, attend: 3 },
  attend: [
    { ticket: 12, titre: "Validation SIRET", url: ISSUE(12), decision: { quoi: "carte", motif: "design", cause: DESIGN.question, pr: null }, carte: DESIGN },
    { ticket: 21, titre: "L'export du journal", url: ISSUE(21), decision: { quoi: "carte", motif: "product", cause: PRODUIT.question, pr: null }, carte: PRODUIT },
    { ticket: 31, titre: "Le bandeau des alertes", url: ISSUE(31), decision: { quoi: "carte", motif: "product", cause: MERGE.resume, pr: null }, carte: MERGE },
  ],
} as Faits;

const STATUS = [
  "project    parade",
  "kitchen    open",
  "",
  "attend     3 décisions attendent le chef — la plus ancienne depuis 2 j",
  `  #12  depuis 2 j  design : ${DESIGN.question} — choix : 1. ${DESIGN.choix[0]?.texte} · 2. ${DESIGN.choix[1]?.texte} — captures : 1 écran, avant et après`,
  `  #21  depuis 1 h  produit : ${PRODUIT.question} — choix : 1. ${PRODUIT.choix[0]?.texte} · 2. ${PRODUIT.choix[1]?.texte}`,
  `  #31  depuis 5 min  produit : ${MERGE.resume} — choix : 1. ${MERGE.choix[0]?.texte}`,
  "fin attend",
  "",
  "rail       1 taken · 3 in pass · 2 queued",
  "  #14  taken  prio:1  by box/claude since 12 min, no progress since 3 min, lease 27 min left  Le journal en ajout seul",
  "  #21  queued  -  since 1 h  L'export du journal",
  "  #22  queued  -  since 3 min  Un ticket libre",
  "  #30  in pass  -  since 4 min, cooked by box/claude  La pass verte",
  "  #12  in pass  -  since 2 d, cooked by box/claude  Validation SIRET",
  "  #31  in pass  -  since 5 min, cooked by box/claude  Le bandeau des alertes",
  "",
  "cooks      1 running",
  "",
].join("\n");

export const ecran: Ecran = {
  dit: "La file de « parade » avec trois cartes dans TODO, dans la forme unique : ce qui se passe, la question, un bouton par choix, un champ de texte libre, « ask the second » en retrait — et une carte à un seul geste, un bouton sans question",
  largeur: 1440,
  hauteur: 1700,
  etapes: [{ cliquer: '#projets > button[title^="parade — "]' }],
  donnees: () => ({
    maintenant: MAINTENANT,
    reponses: { demarrage: demarrage(configuration(PROJETS)), espace: [], lireCapture: { image: IMAGE } },
    envois: cuisine({ ...RENDUS, parade: { ...PARADE, facts: FACTS, status: STATUS } }),
  }),
};
