// Le rail de « parade » sous la pause du budget GitHub (#4620) : le rail lu avant le redémarrage, gardé sur disque, se dessine avec son âge et l'heure où GitHub reprend.

import { holdFacts } from "../../../app/src/facts.ts";
import { configuration, cuisine, demarrage, type Ecran, type Envoi, MAINTENANT } from "./commun.ts";
import { PROJETS, RENDUS } from "./cuisine-figee.ts";

const IL_Y_A_QUATRE_MINUTES = new Date(Date.parse(MAINTENANT) - 4 * 60_000).toISOString();
const PAUSE = { jusqua: "2026-11-27T16:27:00.000Z", restant: 734, total: 5_000 };

export const ecran: Ecran = {
  dit: "Le rail de « parade » gardé d'avant le redémarrage, montré avec son âge sous la pause du budget GitHub (#4620)",
  largeur: 2200,
  hauteur: 520,
  etapes: [{ cliquer: '#projets > button[title^="parade — "]' }],
  donnees: () => {
    const envois = cuisine(RENDUS);
    const gardee = (liste: Envoi[]) => liste.map((envoi) => (envoi.sur === "surFaits" ? { ...envoi, args: [{ ...(envoi.args[0] as object), a: IL_Y_A_QUATRE_MINUTES, pause: PAUSE }] } : envoi));
    const regarder = Object.fromEntries(Object.entries(envois.regarder).map(([projet, liste]) => [projet, gardee(liste)]));
    return { maintenant: MAINTENANT, reponses: { demarrage: demarrage(configuration(PROJETS)) }, envois: { ...envois, faits: gardee(envois.faits), regarder } };
  },
};
