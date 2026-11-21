// #3786 : seules les activités de revue disent l'étape « review » ; une autre activité n'en prend pas.
import assert from "node:assert/strict";
import { test } from "node:test";
import { avecEtape } from "../../src/activite/etape-de-pass.ts";

const activite = (faitEn: string) => ({ fait: "fr", faitEn, cible: null, depuis: "2026-11-19T12:00:00.000Z" });
const ROUGE = { outcome: "red" as const, at: "2026-11-19T12:05:00.000Z", redSince: null };

test("la revue en cours garde son étape sous une base rouge, une revue échouée ou une autre activité attend main", () => {
  assert.equal(avecEtape(activite("review running since 12:00"), { phase: "judging", reason: null }, ROUGE)?.etape, "review");
  assert.equal(avecEtape(activite("judging"), { phase: "judging", reason: null }, ROUGE)?.etape, "waiting for main");
});
