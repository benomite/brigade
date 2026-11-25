// L'espace de « parade » au premier matin du jour (ticket 4274) : la carte du digest de la veille en tête du rail, et sous
// ses colonnes le journal du jour, tiré des fils de ses agents — livré, cassé, réparé seul, non réparé avec ses erreurs.
import type { Faits } from "../../../app/src/faits.ts";
import type { Terminal } from "../../../app/src/terminaux.ts";
import { configuration, cuisine, demarrage, type Ecran, MAINTENANT, type Rendu } from "./commun.ts";
import { PROJETS, RENDUS } from "./cuisine-figee.ts";

const PARADE = RENDUS.parade as Rendu;
const SECOND: Terminal = { id: 1, projet: "parade", genre: "second", titre: "second · claude", note: "session neuve", arrete: false };
const geste = (at: string, line: string, reason: string, kind: string, outcome: string) => ({ at: `2026-10-13T${at}:00.000Z`, line, reason, outcome, kind });
const FILS = {
  cook: [geste("08:12", "merged #4001 — the rail reads its threads", "its pass was green", "delivered", "merged")],
  supervisor: [
    geste("08:40", "main went red on 0de1ff5", "the tests job failed twice", "broke", "not done"),
    geste("08:51", "reran tests on 0de1ff5", "red for 10 min, a flaky test", "fixed", "green"),
    geste("09:30", "zone cycle between #3979 and #3932", "two tickets hold each other's zone", "unfixed", "handed to the chef"),
    geste("09:45", "released #3911 by mistake", "it read an old label", "mistake", "put back on the rail"),
  ],
};
const DIGEST = ["1 outage seen first by the chef", "3 tickets delivered", "main was red for 45 min, fixed by itself"].join("\n");

export const ecran: Ecran = {
  dit: "L'espace de « parade » au premier matin : la carte du digest de la veille en tête, le journal du jour sous le rail",
  largeur: 1440,
  hauteur: 1400,
  etapes: [{ cliquer: '#projets > button[title^="parade — "]' }],
  donnees: () => ({
    maintenant: MAINTENANT,
    reponses: { demarrage: demarrage(configuration(PROJETS)), espace: [SECOND] },
    envois: cuisine({ ...RENDUS, parade: { ...PARADE, facts: { ...PARADE.facts, fils: FILS, digest: DIGEST } as unknown as Faits } }),
  }),
};
