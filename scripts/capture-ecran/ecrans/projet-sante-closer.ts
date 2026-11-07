// La page de « parade », Kitchen > Health (#2491, épique #2484), haute assez pour montrer le closer sous les temps et les
// plafonds : ses trois dernières passes — une en cours, sa PR à la pass ; une mergée, ses lignes retirées ; une fermée
// sans merge —, ce que la dernière lui a remis, les deux vérifications que le chef lui a demandées en plus, et ses
// réglages, dont le calibrage et le plafond de tokens posés dans le dépôt.
import type { LectureDuCloser } from "../../../app/src/closer-sante.ts";
import type { Ecran } from "./commun.ts";
import { donnees, OUVRIR, SUR_LA_BOX } from "./cuisine-demenagee.ts";
import { KITCHEN, PLAFONDS_LUS } from "./projet-sante.ts";
import { NORMAL } from "./projet-temps-commun.ts";

const DEPOT = "https://github.com/chef/parade";
export const CLOSER_LU: LectureDuCloser = {
  passes: {
    liste: [
      {
        numero: 2531,
        url: `${DEPOT}/issues/2531`,
        ouverteLe: "2026-10-10T08:00:00.000Z",
        ouverte: true,
        sha: "9f3c2a17b4e0d6c5a8b1f2e3d4c5b6a7f8e9d0c1",
        candidats: [
          { id: "D1", quoi: "24 identical lines of code: `app/src/vue/vue.js:1405-1428` = `app/src/vue/fiabilite.js:40-63`" },
          { id: "D2", quoi: "9 identical lines of code: `runtime/src/mesures.ts:88-96` = `runtime/src/derive.ts:120-128`" },
          { id: "M1", quoi: "export `ancienneJauge` of `runtime/src/mesures.ts:212` — referenced only by tests (`runtime/test/mesures.test.ts`)" },
          { id: "M2", quoi: "export `dureeBrute` of `app/src/format.ts:31` — referenced nowhere" },
          { id: "M3", quoi: "export `TITRE_ANCIEN` of `app/src/vue/closer/section.js:12` — referenced nowhere" },
        ],
        restants: 0,
        derive: ["last 20 merges: +3,120 / −840 (3.7:1)", "last 50 merges: +8,410 / −2,950 (2.9:1)", "last 100 merges: +18,340 / −7,336 (2.5:1)"],
        temps: ["Times stable: 12 tickets measured since the last pass, and no drift. No correction ticket is opened or changed."],
        pr: { numero: 2533, url: `${DEPOT}/pull/2533`, mergee: false, retirees: 0, ajoutees: 0 },
      },
      {
        numero: 2477,
        url: `${DEPOT}/issues/2477`,
        ouverteLe: "2026-10-08T07:40:00.000Z",
        ouverte: false,
        sha: "1a2b3c4d5e6f",
        candidats: Array.from({ length: 8 }, (_, i) => ({ id: `M${i + 1}`, quoi: "export" })),
        restants: 0,
        derive: [],
        temps: [],
        pr: { numero: 2480, url: `${DEPOT}/pull/2480`, mergee: true, retirees: 1234, ajoutees: 56 },
      },
      {
        numero: 2410,
        url: `${DEPOT}/issues/2410`,
        ouverteLe: "2026-10-06T09:10:00.000Z",
        ouverte: false,
        sha: "abcdef0",
        candidats: [{ id: "D1", quoi: "duplicate" }, { id: "D2", quoi: "duplicate" }, { id: "M1", quoi: "export" }],
        restants: 0,
        derive: [],
        temps: [],
        pr: { numero: 2412, url: `${DEPOT}/pull/2412`, mergee: false, retirees: 0, ajoutees: 0 },
      },
    ],
  },
  verifications: { liste: ["Unused CSS classes in app/src/vue/vue.css", "Doc sentences that still name a removed function"] },
  reglages: {
    liste: [
      { cle: "calibration", nom: "Calibration", unite: "", defaut: null, surGithub: true, valeur: { model: "sonnet", effort: "medium" } },
      { cle: "cooksBelow", nom: "Start condition", unite: "cooks in flight", defaut: 1, surGithub: false, valeur: null },
      { cle: "maxTokens", nom: "Tokens cap", unite: "tokens", defaut: 500_000, surGithub: false, valeur: 300_000 },
      { cle: "maxRemovedLines", nom: "Removed lines cap", unite: "lines", defaut: 500, surGithub: true, valeur: null },
    ],
  },
};

export const ecran: Ecran = {
  dit: "L'espace de « parade », Kitchen > Health : le closer — ses passes, ce qu'il vérifie en premier et en plus, ses réglages (#2491)",
  largeur: 1440,
  hauteur: 1700,
  etapes: [OUVRIR, KITCHEN],
  donnees: () => donnees({ ...SUR_LA_BOX, temps: { enregistrements: NORMAL, lostTimeMaxMin: 2 } }, { plafondsDuree: PLAFONDS_LUS, closerDeSante: CLOSER_LU }),
};
