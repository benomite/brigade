// #4044, critère 3 : la carte du ticket tardif dit une ligne « after #A » ; avec plusieurs aînés, une seule ligne les liste.
import assert from "node:assert/strict";
import { test } from "node:test";
import { lignesDeLAttente } from "../../src/attente-du-rail/status.ts";
import { DEPOT } from "../outils.ts";

const MAINTENANT = Date.parse("2026-11-23T10:00:00.000Z");
const FEUX = `/repos/${DEPOT}/issues?state=open&labels=fire&sort=created&direction=asc&per_page=100&page=1`;
const issue = (number: number, labels: string[], body = "") => ({ number, title: `#${number}`, body, created_at: "2026-11-23T09:00:00Z", labels: labels.map((name) => ({ name })) });
const enLigne = async () => ({ lues: [{ name: "box", lastSeen: new Date(MAINTENANT - 30_000).toISOString(), stoppedAt: null, refreshMs: 120_000, selection: [DEPOT] }] });
const lignes = (feux: unknown[]) => lignesDeLAttente({ depot: DEPOT, lire: async (chemin) => (chemin === FEUX ? feux : []), stations: enLigne, maintenant: MAINTENANT });
const carte = (dites: string[], n: number) => dites.filter((l) => l.trimStart().startsWith(`#${n} `));

test("the later card shows one line 'after #A'", async () => {
  const dites = await lignes([issue(3, ["fire", "taken"]), issue(5, ["fire"], "Depends on #3")]);
  assert.equal(carte(dites, 5).length, 1);
  assert.match(carte(dites, 5)[0] ?? "", /after #3\b/);
});

test("with several earlier tickets, one line lists them all", async () => {
  const dites = await lignes([issue(3, ["fire", "taken"]), issue(4, ["fire"]), issue(6, ["fire"], "Depends on #3 and #4")]);
  assert.equal(carte(dites, 6).length, 1);
  assert.match(carte(dites, 6)[0] ?? "", /after #3\b.*#4\b|after #4\b.*#3\b/);
});
