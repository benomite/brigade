// #4044, critère 4 : le ticket retenu pour un autre se dit en attente de ce merge, pas oisif.
import assert from "node:assert/strict";
import { test } from "node:test";
import { lignesDeLAttente } from "../../src/attente-du-rail/status.ts";
import { DEPOT } from "../outils.ts";

const MAINTENANT = Date.parse("2026-11-23T10:00:00.000Z");
const FEUX = `/repos/${DEPOT}/issues?state=open&labels=fire&sort=created&direction=asc&per_page=100&page=1`;
const issue = (number: number, labels: string[], body = "") => ({ number, title: `#${number}`, body, created_at: "2026-11-23T09:00:00Z", labels: labels.map((name) => ({ name })) });
const enLigne = async () => ({ lues: [{ name: "box", lastSeen: new Date(MAINTENANT - 30_000).toISOString(), stoppedAt: null, refreshMs: 120_000, selection: [DEPOT] }] });
// GitHub dicté : les issues `fire`, les PR ouvertes (`prs` : ticket -> fichiers) et l'instant où chaque ticket est entré en pass.
function lire(feux: unknown[], prs: Record<number, string[]>) {
  return async (chemin: string): Promise<unknown> => {
    if (chemin === FEUX) return feux;
    if (/\/pulls\?/.test(chemin)) return Object.keys(prs).map((n) => ({ number: 1000 + Number(n), state: "open", title: `#${n}`, body: `Closes #${n}`, head: { ref: `cook/${n}-github`, sha: String(n).repeat(40).slice(0, 40) } }));
    const fichiers = /\/pulls\/(\d+)\/files/.exec(chemin);
    if (fichiers !== null) return (prs[Number(fichiers[1]) - 1000] ?? []).map((filename) => ({ filename }));
    const evenements = /\/issues\/(\d+)\/events/.exec(chemin);
    if (evenements !== null) return [{ event: "labeled", label: { name: "in-pass" }, created_at: `2026-11-23T09:${evenements[1] === "4" ? "10" : "20"}:00Z` }];
    return [];
  };
}
const carte = (dites: string[], n: number) => dites.filter((l) => l.trimStart().startsWith(`#${n} `));

test("a delivery held for an earlier one is shown as waiting for its merge, not idle", async () => {
  const feux = [issue(4, ["fire", "in-pass"]), issue(5, ["fire", "in-pass"])];
  const dites = await lignesDeLAttente({ depot: DEPOT, lire: lire(feux, { 4: ["runtime/src/x.ts"], 5: ["runtime/src/x.ts"] }), stations: enLigne, maintenant: MAINTENANT });
  const ligne = carte(dites, 5)[0] ?? "";
  assert.match(ligne, /after #4\b/);
  assert.match(ligne, /waiting/i);
  assert.match(ligne, /merge/i);
  assert.doesNotMatch(ligne, /ready, waits for a place|Normal wait/);
});

test("a queued ticket held for the merge of another is not said idle either", async () => {
  const feux = [issue(4, ["fire", "in-pass"]), issue(5, ["fire"], "Depends on #4")];
  const dites = await lignesDeLAttente({ depot: DEPOT, lire: lire(feux, { 4: ["runtime/src/x.ts"] }), stations: enLigne, maintenant: MAINTENANT });
  const ligne = carte(dites, 5)[0] ?? "";
  assert.match(ligne, /after #4\b/);
  assert.match(ligne, /waiting/i);
  assert.doesNotMatch(dites.join("\n"), /Normal wait|within minutes/);
});
