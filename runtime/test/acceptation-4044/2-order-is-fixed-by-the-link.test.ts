// #4044, critère 2 : une dépendance déclarée passe en premier ; entre deux livraisons qui se recouvrent, celle arrivée la première à la pass.
import assert from "node:assert/strict";
import { test } from "node:test";
import { lignesDeLAttente } from "../../src/attente-du-rail/status.ts";
import { DEPOT } from "../outils.ts";

const MAINTENANT = Date.parse("2026-11-23T10:00:00.000Z");
const FEUX = `/repos/${DEPOT}/issues?state=open&labels=fire&sort=created&direction=asc&per_page=100&page=1`;
const issue = (number: number, labels: string[], body = "") => ({ number, title: `#${number}`, body, created_at: "2026-11-23T09:00:00Z", labels: labels.map((name) => ({ name })) });
const enLigne = async () => ({ lues: [{ name: "box", lastSeen: new Date(MAINTENANT - 30_000).toISOString(), stoppedAt: null, refreshMs: 120_000, selection: [DEPOT] }] });
// GitHub dicté : les issues `fire`, les PR ouvertes (`prs` : ticket -> fichiers) et l'instant où chaque ticket est entré en pass (`passes`).
function lireDe(feux: unknown[], prs: Record<number, string[]> = {}, passes: Record<number, string> = {}) {
  return async (chemin: string): Promise<unknown> => {
    if (chemin === FEUX) return feux;
    if (/\/pulls\?/.test(chemin)) return Object.keys(prs).map((n) => ({ number: 1000 + Number(n), state: "open", title: `#${n}`, body: `Closes #${n}`, head: { ref: `cook/${n}-github`, sha: String(n).repeat(40).slice(0, 40) } }));
    const fichiers = /\/pulls\/(\d+)\/files/.exec(chemin);
    if (fichiers !== null) return (prs[Number(fichiers[1]) - 1000] ?? []).map((filename) => ({ filename }));
    const evenements = /\/issues\/(\d+)\/events/.exec(chemin);
    if (evenements !== null && passes[Number(evenements[1])] !== undefined) return [{ event: "labeled", label: { name: "in-pass" }, created_at: passes[Number(evenements[1])] }];
    return [];
  };
}
const lignes = (feux: unknown[], prs: Record<number, string[]> = {}, passes: Record<number, string> = {}) => lignesDeLAttente({ depot: DEPOT, lire: lireDe(feux, prs, passes), stations: enLigne, maintenant: MAINTENANT });
const carte = (dites: string[], n: number) => dites.filter((l) => l.trimStart().startsWith(`#${n} `));

test("for a declared dependency, the dependency comes first, whatever the numbers", async () => {
  const dites = await lignes([issue(4, ["fire"], "Depends on #9"), issue(9, ["fire"])]);
  assert.match(carte(dites, 4)[0] ?? "", /after #9\b/);
  assert.deepEqual(carte(dites, 9).filter((l) => /after #/.test(l)), []);
});

test("for a file overlap, the delivery that reached the pass first comes first, whatever the numbers", async () => {
  const prs = { 3: ["runtime/src/x.ts"], 7: ["runtime/src/x.ts"] };
  const feux = [issue(3, ["fire", "in-pass"]), issue(7, ["fire", "in-pass"])];
  const septD = await lignes(feux, prs, { 7: "2026-11-23T09:10:00Z", 3: "2026-11-23T09:30:00Z" });
  assert.match(carte(septD, 3)[0] ?? "", /after #7\b/);
  assert.deepEqual(carte(septD, 7).filter((l) => /after #/.test(l)), []);
  const troisD = await lignes(feux, prs, { 3: "2026-11-23T09:10:00Z", 7: "2026-11-23T09:30:00Z" });
  assert.match(carte(troisD, 7)[0] ?? "", /after #3\b/);
  assert.deepEqual(carte(troisD, 3).filter((l) => /after #/.test(l)), []);
});
