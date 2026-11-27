// Le rail de « parade » sous la pause du budget GitHub (#4620) : aucun rail lu, le quota retient la lecture : la page le dit, avec l'heure de reprise, jamais « no station is known ».

import { holdFacts } from "../../../app/src/facts.ts";
import { configuration, cuisine, demarrage, type Ecran, type Envoi, MAINTENANT } from "./commun.ts";
import { PROJETS, RENDUS } from "./cuisine-figee.ts";

const IL_Y_A_QUATRE_MINUTES = new Date(Date.parse(MAINTENANT) - 4 * 60_000).toISOString();
const PAUSE = { jusqua: "2026-11-27T16:27:00.000Z", restant: 734, total: 5_000 };

export const ecran: Ecran = {
  dit: "Le rail de « parade » sans rail lu, sous la pause du budget GitHub (#4620)",
  largeur: 2200,
  hauteur: 520,
  etapes: [{ cliquer: '#projets > button[title^="parade — "]' }],
  donnees: () => {
    const envois = cuisine(RENDUS);
    const retenue: Envoi = { sur: "surFaits", args: [holdFacts().recevoir({ projet: "parade", demande: 0, a: MAINTENANT, erreur: "The rail of chef/parade is not read until 16:27 UTC", atteinte: true, cas: null, duTableau: true, pause: PAUSE } as never)], demande: "faits" };
    const sans = (liste: Envoi[]) => liste.filter((envoi) => envoi.sur !== "surFaits");
    const regarder = Object.fromEntries(Object.entries(envois.regarder).map(([projet, liste]) => [projet, projet === "parade" ? [...sans(liste), retenue] : liste]));
    return { maintenant: MAINTENANT, reponses: { demarrage: demarrage(configuration(PROJETS)) }, envois: { ...envois, faits: [retenue], tous: sans(envois.tous), regarder } };
  },
};
