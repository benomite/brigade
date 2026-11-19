// #3763, critère 1 : une attente déduite du corps se montre avec son origine, et la phrase d'où elle est lue.
import assert from "node:assert/strict";
import { test } from "node:test";
import { lignesDeLAttente } from "../../src/attente-du-rail/status.ts";
import { DEPOT } from "../outils.ts";

const FEUX = `/repos/${DEPOT}/issues?state=open&labels=fire&sort=created&direction=asc&per_page=100&page=1`;
const issue = (number: number, labels: string[], body = "") => ({ number, title: `#${number}`, body, created_at: "2026-11-17T09:00:00Z", labels: labels.map((name) => ({ name })) });

test("la carte d'un ticket retenu par une phrase de son corps dit l'attente, son origine et la phrase", async () => {
  const lire = async (chemin: string) => {
    if (chemin === FEUX) return [issue(4, ["fire", "taken"]), issue(5, ["fire"], "Restyle the screen.\nDepends on #4")];
    return chemin.includes("/events?") || chemin.includes("/comments") ? [] : assert.fail(`not dictated: ${chemin}`);
  };
  const lignes = await lignesDeLAttente({ depot: DEPOT, lire, stations: async () => ({ lues: [] }), maintenant: Date.parse("2026-11-17T10:00:00.000Z") });
  const ligne = lignes.find((l) => l.trimStart().startsWith("#5 ")) ?? "";
  assert.match(ligne, /waits for #4 — read from the body: 'Depends on #4/);
});
