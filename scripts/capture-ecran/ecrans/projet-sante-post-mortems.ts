// La page de « parade », Settings et sa section « Caps, closer and all projects » (#4023), haute assez pour montrer les
// post-mortems de panne que la box donne : trois, dont deux vus d'abord par le chef — l'un dans la semaine, l'autre il y a
// plus de 7 jours —, le plus récent d'abord, et le compte des pannes vues d'abord par le chef sur les 7 derniers jours.
import type { Ecran } from "./commun.ts";
import { cuisine } from "./commun.ts";
import { RENDUS } from "./cuisine-figee.ts";
import { donnees, OUVRIR, SUR_LA_BOX } from "./cuisine-demenagee.ts";
import { PLAFONDS_LUS, SECTION, SETTINGS } from "./projet-sante.ts";
import { NORMAL } from "./projet-temps-commun.ts";

const POST_MORTEMS = [
  { cause: "main was red", duree: "52 min", vuEnPremier: "chef", corrige: "reran the failed jobs", ticket: "#4101", fin: "2026-10-13T09:40:00.000Z" },
  { cause: "main was red", duree: "34 min", vuEnPremier: "system", corrige: null, ticket: null, fin: "2026-10-11T16:05:00.000Z" },
  { cause: "main was red", duree: "1 h 10 min", vuEnPremier: "chef", corrige: "reverted the merge", ticket: "#4066", fin: "2026-10-02T08:00:00.000Z" },
];

export const ecran: Ecran = {
  dit: "L'espace de « parade », Settings et sa section de santé, avec les post-mortems de panne et le compte des pannes vues d'abord par le chef (#4023)",
  largeur: 1440,
  hauteur: 1300,
  etapes: [OUVRIR, SETTINGS, SECTION],
  donnees: () => {
    const base = donnees({ ...SUR_LA_BOX, temps: { enregistrements: NORMAL, lostTimeMaxMin: 2 } }, { plafondsDuree: PLAFONDS_LUS });
    const envois = cuisine({ ...RENDUS, parade: { ...RENDUS.parade!, facts: { ...RENDUS.parade!.facts, postMortems: POST_MORTEMS } } });
    return { ...base, envois: { ...envois, regarder: { ...envois.regarder, parade: [...(envois.regarder.parade ?? []), ...(base.envois.regarder?.parade?.slice(-1) ?? [])] } } };
  },
};
