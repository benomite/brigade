// Le tableau de la cuisine de `parade` (« Kitchen board », #1588), lu de GitHub par l'app sans `ssh` ni tailnet : la
// box l'écrit (runtime/src/tableau/rendu/rendre.ts), l'app le lit (app/src/tableau/lecture.ts) — les deux modules mêmes,
// joués ici devant un GitHub figé. La box l'a écrit 40 s avant MAINTENANT, l'app le lit à MAINTENANT. Les écrans
// `tableau-*` et `telephone-tableau*` en sont tirés.
import { rendreLeTableau } from "../../../runtime/src/tableau/rendu/rendre.ts";
import type { Tableau } from "../../../runtime/src/tableau/rendu/bloc.ts";
import type { ReponseGitHub } from "../../../app/src/tableau/client.ts";
import { lireLeTableauDuDepot, type LectureDuTableauDuDepot } from "../../../app/src/tableau/lecture.ts";
import type { Projet } from "../../../app/src/config.ts";
import type { Terminal } from "../../../app/src/terminaux.ts";
import { configuration, cuisine, demarrage, type Ecran, type Etape, MAINTENANT } from "./commun.ts";
import { PROJETS, RENDUS } from "./cuisine-figee.ts";

const DEPOT = "chef/parade";
const GENERE_LE = new Date(Date.parse(MAINTENANT) - 40_000);

const TABLEAU: Tableau = {
  projet: "parade",
  lu: GENERE_LE.toISOString(),
  file: [
    {
      nom: "#12",
      ticket: 12,
      titre: "Validation SIRET",
      quoi: "merge",
      depuis: "2026-10-13T08:51:00.000Z",
      ligne: "green, waiting for your merge — `brigade parade pass 12`",
      decision: { quoi: "merge", motif: null, cause: null, pr: "https://github.com/chef/parade/pull/40" },
      carte: null,
    },
    {
      nom: "#21",
      ticket: 21,
      titre: "L'export du journal",
      quoi: "carte",
      depuis: "2026-10-13T09:47:00.000Z",
      ligne: "a card awaits your answer: which export format — `brigade parade rail choose 21 <n>`",
      decision: { quoi: "carte", motif: "question", cause: null, pr: null },
      carte: { type: "question", question: "Which export format?", choix: [{ texte: "CSV", suite: "cook it" }, { texte: "JSON", suite: "cook it" }] },
    },
  ],
  bilans: ["without a grant, 1 green delivery stopped at the pass"],
  cuisine: {
    etat: "ouverte",
    runtime: { demarreLe: "2026-10-13T07:00:00.000Z", arreteLe: null, dernierTick: "2026-10-13T10:03:20.000Z" },
    arreteeLe: null,
    disjoncteur: { ouvertLe: null, echecs: 0, seuil: 3 },
    base: { resultat: "green", sha: "abc1234", le: "2026-10-13T09:59:00.000Z", rougeDepuis: null, reparation: null },
    urgence: null,
    cooks: [{ ticket: 14, run: "14-a1", station: "box/claude", modele: "opus", effort: "high", lanceLe: "2026-10-13T09:41:00.000Z", coince: false, tours: 31, tokens: 182_000 }],
    stations: [{ station: "box/claude", distante: false, plafond: 2, satureeDepuis: null, saturation: [], retenueDepuis: null, deconnecteeDepuis: null, quotaJusqua: null }],
    plafonds: { tours: 200, tokens: 2_000_000, dureeMs: 3_600_000, inactiviteMs: 600_000 },
    consommation: { enCours: { runs: 1, reviews: 0, judgments: 0, turns: 31, tokens: 182_000 }, fenetres: [{ heures: 24, runs: 6, reviews: 4, judgments: 1, turns: 410, tokens: 2_300_000 }] },
    rubriques: [
      { titre: "project", lignes: ["parade (chef/parade) · open"] },
      { titre: "runtime", lignes: ["running since 07:00 · last tick 12 s before the board"] },
      { titre: "base", lignes: ["GREEN on abc1234, 4 min ago"] },
      { titre: "cooks", lignes: ["1 running — box/claude: 2 at most", "#14  14-a1  opus / high · 23 min · 31 turns"] },
      { titre: "pass", lignes: ["#30  gates running · 30 s"] },
      { titre: "24 h", lignes: ["6 runs · 4 reviews · 2.3 M tokens"] },
    ],
  },
};

// GitHub figé : la liste des issues au label `kitchen-board` de chef/parade — le tableau —, ou ce qu'il rend d'autre.
const lire = (reponse: ReponseGitHub | Error): Promise<LectureDuTableauDuDepot> =>
  lireLeTableauDuDepot({
    depot: DEPOT,
    appeler: async () => {
      if (reponse instanceof Error) throw reponse;
      return reponse;
    },
    maintenant: () => new Date(MAINTENANT),
  });
const ISSUE = { number: 7, title: "Kitchen board", body: rendreLeTableau(TABLEAU, GENERE_LE), html_url: `https://github.com/${DEPOT}/issues/7`, state: "open", labels: [{ name: "kitchen-board" }] };
export const LU = await lire({ status: 200, data: [ISSUE] });
// GitHub ne répond pas : le réseau de ce poste, ou de ce téléphone, ne le joint pas.
export const INJOIGNABLE = await lire(new Error("getaddrinfo ENOTFOUND api.github.com"));
// Le dépôt est privé, et l'app n'est connectée à aucun compte qui le voit.
export const PRIVE = await lire({ status: 404, data: { message: "Not Found" } });

const SECOND: Terminal = { id: 1, projet: "parade", genre: "second", titre: "second · claude", note: "fil repris : la session d'hier", arrete: false };
export const OUVRIR_PARADE: Etape = { cliquer: '#projets > button[title^="parade"]' };
// « use the direct link », le premier geste sous la phrase d'un tableau qui ne se lit pas.
export const PRENDRE_LE_LIEN_DIRECT: Etape = { cliquer: "#rail > p.gestes .action:first-child > button" };

// L'espace de parade sur le desktop, son tableau lu comme `lu` le dit. `box` : parade a un lien direct — sa box, jointe
// par `ssh`, dont la cuisine figée se lit comme sur les autres écrans ; sans lui, ni box ni station sur ce poste.
export function espaceDuTableau(dit: string, lu: LectureDuTableauDuDepot, { box = true, etapes = [] as Etape[] } = {}): Ecran {
  return {
    dit,
    largeur: 1440,
    hauteur: 900,
    etapes: [OUVRIR_PARADE, ...etapes],
    donnees: () => {
      const projets: Projet[] = box ? PROJETS : [{ nom: "parade", dossier: "/Users/chef/code/parade", depot: DEPOT }];
      const envois = box ? cuisine(RENDUS) : { regarder: {} };
      return {
        maintenant: MAINTENANT,
        reponses: { demarrage: demarrage(configuration(projets, box ? ["box"] : [])), espace: [SECOND], tableauDuProjet: lu },
        envois,
      };
    },
  };
}
