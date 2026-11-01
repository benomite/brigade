// La file de « parade » quand le chef a confié #22 à un humain (#1958) : aucune station ne fournit `chrome-connecté`,
// le ticket a quitté le rail, et sa carte de TODO est une tâche — pour le chef, dans un champ qu'il peut changer avec
// « reassign » —, avec le titre, le contexte et les critères d'acceptation de sa carte. La box les donne dans
// `attend[].tache` (runtime/src/sortie-attente-capacite/) ; ses deux choix disent ce qu'il en est advenu.
import type { Faits } from "../../../app/src/faits.ts";
import { configuration, cuisine, demarrage, type Ecran, MAINTENANT, type Rendu } from "./commun.ts";
import { PROJETS, RENDUS } from "./cuisine-figee.ts";

const PARADE = RENDUS.parade as Rendu;
const ISSUE = (ticket: number) => `https://github.com/chef/parade/issues/${ticket}`;

const CARTE = {
  type: "product",
  resume: "No station can provide chrome-connecté: this ticket left the rail and is a human's job, for the chef.",
  question: "What became of this task?",
  choix: [
    { texte: "It is done", suite: "resume" },
    { texte: "It will not be done", suite: "resume" },
  ],
  captures: null,
};
const TACHE = {
  assignee: "chef",
  missing: ["chrome-connecté"],
  title: "La capture du formulaire",
  context: "Capture the signed-in form on the client's site.\nIt needs the chef's own Chrome session.",
  criteria: ["the capture shows the form signed in", "it is attached to the issue"],
};

const [PRIS, , , ...APRES] = PARADE.facts.rail;
export const FACTS = {
  ...PARADE.facts,
  compteurs: { ...PARADE.facts.compteurs, rail: 3, attend: 1 },
  rail: [PRIS, ...APRES],
  attend: [{ ticket: 22, titre: TACHE.title, url: ISSUE(22), decision: { quoi: "carte", motif: "product", cause: CARTE.question, pr: null }, carte: CARTE, tache: TACHE }],
} as Faits;

const STATUS = [
  "project    parade",
  "kitchen    open",
  "",
  "attend     1 décision attend le chef depuis 2 min",
  `  #22  depuis 2 min  produit : ${CARTE.question} — choix : 1. ${CARTE.choix[0]?.texte} · 2. ${CARTE.choix[1]?.texte}`,
  "fin attend",
  "",
  "rail       1 taken · 2 in pass",
  "  #14  taken  prio:1  by box/claude since 12 min, no progress since 3 min, lease 27 min left  Le journal en ajout seul",
  "  #30  in pass  -  since 4 min, cooked by box/claude  La pass verte",
  "  #12  in pass  -  since 2 d, cooked by box/claude  Validation SIRET",
  "",
  "cooks      1 running",
  "",
].join("\n");

export const ecran: Ecran = {
  dit: "La file de « parade » avec #22 confié à un humain : sa tâche dans TODO, pour le chef — le champ et « reassign » —, son titre, son contexte et ses critères (1958)",
  largeur: 1920,
  hauteur: 900,
  etapes: [{ cliquer: '#projets > button[title^="parade — "]' }],
  donnees: () => ({
    maintenant: MAINTENANT,
    reponses: { demarrage: demarrage(configuration(PROJETS)), espace: [] },
    envois: cuisine({ ...RENDUS, parade: { ...PARADE, facts: FACTS, status: STATUS } }),
  }),
};
