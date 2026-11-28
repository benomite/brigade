// Le quota GitHub retient la lecture du rail (#4620) : l'onglet Rail le dit, et le dernier rail lu survit au redémarrage.
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, test } from "node:test";
import { forTheBar } from "../src/bar.ts";
import { EXAMPLE } from "../src/config.ts";
import { PALETTE } from "../src/colors.ts";
import { holdFacts, type Drawable } from "../src/facts.ts";
import { HEADINGS } from "../src/tabs.ts";
import { EFFORTS, MODELS } from "../src/projects/projects.ts";
import { NO_STATION } from "../src/vue/cooks/without-station.js";
import { holdReadsOfBoard } from "../src/board/rail.ts";
import { keptReadsInFile } from "../src/board/kept-reads.ts";
import { holdTheBudgetGitHub, readingUnderBudget } from "../src/budget-github.ts";
import type { BoardRead } from "../src/board/read.ts";
import type { Facts } from "../src/facts.ts";
import { type Played, playTheVue, type Answers, repos } from "./helpers/false-vue.ts";

const PARADE = "parade";
const a = (minute: number) => `2026-11-27T15:${String(minute).padStart(2, "0")}:00.000Z`;
const startup = (served: boolean) => () => ({
  configuration: forTheBar({ chemin: "/tmp/app.json", projets: [{ nom: PARADE, dossier: "/tmp/parade" }] }, () => served),
  palette: PALETTE,
  exemple: EXAMPLE,
  rubriques: HEADINGS,
  gestes: {},
  calibrage: { modeles: MODELS, efforts: EFFORTS },
  });
async function open(answers: Answers = {}, served = true): Promise<Played> {
  const vue = await playTheVue({ demarrage: startup(served), espace: () => [], ...answers });
  (vue.element("projets").children.at(1) ?? assert.fail("pas d'entrée")).click();
  await repos();
  return vue;
}

const PAUSE = { jusqua: "2026-11-27T16:27:00.000Z", restant: 734, total: 5_000 };
const paused = (minute: number): Drawable => holdFacts().recevoir({ projet: PARADE, demande: 0, a: a(minute), erreur: "The rail of chef/parade is not read until 2026-11-27 16:27 UTC", atteinte: true, cas: null, duTableau: true, pause: PAUSE });
const receive = (vue: Played, receivedOne: Drawable) => vue.dire("surFaits", { ...receivedOne, demande: vue.dernier("faits")[0] as number });
const hourOf = (iso: string) => new Date(iso).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", hour12: false });
// La ligne du quota (#4645) : ce qui reste, et l'heure locale où la lecture reprend.
const SAYS = `GitHub quota: 734 of 5,000 left — reading resumes at ${hourOf(PAUSE.jusqua)}`;
const linesOfPause = (vue: Played) => vue.element("rail").dessous("p").filter(({ className }) => className === "pause-github").map(({ textContent }) => textContent);

describe("le quota GitHub retient le rail (#4620)", () => {
  for (const served of [true, false]) {
    test(`sans rail lu${served ? "" : ", aucune station de cet ordinateur ne servant le projet"} : l'onglet Rail dit la pause et l'heure de reprise, jamais NO_STATION`, async () => {
      const vue = await open({}, served);
      receive(vue, paused(1));
      const text = vue.element("rail").textContent;
      assert.deepEqual(linesOfPause(vue), [SAYS]);
      assert.ok(!text.includes(NO_STATION), text);
    });
  }

  test("sans reste connu (un refus sans en-têtes), la ligne dit la pause et l'heure de reprise", async () => {
    const vue = await open();
    receive(vue, holdFacts().recevoir({ projet: PARADE, demande: 0, a: a(1), erreur: "paused", atteinte: true, cas: null, duTableau: true, pause: { jusqua: PAUSE.jusqua } }));
    assert.deepEqual(linesOfPause(vue), [`GitHub quota: reads paused — reading resumes at ${hourOf(PAUSE.jusqua)}`]);
  });
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

  test("l'onglet Rail le dessine après le redémarrage, sous la pause : ses colonnes, l'heure de sa lecture, son âge et l'heure où GitHub reprend", async () => {
    const facts: Facts = {
      etat: "ouverte", lu: a(0),
      compteurs: { rail: 1, auTravail: 1, aLaPass: 0, attend: 0, livres24h: 0 },
      attend: [],
      kitchenBoard: { columns: (["backlog", "ready", "cooking", "pass", "parked", "served"] as const).map((key) => ({ key, title: key, cards: key === "cooking" ? [{ ticket: 14, title: "Le journal en ajout seul", url: "https://github.com/chef/parade/issues/14", tries: 0, pr: null }] : [] })) },
    };
    const vue = await open();
    // Ce que le main rend au premier tour après le redémarrage : le rail gardé, lu à 15:00, avec la pause.
    receive(vue, holdFacts().recevoir({ projet: PARADE, demande: 0, a: a(0), publieLe: a(0), pause: PAUSE, sorties: [{ commande: "facts", texte: JSON.stringify(facts) }] } as never));
    const rail = vue.element("rail");
    assert.ok(rail.textContent.includes("Le journal en ajout seul"), rail.textContent);
    assert.ok(!rail.textContent.includes(NO_STATION), rail.textContent);
    // Une seule ligne au-dessus du rail dit la pause (#4645) : ce qui reste, l'heure de reprise — rien d'autre ne la redit.
    assert.deepEqual(linesOfPause(vue), [SAYS]);
    assert.equal(rail.dessous("p").filter(({ className }) => className.split(" ").includes("perime")).length, 0);
    // La lecture reprend : la ligne part.
    receive(vue, holdFacts().recevoir({ projet: PARADE, demande: 0, a: a(28), publieLe: a(28), sorties: [{ commande: "facts", texte: JSON.stringify(facts) }] } as never));
    assert.deepEqual(linesOfPause(vue), []);
    assert.ok(vue.element("rail").textContent.includes("Le journal en ajout seul"));
  });
});
