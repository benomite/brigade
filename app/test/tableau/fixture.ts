// Un tableau de la cuisine d'exemple, et le corps d'issue que la box en écrit — rendu par le runtime lui-même
// (runtime/src/tableau/rendu/rendre.ts) : ce que les apps lisent est ce que la box publie.
import { rendreLeTableau } from "../../../runtime/src/tableau/rendu/rendre.ts";
import type { Tableau } from "../../../runtime/src/tableau/rendu/bloc.ts";

export const GENERE_LE = new Date("2026-10-23T10:04:30.000Z");

export const TABLEAU: Tableau = {
  projet: "parade",
  lu: "2026-10-23T10:04:30.000Z",
  file: [
    {
      nom: "#18",
      ticket: 18,
      titre: "Show the queue on the phone",
      quoi: "merge",
      depuis: "2026-10-23T08:00:00.000Z",
      ligne: "green, waiting for your merge — `brigade parade pass 18`",
      decision: { quoi: "merge", motif: null, cause: null, pr: "https://github.com/chef/parade/pull/40" },
      carte: null,
    },
    {
      nom: "#21",
      ticket: 21,
      titre: "Pick a colour for <the> board",
      quoi: "carte",
      depuis: "2026-10-23T09:30:00.000Z",
      ligne: "a card awaits your answer — `brigade parade rail choose 21 <n>`",
      decision: { quoi: "carte", motif: "question", cause: null, pr: null },
      carte: { type: "question", question: "Which colour, @chef?", choix: [{ texte: "Green", suite: "cook it" }, { texte: "Blue", suite: "set it aside" }] },
    },
  ],
  bilans: ["without a grant, 1 green delivery stopped at the pass"],
  cuisine: {
    etat: "ouverte",
    runtime: { demarreLe: "2026-10-23T07:00:00.000Z", arreteLe: null, dernierTick: "2026-10-23T10:04:00.000Z" },
    arreteeLe: null,
    disjoncteur: { ouvertLe: null, echecs: 0, seuil: 3 },
    base: { resultat: "green", sha: "abc1234", le: "2026-10-23T10:00:00.000Z", rougeDepuis: null, reparation: null },
    urgence: null,
    cooks: [{ ticket: 31, run: "31-aa", station: "box/claude", modele: "opus", effort: "high", lanceLe: "2026-10-23T09:50:00.000Z", coince: false, tours: 12, tokens: 40_000 }],
    stations: [{ station: "box/claude", distante: false, plafond: 2, satureeDepuis: null, saturation: [], retenueDepuis: null, deconnecteeDepuis: null, quotaJusqua: null }],
    plafonds: { tours: 200, tokens: 2_000_000, dureeMs: 3_600_000, inactiviteMs: 600_000 },
    consommation: { enCours: { runs: 1, reviews: 0, judgments: 0, turns: 12, tokens: 40_000 }, fenetres: [{ heures: 24, runs: 4, reviews: 2, judgments: 1, turns: 80, tokens: 300_000 }] },
    rubriques: [
      { titre: "project", lignes: ["parade (chef/parade) · open"] },
      { titre: "base", lignes: ["GREEN on abc1234, 4 min ago"] },
      { titre: "cooks", lignes: ["1 running — box/claude: 2 at most", "#31  31-aa  opus / high"] },
    ],
  },
};

export const CORPS = rendreLeTableau(TABLEAU, GENERE_LE);

// L'issue du tableau telle que l'API de GitHub la liste.
export const ISSUE = { number: 7, title: "Kitchen board", body: CORPS, html_url: "https://github.com/chef/parade/issues/7", state: "open", labels: [{ name: "kitchen-board" }, { name: "hors-cuisine" }] };
