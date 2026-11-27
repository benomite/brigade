// Le rail de « parade » quand un ticket a été tué deux fois par le même garde-fou (#3650) : la carte de #14 dit « Stopped 2
// times by the idle guard » sous sa tête, et ses deux arrêts — l'heure, l'activité où le cook en était, son run — dessous. Ce
// que la box rend : `gardeRepetee` du ticket (runtime/src/gardes-historique/). Les autres cartes n'en portent pas.
import type { Facts } from "../../../app/src/facts.ts";
import { configuration, cuisine, demarrage, type Ecran, MAINTENANT, type Rendu } from "./commun.ts";
import { PROJETS, RENDUS } from "./cuisine-figee.ts";

const PARADE = RENDUS.parade as Rendu;

const GARDE = {
  guard: "idle",
  kills: [
    { run: "14-3f9a1c2e", at: "2026-10-13T07:12:40.000Z", activity: "finishing" },
    { run: "14-b84d70e5", at: "2026-10-13T08:41:03.000Z", activity: "finishing" },
  ],
};

const FACTS = {
  ...PARADE.facts,
  rail: PARADE.facts.rail.map((ligne) => (ligne.ticket === 14 ? { ...ligne, gardeRepetee: GARDE } : ligne)),
} as Facts;

const donnees: Ecran["donnees"] = () => ({
  maintenant: MAINTENANT,
  reponses: { demarrage: demarrage(configuration(PROJETS)), espace: [] },
  envois: cuisine({ ...RENDUS, parade: { ...PARADE, facts: FACTS } }),
});

export const ecran: Ecran = {
  dit: "Le rail de « parade » : la carte de #14, tuée deux fois par le garde-fou d'inactivité, le dit — « Stopped 2 times by the idle guard » — et chaque arrêt dessous : l'heure, l'activité (`finishing`), le run (#3650)",
  largeur: 1440,
  hauteur: 900,
  etapes: [{ cliquer: '#projets > button[title^="parade — "]' }],
  donnees,
};
