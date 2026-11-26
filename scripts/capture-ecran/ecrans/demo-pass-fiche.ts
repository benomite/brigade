// Scène 5 de la démo (ticket 2875), côté app : la fiche de #21, servi, ouverte par sa carte dans la colonne Served de
// « parade » — son histoire, de l'arrivée sur le rail au merge de la pass, et son coût.
import { gestesDeCarte } from "../../../app/src/gestes-fiche.ts";
import { situationDe } from "../../../app/src/histoire.ts";
import { discussionDe, type HistoireBrute, histoireDe } from "../../../app/test/aides/fiches-dites.ts";
import { carteDe, type Ecran } from "./commun.ts";
import { donneesDe, OUVRIR_PARADE, SERVI } from "./demo-commun.ts";

const HISTOIRE: HistoireBrute = {
  ticket: 21,
  steps: [
    { kind: "arrived", at: "2026-10-13T09:20:02.000Z" },
    { kind: "taken", at: "2026-10-13T09:22:40.000Z", station: "box/claude" },
    { kind: "delivered", at: "2026-10-13T09:51:05.000Z", run: "r21" },
    { kind: "reviewed", at: "2026-10-13T09:58:12.000Z", verdict: "green", summary: "Le journal s'exporte par projet, dans un fichier à lui." },
    { kind: "judged", at: "2026-10-13T10:03:40.000Z", verdict: "green" },
    { kind: "merged", at: "2026-10-13T10:03:58.000Z", by: "pass" },
  ],
  cost: { attempts: 1, tokens: 52_310, durationMs: 1_740_000, incomplete: false },
};

const ISSUE = {
  found: true,
  issue: {
    title: "L'export du journal",
    state: "closed",
    body: { author: "chef", at: "2026-10-13T09:19:00.000Z", body: "Le chef doit pouvoir **exporter le journal** d'un projet dans un fichier." },
    comments: [],
  },
};

export const ecran: Ecran = {
  dit: "La démo, scène 5 : la fiche de #21, servi, ouverte par sa carte dans la colonne Served de « parade » — son histoire et son coût",
  largeur: 1440,
  hauteur: 900,
  etapes: [OUVRIR_PARADE, { cliquer: "#rail .colonne[data-defile] li.bon:first-child" }],
  donnees: () => {
    const carte = carteDe(SERVI, "parade", 21);
    return donneesDe(SERVI, { situation: situationDe(carte), gestesDeFiche: gestesDeCarte(carte), lireHistoire: histoireDe(HISTOIRE), lireDiscussion: discussionDe(ISSUE) });
  },
};
