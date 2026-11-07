// Les quatre chiffres du projet (#2672) sur des enregistrements fixes : leurs valeurs, leurs seuils, leur état rouge et ce
// qui pèse le plus — puis la surface de `status`, qui les écrit une ligne chacun.
import assert from "node:assert/strict";
import { test } from "node:test";
import { chiffresDuProjet, direLesChiffres, SANS_DONNEE } from "../src/chiffres-du-projet.ts";
import type { QualiteDuTicket } from "../src/mesure-qualite.ts";
import type { TempsTicket } from "../src/temps-ticket/ligne-status.ts";

const m = (n: number) => n * 60;
// Un ticket qui a perdu `attente` minutes à attendre une prise.
const t = (ticket: number, attente: number): TempsTicket => ({ ticket, mergedAt: `2026-11-0${ticket}T10:00:00Z`, attentePrise: m(attente), cuisson: m(5), cuissonTests: 0, attentePasse: 0, revue: 0, ci: 0, merge: 0 });
const ENREGISTREMENTS = [t(1, 1), t(2, 3), t(3, 4), t(4, 9)];
const RATIOS = [
  { ticket: 1, attendu: 10, reel: 10 },
  { ticket: 2, attendu: 10, reel: 20 },
  { ticket: 3, attendu: 10, reel: 30 },
];
const propre: QualiteDuTicket = { renvois: [], cooksRates: 0 };
// 1 ticket du premier coup sur 4, deux renvois « tests », une réparation de la base sur 4 merges.
const QUALITES = new Map<number, QualiteDuTicket>([
  [1, propre],
  [2, { renvois: ["tests failed"], cooksRates: 0 }],
  [3, { renvois: ["tests failed", "review"], cooksRates: 0 }],
  [4, { renvois: [], cooksRates: 1, reparation: ["typecheck"] }],
]);

test("four figures over their thresholds: value, threshold, red, and what weighs most", () => {
  const [perdu, estimation, premierCoup, reparations] = chiffresDuProjet({ enregistrements: ENREGISTREMENTS, qualites: QUALITES, ratios: RATIOS, projet: null });
  assert.deepEqual(perdu, { cle: "perdu", nom: "lost time", valeur: "3.5 min median, 9 min p75", seuil: "2 min", depasse: true, pesent: ["#4 lost 9 min", "#3 lost 4 min", "#2 lost 3 min", "#1 lost 1 min"] });
  assert.deepEqual(estimation, { cle: "estimation", nom: "vs estimate", valeur: "×2.00 median", seuil: "×1.50", depasse: true, pesent: ["#3 ×3.00 (30 min against 10)", "#2 ×2.00 (20 min against 10)", "#1 ×1.00 (10 min against 10)"] });
  assert.deepEqual(premierCoup, { cle: "premier-coup", nom: "first try", valeur: "25%", seuil: "70%", depasse: true, pesent: ["tests failed (2)", "review (1)"] });
  assert.deepEqual(reparations, { cle: "reparations", nom: "main repairs", valeur: "0.250 per merge", seuil: "0.1 per merge", depasse: true, pesent: ["typecheck (1)"] });
});

test("thresholds come from projet.json, and a figure within its threshold is not red", () => {
  const projet = { lostTimeMaxMin: 10, cookingOverEstimateMax: 3, premierCoupMinPourcent: 20 };
  const [perdu, estimation, premierCoup, reparations] = chiffresDuProjet({ enregistrements: ENREGISTREMENTS, qualites: QUALITES, ratios: RATIOS, projet });
  assert.deepEqual([perdu?.seuil, estimation?.seuil, premierCoup?.seuil, reparations?.seuil], ["10 min", "×3.00", "20%", "0.1 per merge"]);
  assert.deepEqual([perdu?.depasse, estimation?.depasse, premierCoup?.depasse, reparations?.depasse], [false, false, false, true]);
});

test("nothing measured: every figure says so, none is red", () => {
  const chiffres = chiffresDuProjet({ enregistrements: [], qualites: new Map(), ratios: [], projet: null });
  assert.deepEqual(chiffres.map((c) => [c.valeur, c.depasse, c.pesent]), Array(4).fill([SANS_DONNEE, false, []]));
});

test("status: one line per figure, value then threshold, red only when over", () => {
  const chiffres = chiffresDuProjet({ enregistrements: ENREGISTREMENTS, qualites: QUALITES, ratios: RATIOS, projet: { premierCoupMinPourcent: 20 } });
  assert.deepEqual(direLesChiffres(chiffres), [
    "lost time    3.5 min median, 9 min p75 / 2 min",
    "vs estimate  ×2.00 median / ×1.50",
    "first try    25% / 20%",
    "main repairs 0.250 per merge / 0.1 per merge",
  ]);
  assert.deepEqual(
    direLesChiffres(chiffres, true).map((ligne) => ligne.startsWith("\u001b[31m")),
    [true, true, false, true],
  );
});
