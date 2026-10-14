// Les décisions que la version réclame : la bascule les lit dans
// `deploy/decisions-obligatoires`, sans lancer le code qu'elle pose. Ce fichier
// doit dire ce que le runtime réclame vraiment — ni plus, ni moins —, et
// nommer le geste qui pose chacune.
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
};

// Ce que le runtime lit des décisions au démarrage.
function lire(env: Record<string, string | undefined>) {
  return { stations: lireStations(env), seuils: lireSeuils(env), manager: configManager(env), reviewer: configReviewer(env) };
}

test("le fichier que la version livre dit, dans l'ordre, chaque décision obligatoire, le geste de `station` qui la pose et ce qu'il attend", () => {
  const lignes = readFileSync(LIVREES, "utf8")
    .split("\n")
    .filter((ligne) => ligne !== "" && !ligne.startsWith("#"));

  assert.deepEqual(
    lignes,
    OBLIGATOIRES.map((decision) => {
      const [geste, { valeur }] = Object.entries(GESTES).find(([, pose]) => pose.decision === decision) ?? assert.fail(`aucun geste ne pose ${decision}`);
      // Les stations : l'exemple que le runtime donne lui-même ; le reste n'a pas de valeur à proposer.
      return `${decision} ${geste} ${decision === "BRIGADE_STATIONS" ? EXEMPLE.split(",")[0] : valeur}`;
    }),
  );
  // Ce que la bascule découpe : trois champs, le dernier sans espace.
  for (const ligne of lignes) assert.equal(ligne.split(" ").length, 3, ligne);
});

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
