// Les décisions que le runtime réclame : sans calibrage il refuse de démarrer,
// sans station il démarre et aucun cook ne part.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { DECISIONS, OBLIGATOIRES, type Decision } from "../src/decisions.ts";
import { lireSeuils } from "../src/derive.ts";
import { configManager } from "../src/manager.ts";
import { GESTES } from "../src/montrer-station.ts";
import { configReviewer } from "../src/reviewer.ts";
import { EXEMPLE, lireStations } from "../src/stations-declarees.ts";

const LIVREES = join(import.meta.dirname, "../deploy/decisions-obligatoires");

// Une valeur que le runtime lit, pour chaque décision.
const TOUTES: Record<Decision, string> = {
  BRIGADE_STATIONS: "box/claude:1:code",
  BRIGADE_DRIFT_TICKET_TOKENS: "500000",
  BRIGADE_DRIFT_LOST_TOKENS: "200000",
  BRIGADE_MANAGER_MODEL: "sonnet",
  BRIGADE_MANAGER_EFFORT: "medium",
  BRIGADE_REVIEWER_MODEL: "haiku",
  BRIGADE_REVIEWER_EFFORT: "medium",
  BRIGADE_CLOSING_MODEL: "sonnet",
  BRIGADE_CLOSING_EFFORT: "medium",
  BRIGADE_CLOSING_COOKS: "1",
  BRIGADE_CLOSING_MAX_TOKENS: "500000",
  BRIGADE_CLOSING_MAX_REMOVED_LINES: "500",
};

// Ce que le runtime lit des décisions au démarrage.
function lire(env: Record<string, string | undefined>) {
  return { stations: lireStations(env), seuils: lireSeuils(env), manager: configManager(env), reviewer: configReviewer(env) };
}

test("sans une décision obligatoire de calibrage, le runtime refuse de démarrer ; sans une autre que les stations, il démarre", () => {
  assert.doesNotThrow(() => lire(TOUTES));
  for (const decision of DECISIONS) {
    if (decision === "BRIGADE_STATIONS") continue;
    const { [decision]: _retiree, ...sans } = TOUTES;
    if (OBLIGATOIRES.includes(decision)) assert.throws(() => lire(sans), new RegExp(decision), decision);
    else assert.doesNotThrow(() => lire(sans), decision);
  }
});

test("les stations sont obligatoires sans que leur absence arrête le runtime : sans elles, aucun cook ne part", () => {
  assert.ok(OBLIGATOIRES.includes("BRIGADE_STATIONS"));
  const { BRIGADE_STATIONS: _retiree, ...sans } = TOUTES;
  assert.deepEqual(lire(sans).stations, []);
});
