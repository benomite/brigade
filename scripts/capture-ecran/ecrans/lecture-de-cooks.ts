// La lecture de l'onglet Cooks de « parade » (#1699) : `station`, `measures` sur la fenêtre que `station` dit, puis
// `closing --json`, mot pour mot comme le runtime les écrit — avec la fiabilité que l'app en lit (fiabilite.ts). Sa
// section de fiabilité et celle de son closer la posent. Ce fichier n'est pas un écran : fiabilite.ts et closer.ts la
// prennent ici.
import type { Lecture } from "../../../app/src/box.ts";
import { voir } from "../../../app/src/fiabilite.ts";
import { type Envoi, MAINTENANT } from "./commun.ts";
import { STATIONS } from "./cout.ts";

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

// L'objet de `closing --json`, sur une ligne (runtime/src/fermeture-lecture/lecture.ts) : les merges depuis le dernier
// nettoyage, le rapport ajouté / retiré, les doublons et les exports morts.
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

// La lecture que l'onglet Cooks de « parade » demande, et ce qu'elle envoie à la vue : ses trois sorties, et la
// fiabilité que l'app en lit. `fermeture` : l'objet que `closing --json` rend.
export const COOKS = "parade/cooks";
export const luDeCooks = (fermeture: unknown = OBSERVEE, mesures = MESURES): Envoi => {
  const lecture: Lecture = {
    projet: "parade",
    demande: 0,
    a: MAINTENANT,
    sorties: [
      { commande: "station", texte: STATIONS.parade ?? "" },
      { commande: "measures --last 10 --by 1", texte: mesures },
      { commande: "closing --json", texte: `${JSON.stringify(fermeture)}\n` },
    ],
  };
  return { sur: "surContenu", args: [lecture, undefined, undefined, voir(lecture)], demande: "onglet" };
};
