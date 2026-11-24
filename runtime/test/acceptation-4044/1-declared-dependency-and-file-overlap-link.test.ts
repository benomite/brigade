// #4044, critère 1 : B est « after A » quand il déclare A en dépendance, ou quand les livraisons ouvertes de A et B changent un fichier commun.
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

test("a ticket declaring a dependency is linked after it", async () => {
  const dites = await lignes([issue(4, ["fire"]), issue(5, ["fire"], "Depends on #4")]);
  assert.match(carte(dites, 5)[0] ?? "", /after #4\b/);
});

test("two open deliveries changing a common file are linked", async () => {
  const dites = await lignes([issue(4, ["fire", "in-pass"]), issue(5, ["fire", "in-pass"])], { 4: ["runtime/src/x.ts", "docs/a.md"], 5: ["runtime/src/x.ts"] }, { 4: "2026-11-23T09:10:00Z", 5: "2026-11-23T09:20:00Z" });
  assert.match(carte(dites, 5)[0] ?? "", /after #4\b/);
});

test("open deliveries with no file in common are not linked", async () => {
  const dites = await lignes([issue(4, ["fire", "in-pass"]), issue(5, ["fire", "in-pass"])], { 4: ["runtime/src/x.ts"], 5: ["runtime/src/y.ts"] }, { 4: "2026-11-23T09:10:00Z", 5: "2026-11-23T09:20:00Z" });
  assert.deepEqual(dites.filter((l) => /after #/.test(l)), []);
});
