// Le quota GitHub retient la lecture du rail (#4620) : l'onglet Rail le dit, et le dernier rail lu survit au redémarrage.
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, test } from "node:test";
import { holdFacts, type Drawable } from "../src/facts.ts";
import { holdReadsOfBoard } from "../src/board/rail.ts";
import { keptReadsInFile } from "../src/board/kept-reads.ts";
import { holdTheBudgetGitHub, readingUnderBudget } from "../src/budget-github.ts";
import type { BoardRead } from "../src/board/read.ts";
import { type Played } from "./helpers/false-vue.ts";

const PARADE = "parade";
const a = (minute: number) => `2026-11-27T15:${String(minute).padStart(2, "0")}:00.000Z`;

const PAUSE = { jusqua: "2026-11-27T16:27:00.000Z", restant: 734, total: 5_000 };
const paused = (minute: number): Drawable => holdFacts().recevoir({ projet: PARADE, demande: 0, a: a(minute), erreur: "The rail of chef/parade is not read until 2026-11-27 16:27 UTC", atteinte: true, cas: null, duTableau: true, pause: PAUSE });
const receive = (vue: Played, receivedOne: Drawable) => vue.dire("surFaits", { ...receivedOne, demande: vue.dernier("faits")[0] as number });
const hourOf = (iso: string) => new Date(iso).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", hour12: false });
// La ligne du quota (#4645) : ce qui reste, et l'heure locale où la lecture reprend.
const SAYS = `GitHub quota: 734 of 5,000 left — reading resumes at ${hourOf(PAUSE.jusqua)}`;
const linesOfPause = (vue: Played) => vue.element("rail").dessous("p").filter(({ className }) => className === "pause-github").map(({ textContent }) => textContent);

describe("le quota GitHub retient le rail (#4620)", () => {
  for (const served of [true, false]) {
  }

});

describe("le dernier rail lu survit au redémarrage (#4620)", () => {
  const board = (): BoardRead => ({ lu: true, depot: "chef/parade", luLe: a(0), cuisine: { rubriques: [] }, faits: {} as never, file: [], bilans: [], lignesDuRail: [], activites: [] });

  test("lu avant le redémarrage, il est rendu après, avec son heure de lecture : l'âge est celui de la lecture, pas de la pause", async () => {
    const dir = mkdtempSync(join(tmpdir(), "rails-lus-"));
    const path = join(dir, "sous", "rails-lus.json");
    const before = holdReadsOfBoard<{ nom: string }>({ lire: async () => board(), fraicheurMs: 0, garde: keptReadsInFile(path) });
    await before.lire({ nom: PARADE });
    // Le redémarrage : tout est neuf, sauf le fichier ; GitHub dit 734 demandes sur 5 000.
    const clock = { t: Date.parse(a(30)) };
    const budget = holdTheBudgetGitHub({ maintenant: () => clock.t });
    await budget.appeler(async () => ({ status: 200, data: {}, limite: { restant: 734, total: 5_000, repriseLe: clock.t + 30 * 60_000 } }))("/x", {});
    const after: ReturnType<typeof holdReadsOfBoard<{ nom: string }>> = holdReadsOfBoard<{ nom: string }>({
      lire: (project) => readingUnderBudget({ budget, depot: "chef/parade", lire: async () => assert.fail("en pause, rien ne part"), dernier: () => after.dernier(project.nom), maintenant: () => clock.t }),
      fraicheurMs: 0,
      garde: keptReadsInFile(path),
    });
    const readEntry = await after.lire({ nom: PARADE });
    assert.equal(readEntry.lu, true);
    assert.equal(readEntry.luLe, a(0));
    assert.deepEqual(readEntry.lu && readEntry.pause, { jusqua: new Date(clock.t + 30 * 60_000).toISOString(), restant: 734, total: 5_000 });
    // Rendu en pause, il n'est pas regardé comme une lecture neuve : le fichier garde celui d'avant.
    assert.equal(keptReadsInFile(path).lire(PARADE)?.pause, undefined);
    rmSync(dir, { recursive: true });
  });

  test("sans rien gardé, la pause porte l'heure de reprise et le reste du quota", async () => {
    const clock = { t: Date.parse(a(0)) };
    const budget = holdTheBudgetGitHub({ maintenant: () => clock.t });
    await budget.appeler(async () => ({ status: 200, data: {}, limite: { restant: 734, total: 5_000, repriseLe: clock.t + 27 * 60_000 } }))("/x", {});
    const readEntry = await readingUnderBudget({ budget, depot: "chef/parade", lire: async () => assert.fail("en pause"), dernier: () => undefined, maintenant: () => clock.t });
    assert.ok(!readEntry.lu);
    assert.deepEqual(!readEntry.lu && readEntry.pause, { jusqua: new Date(clock.t + 27 * 60_000).toISOString(), restant: 734, total: 5_000 });
  });

});
