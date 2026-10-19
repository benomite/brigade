// Settings → Reliability de « parade » (#987) : la fiabilité de ses cooks — trois chiffres face à leurs
// seuils, les causes d'échec qui reviennent le plus —, et ce que le projet a coûté (#1022). Aucune
// correction de ses consignes n'a été acceptée : `facts` ne porte pas `reculs`, et la page n'en dit rien
// (#1001). La lecture de l'onglet est `station` puis `measures`, mot pour mot comme le runtime les écrit.
import type { Lecture } from "../../../app/src/box.ts";
import { voir } from "../../../app/src/fiabilite.ts";
import { configuration, cuisine, demarrage, type Ecran, type Envoi, MAINTENANT } from "./commun.ts";
import { STATIONS } from "./cout.ts";
import { PROJETS, RENDUS } from "./cuisine-figee.ts";

// `measures --last 10 --by 1`, tel que runtime/src/montrer-mesures.ts l'écrit, réduit aux blocs que la page lit.
export const MESURES = [
  "report     parade — 10 merges in the log, in slices of 1",
  "",
  "launches   tickets launched more than once, or with a launch that delivered nothing — useful: the tokens of the launches that delivered; lost: those of the others",
  "merges  ticket  launches  tokens   useful   lost",
  "2       #22     2         400,000  220,000  180,000 (45%)",
  "4       #29     2         400,000  220,000  180,000 (45%)",
  "7       #33     2         400,000  220,000  180,000 (45%)",
  "",
  "retries    the last 10 served tickets (N = 10): 10 in the log, 10 kept, 0 set aside — not merged (running, dropped, or served without a diff): left out of the count",
  "           delivered on the first try: 70% (7 of 10)",
  "           attempts per ticket: 1.3 on average",
  "",
  "failures   3 failed attempts (not ending in a merge), each under one cause",
  "           blocking review: 2 (67%) — #33, #22",
  "           red gates: app tests: 1 (33%) — #29",
  "           conflict with the base: 0 (0%)",
  "",
].join("\n");

// Ce que la lecture de l'onglet envoie à la vue : `station`, `measures`, et la fiabilité que l'app en lit.
export const lu = (): Envoi => {
  const lecture: Lecture = {
    projet: "parade",
    demande: 0,
    a: MAINTENANT,
    sorties: [
      { commande: "station", texte: STATIONS.parade ?? "" },
      { commande: "measures --last 10 --by 1", texte: MESURES },
    ],
  };
  return { sur: "surContenu", args: [lecture, undefined, undefined, voir(lecture)], demande: "onglet" };
};

export const ecran: Ecran = {
  dit: "Settings → Reliability de « parade » : la fiabilité de ses cooks et ce qu'il a coûté, sans correction acceptée de ses consignes",
  largeur: 1440,
  hauteur: 1400,
  etapes: [{ cliquer: '#projets > button[title^="parade — "]' }, { cliquer: "#onglets > button:first-child" }, { cliquer: "#parametres-onglets > button:nth-child(6)" }],
  donnees: () => ({
    maintenant: MAINTENANT,
    reponses: { demarrage: demarrage(configuration(PROJETS)), espace: [] },
    envois: { ...cuisine(RENDUS), onglet: { "parade/fiabilite": [lu()] } },
  }),
};
