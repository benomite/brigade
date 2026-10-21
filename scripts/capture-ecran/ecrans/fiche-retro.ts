// La fiche d'un ticket servi et sa rétro (#1038) : #9, ouvert par sa carte dans la colonne Served du
// rail de parade. Ce qu'elle demande au pont est calculé par les modules de l'app, à partir de ce que
// la box rend : `pass 9 --json` pour l'histoire et la rétro, `pass 9 issue` pour la discussion.
import { discussionDe } from "../../../app/src/discussion.ts";
import { gestesDeCarte } from "../../../app/src/gestes-fiche.ts";
import { histoireDe, situationDe } from "../../../app/src/histoire.ts";
import type { Terminal } from "../../../app/src/terminaux.ts";
import type { HistoireDuTicket } from "../../../runtime/src/histoire-ticket.ts";
import { carteDe, configuration, cuisine, demarrage, type Ecran, MAINTENANT } from "./commun.ts";
import { PROJETS, RENDUS } from "./cuisine-figee.ts";

const SECOND: Terminal = { id: 1, projet: "parade", genre: "second", titre: "second · claude", note: "session neuve", arrete: false };

export const PASS: HistoireDuTicket = {
  ticket: 9,
  steps: [
    { kind: "arrived", at: "2026-10-13T08:10:02.000Z" },
    { kind: "taken", at: "2026-10-13T08:12:40.000Z", station: "box/claude" },
    { kind: "delivered", at: "2026-10-13T09:31:05.000Z", run: "r9" },
    { kind: "reviewed", at: "2026-10-13T09:40:12.000Z", verdict: "green", summary: "Le relevé des mesures se lit par station, et un seuil franchi se dit en tête de `status`." },
    { kind: "judged", at: "2026-10-13T10:03:40.000Z", verdict: "green" },
    { kind: "merged", at: "2026-10-13T10:03:58.000Z", by: "pass" },
  ],
  cost: { attempts: 1, tokens: 61_840, durationMs: 4_725_000, incomplete: false },
  retro: {
    at: "2026-10-13T10:03:58.000Z",
    text: "reconfirm L4\npropose Un seuil du runtime se lit dans `seuils/`, jamais recopié dans un autre fichier.\npropose Lancer `node --test --test-force-exit` sur un test de la vue lancé à la main.",
    lessons: [
      { kind: "reconfirm", id: "L4", text: "Lancer les tests du runtime avant de commiter." },
      { kind: "propose", id: "L11", text: "Un seuil du runtime se lit dans `seuils/`, jamais recopié dans un autre fichier." },
      { kind: "propose", id: "L12", text: "Lancer `node --test --test-force-exit` sur un test de la vue lancé à la main." },
    ],
  },
};

const ISSUE = {
  found: true,
  issue: {
    title: "Le relevé des mesures",
    state: "closed",
    body: { author: "chef", at: "2026-10-12T16:02:00.000Z", body: "Le relevé des mesures se lit **par station**." },
    comments: [],
  },
};

export const ecran: Ecran = {
  dit: "La fiche de #9, servi, ouverte par sa carte dans la colonne Served du rail de parade : son histoire, son coût et sa rétro — trois leçons provisoires et ce que son cook a écrit",
  largeur: 1440,
  hauteur: 900,
  // La case de parade, puis la première carte de la colonne Served (qui défile) : #9.
  etapes: [{ cliquer: '#projets > button[title^="parade — "]' }, { cliquer: "#rail .colonne[data-defile] li.bon:first-child" }],
  donnees: () => {
    const carte = carteDe(RENDUS.parade!, "parade", 9);
    return {
      maintenant: MAINTENANT,
      reponses: {
        demarrage: demarrage(configuration(PROJETS)),
        espace: [SECOND],
        situation: situationDe(carte),
        gestesDeFiche: gestesDeCarte(carte),
        lireHistoire: histoireDe(JSON.stringify(PASS)),
        lireDiscussion: discussionDe({ lance: "ssh box brigade parade pass 9 issue", erreur: null, sortie: JSON.stringify(ISSUE), erreurs: "" }, 30_000),
      },
      envois: cuisine(RENDUS),
    };
  },
};
