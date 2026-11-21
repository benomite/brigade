// #3983, critère 2 : le taux du premier coup et le temps perdu restent calculés, des mêmes données qu'aujourd'hui.
import assert from "node:assert/strict";
import { test } from "node:test";
import { mesurerRenvois, type Parcours } from "../../src/renvois.ts";
import { tempsPerdu } from "../../src/temps-max/mesure.ts";

const a = (heure: string) => `2026-11-20T${heure}:00:00.000Z`;
const merge = (ticket: number, rouges: number): Parcours => ({
  ticket,
  takenAt: a("10"),
  end: { kind: "merged", at: a("12") },
  attempts: Array.from({ length: rouges + 1 }, (_, i) => ({ run: `run-${ticket}-${i}`, at: a("10"), outcome: "ok", verdict: i === rouges ? ("green" as const) : ("red" as const) })),
});

// brigade:guard
test("the first-try rate and the lost time are computed from the same data", () => {
  const renvois = mesurerRenvois([merge(1, 0), merge(2, 0), merge(3, 1), merge(4, 2)], 10);
  assert.equal(renvois.premierCoup, 1 / 2);
  assert.equal(renvois.essaisMoyens, 7 / 4);

  const ticket = { perdu: { attente: 30, ratees: 20, renvois: 10 }, attenteQualification: 5 } as Parameters<typeof tempsPerdu>[0];
  assert.equal(tempsPerdu(ticket), 60);
});
