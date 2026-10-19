// Le motif d'un ticket au-delà du seuil de coût de la dérive : une ligne, au
// même endroit que le dépassement. Le seuil est celui du chef, déclaré une fois.
import assert from "node:assert/strict";
import { test } from "node:test";
import { SANS_SEUIL, decrireReleve, jauger } from "../src/mesures.ts";
import type { CookMesure, Livraison } from "../src/projections/measures.ts";
import { JOUR_HORLOGE } from "./outils.ts";

const cook = (tokens: number, delivered: boolean, resumed = false): CookMesure => ({ calibration: "sonnet/medium", turns: 5, durationMs: 1000, tokens, delivered, ...(resumed ? { resumed: true as const } : {}) });
const livraison = (ticket: number, cooks: CookMesure[]): Livraison => ({ ticket, at: `${JOUR_HORLOGE}T10:00:00.000Z`, measures: {}, state: {}, gatesS: null, cooks });
const seuils = { ...SANS_SEUIL, ticketTokens: 400_000 };
const motifs = (livraisons: Livraison[]) => decrireReleve({ projet: "brigade", livraisons, seuils }).filter((ligne) => ligne.includes("reason for the drift"));

test("un dépassement avec renvoi dit les passages, la part perdue et les renvois repartis de zéro", () => {
  const lignes = motifs([livraison(12, [cook(300_000, false), cook(150_000, false), cook(50_000, true)])]);

  assert.equal(lignes.length, 1);
  assert.match(lignes[0] ?? "", /#12: 3 passes, 90% lost on retries, 2 retries restarted from scratch$/);
});

test("un renvoi qui a repris la session est dit repris", () => {
  const [ligne] = motifs([livraison(5, [cook(300_000, false), cook(200_000, true, true)])]);

  assert.match(ligne ?? "", /#5: 2 passes, 60% lost on retries, retries resumed$/);
});

test("un dépassement en un seul passage le dit sans parler de renvoi perdu", () => {
  const [ligne] = motifs([livraison(8, [cook(450_000, true)])]);

  assert.match(ligne ?? "", /#8: 1 pass, 450,000 tokens in one go, no retry/);
});

test("sous le seuil, ou sans seuil déclaré, aucun motif", () => {
  assert.deepEqual(motifs([livraison(1, [cook(399_999, true)]), livraison(2, [cook(100, false), cook(100, true)])]), []);
  assert.deepEqual(decrireReleve({ projet: "brigade", livraisons: [livraison(1, [cook(900_000, true)])], seuils: null }).filter((ligne) => ligne.includes("reason")), []);
});

test("seuls les tickets au-delà du seuil portent un motif, et la jauge le garde", () => {
  const jauges = jauger([livraison(1, [cook(500_000, true)]), livraison(2, [cook(10, true)])], seuils);

  assert.equal(jauges.find(({ measure }) => measure === "tokens_ticket")?.motifs?.length, 1);
});
