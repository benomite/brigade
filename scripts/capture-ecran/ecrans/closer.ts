// Settings → Closer de « parade » (#990) : ce que la dernière observation du closer a repéré, lu dans
// l'objet que `closing --json` écrit sur une ligne (runtime/src/fermeture-lecture/lecture.ts) — les
// merges depuis le dernier nettoyage, le rapport ajouté / retiré, les doublons et les exports morts.
import type { Lecture } from "../../../app/src/box.ts";
import { configuration, cuisine, demarrage, type Ecran, type Envoi, MAINTENANT } from "./commun.ts";
import { PROJETS, RENDUS } from "./cuisine-figee.ts";

const doublon = (rang: number, file: string, start: number, lines: number, copie: string, debut: number) => ({
  id: `D${rang}`,
  kind: "duplicate",
  file,
  start,
  end: start + lines - 1,
  lines,
  copy: { file: copie, start: debut, end: debut + lines - 1 },
});
const mort = (rang: number, file: string, line: number, name: string, onlyTests: string[] = []) => ({ id: `M${rang}`, kind: "dead-export", file, start: line, end: line, name, onlyTests });

export const OBSERVEE = {
  configured: true,
  closer: { model: "sonnet", effort: "medium", cooksBelow: 1, tokens: 500_000, removedLines: 500 },
  observation: {
    readable: true,
    ref: "origin/v2",
    sha: "48638df",
    lastMerge: "2026-10-13T09:40:00.000Z",
    mergesSinceCleanup: 261,
    ratio: [
      { window: 20, merges: 20, added: 4_210, removed: 980, ratio: 4.3, reads: "4.3:1" },
      { window: 50, merges: 50, added: 9_800, removed: 3_100, ratio: 3.16, reads: "3.2:1" },
      { window: 100, merges: 100, added: 18_340, removed: 7_336, ratio: 2.5, reads: "2.5:1" },
    ],
    duplicates: 5,
    deadExports: 3,
    codeFiles: 412,
    modules: 380,
    skippedFiles: 3,
  },
  findings: [
    doublon(1, "app/src/vue/vue.js", 1405, 24, "app/src/vue/fiabilite.js", 40),
    doublon(2, "runtime/src/rail.ts", 88, 17, "runtime/src/pass/merge.ts", 212),
    doublon(3, "app/src/fiabilite.ts", 60, 12, "app/src/vue/cost/perdus.js", 31),
    doublon(4, "runtime/src/montrer-station.ts", 301, 9, "runtime/src/montrer-mesures.ts", 144),
    doublon(5, "app/src/main.ts", 512, 8, "app/src/main.ts", 640),
    mort(1, "runtime/src/mesures.ts", 212, "ancienneJauge", ["runtime/test/mesures.test.ts"]),
    mort(2, "app/src/format.ts", 48, "heureCourte"),
    mort(3, "runtime/src/closing/say.ts", 91, "direAncien"),
  ],
  request: { state: "none" },
  drift: { declared: false, crossed: false, crossings: [] },
};

// Ce que la lecture de l'onglet envoie à la vue : la sortie de `closing --json`, mot pour mot.
export const lu = (objet: unknown): Envoi => {
  const lecture: Lecture = { projet: "parade", demande: 0, a: MAINTENANT, sorties: [{ commande: "closing --json", texte: `${JSON.stringify(objet)}\n` }] };
  return { sur: "surContenu", args: [lecture, undefined, undefined], demande: "onglet" };
};

export const ecran: Ecran = {
  dit: "Settings → Closer de « parade » : les quatre chiffres de la dernière observation du closer, la liste repliée",
  largeur: 1440,
  hauteur: 900,
  etapes: [{ cliquer: '#projets > button[title^="parade — "]' }, { cliquer: "#onglets > button:first-child" }, { cliquer: "#parametres-onglets > button:nth-child(6)" }],
  donnees: () => ({
    maintenant: MAINTENANT,
    reponses: { demarrage: demarrage(configuration(PROJETS)), espace: [] },
    envois: { ...cuisine(RENDUS), onglet: { "parade/closer": [lu(OBSERVEE)] } },
  }),
};
