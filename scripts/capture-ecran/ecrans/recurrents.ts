// Les tickets récurrents de « parade » sous Settings (#3231, épique #3216) : ce que `recurring` rend de sa cuisine
// (runtime/src/recurrents/commande.ts, #3230) — une rangée par ticket récurrent, son titre, son rythme en mots et la date
// de sa prochaine occurrence ; le ticket suspendu dit « paused », sans date, et offre « resume ».
import { configuration, cuisine, demarrage, type Ecran, MAINTENANT } from "./commun.ts";
import { PROJETS, RENDUS } from "./cuisine-figee.ts";
import { LUS, OUVRIR } from "./reglages-du-projet.ts";
import { HUMAINS } from "./settings-humains.ts";

// Ce que `recurring` rend de la cuisine de parade, le 13 octobre 2026 (`MAINTENANT`, un mardi).
export const RECURRENTS = [
  { id: "a1b2c3d4", title: "Check the error dashboard", body: "", rhythm: { kind: "daily" }, paused: false, nextDate: "2026-10-13" },
  { id: "b2c3d4e5", title: "Update the dependencies", body: "", rhythm: { kind: "weekly", weekday: 1 }, paused: false, nextDate: "2026-10-19" },
  { id: "c3d4e5f6", title: "Write the monthly cost report", body: "", rhythm: { kind: "monthly", dayOfMonth: 15 }, paused: false, nextDate: "2026-10-15" },
  { id: "d4e5f6a7", title: "Rotate the deploy keys", body: "", rhythm: { kind: "monthly", dayOfMonth: 1 }, paused: true, nextDate: "2026-11-01" },
];
export const HAUTEUR = 1500;

export const ecran: Ecran = {
  dit: "Les tickets récurrents de « parade » sous Settings : une rangée chacun — son titre, son rythme en mots (« every day », « every week on Monday », « every month on the 15th »), sa prochaine date, « pause » et « remove » ; « Rotate the deploy keys » suspendu dit « paused », sans date, et offre « resume »",
  largeur: 1440,
  hauteur: HAUTEUR,
  etapes: OUVRIR,
  donnees: () => ({
    maintenant: MAINTENANT,
    reponses: { demarrage: demarrage(configuration(PROJETS)), espace: [], reglagesDuProjet: LUS, listerLesHumains: HUMAINS, listerLesRecurrents: RECURRENTS },
    envois: cuisine(RENDUS),
  }),
};
