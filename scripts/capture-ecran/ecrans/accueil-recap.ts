// « Tous les projets », à l'ouverture de l'app, avec le récapitulatif de chaque projet (#3581) : ce que la cuisine a fait
// depuis que le chef a regardé. `parade` a servi deux tickets, en a vu un renvoyé et un refusé, et un garde-fou a arrêté un
// cook puis la cuisine ; `cantine` n'a rien fait depuis. Les réponses sont celles de la commande `recap` du runtime
// (runtime/src/recap/), telles que le process principal les rend (app/src/vue/recap/recap-box.ts).
import { configuration, cuisine, demarrage, type Ecran, MAINTENANT } from "./commun.ts";
import { PROJETS, RENDUS } from "./cuisine-figee.ts";

const DEPOT = "chef/parade";
const SINCE = "2026-10-12T18:20:00.000Z";
const issue = (ticket: number) => `https://github.com/${DEPOT}/issues/${ticket}`;
const pr = (numero: number) => `https://github.com/${DEPOT}/pull/${numero}`;

const PARADE = {
  recap: {
    repository: DEPOT,
    since: SINCE,
    until: MAINTENANT,
    served: [
      { ticket: 9, title: "Export the menu as a PDF", url: issue(9), pr: 31, prUrl: pr(31), servedAt: "2026-10-13T08:12:00Z" },
      { ticket: 7, title: "Fix the date picker on Safari", url: issue(7), pr: 29, prUrl: pr(29), servedAt: "2026-10-12T22:40:00Z" },
    ],
    sentBack: [
      { ticket: 12, url: issue(12), kind: "sent-back", reason: "the CI is red on `7579211` (PR #33)", at: "2026-10-13T07:30:00Z" },
      { ticket: 11, url: issue(11), kind: "refused", reason: "the review requested changes on `4be01c2` (PR #30)", at: "2026-10-13T02:10:00Z" },
    ],
    stops: [
      { at: "2026-10-13T01:05:00Z", ticket: 14, guardrail: "duration", line: "The cook of #14 was stopped by the duration cap." },
      { at: "2026-10-13T03:00:00Z", ticket: null, guardrail: "breaker", line: "The kitchen was stopped by the breaker, after 3 failures in a row." },
    ],
  },
};
const CANTINE = { recap: { repository: "chef/cantine", since: SINCE, until: MAINTENANT, served: [], sentBack: [], stops: [] } };

export const ecran: Ecran = {
  dit: "« Tous les projets », à l'ouverture : le récapitulatif de chaque projet depuis la dernière fois — parade a servi, renvoyé, été arrêté ; cantine, rien (#3581)",
  largeur: 1440,
  hauteur: 1100,
  etapes: [],
  donnees: () => ({
    maintenant: MAINTENANT,
    reponses: { demarrage: demarrage(configuration(PROJETS)), lireLeRecap: { __selon: { parade: PARADE, cantine: CANTINE } }, marquerLeRecap: { __selon: { parade: { seenUntil: MAINTENANT }, cantine: { seenUntil: MAINTENANT } } } },
    envois: cuisine(RENDUS),
  }),
};
