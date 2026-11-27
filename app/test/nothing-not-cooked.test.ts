// Une base rouge que son ticket de réparation travaille : `status` l'écrit en tête, d'une seule
// ligne, hors du bloc `attend` — rien n'y attend le chef —, et la carte du projet la pose
// telle quelle. Verte, ou réparation échouée, elle n'est plus lue nulle part : c'est la ligne
// `base` du bloc `attend` qui prend le relais (base-red.test.ts).
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, test, type TestContext } from "node:test";
import type { Fait } from "../../runtime/src/evenements.ts";
import { ouvrirJournal } from "../../runtime/src/journal.ts";
import { principal as status } from "../../runtime/src/status.ts";
import { POWER_UP } from "../src/power-up.ts";
import { putAPart } from "../src/awaiting.ts";
import { forTheBar } from "../src/bar.ts";
import type { Reading } from "../src/box.ts";
import { EXAMPLE } from "../src/config.ts";
import { PALETTE } from "../src/colors.ts";
import { KITCHEN_ACTIONS } from "../src/kitchen.ts";
import { BANNER, holdFacts, type Drawable, type Facts } from "../src/facts.ts";
import { CONFIRMED, DIRECT } from "../src/actions.ts";
import { EFFORTS, MODELS } from "../src/projects/projects.ts";
import { TABS, HEADINGS } from "../src/tabs.ts";
import type { Terminal } from "../src/terminals.ts";
import { playTheVue, openTab, repos } from "./helpers/false-vue.ts";

const PARADE = "parade";
const HOUR_MS = 3_600_000;
const LINE = "nothing cooks: base red since 3 h 00 ago, repair #501 in progress";

// Une base rouge depuis trois heures, dont le ticket de réparation #501 est ouvert.
// `echouee` : il a quitté le rail sans être servi. `verte` : la base a été revue au vert.
function kitchen(t: TestContext, { echouee: failed = false, verte: green = false } = {}) {
  const directory = mkdtempSync(join(tmpdir(), "brigade-app-rien-ne-cuit-"));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  const log = ouvrirJournal(directory, { maintenant: () => new Date(Date.now() - 3 * HOUR_MS) });
  const note = (done: Fait, ticket: number | null = null, author = "pass") => log.ajouter({ project: PARADE, ticket, author, ...done });
  const gates = { outcome: "red" as const, code: 1, failures: ["FAIL  tests du runtime en échec"], tail: "" };
  note({ type: "base.checked", payload: { sha: "ba5e0001ffff", outcome: "red", gates, tickets: [] } });
  note({ type: "base.recheck-requested", payload: {} });
  note({ type: "base.checked", payload: { sha: "ba5e0001ffff", outcome: "red", gates, tickets: [] } });
  note({ type: "base.repair-opening", payload: { sha: "ba5e0001ffff" } });
  note({ type: "base.repair-opened", payload: { sha: "ba5e0001ffff", failures: ["tests du runtime en échec"], reconciled: false } }, 501);
  note({ type: "ticket.arrived", payload: { title: "Réparer la base `v2`", priority: 0, createdAt: "2026-10-01T00:00:00Z", url: "https://exemple.test/501" } }, 501, "github");
  if (failed) note({ type: "ticket.left", payload: { reason: "closed" } }, 501, "github");
  if (green) note({ type: "base.checked", payload: { sha: "ba5e0002ffff", outcome: "green", gates: { outcome: "green", code: 0, failures: [], tail: "" }, tickets: [] } });
  log.fermer();
  let text = "";
  const write = (line: string) => void (text += `${line}\n`);
  status({ args: [], env: { BRIGADE_STATE_DIR: directory }, dire: write, redire: write });
  return text;
}

const readEntry = (text: string): Reading => ({ projet: PARADE, demande: 1, a: "2026-10-14T10:00:00.000Z", sorties: [{ commande: "status", texte: text }] });
const FACTS: Facts = {
  etat: "retenue",
  lu: "2026-10-14T10:00:00.000Z",
  dernierTick: null,
  compteurs: { rail: 0, auTravail: 0, aLaPass: 0, attend: 0, livres24h: 0 },
  dernierEvenement: null,
  rail: [],
};
// La carte telle que l'app la reçoit : les faits d'abord, puis le `status` de la même box.
function drawn(text: string): Drawable {
  const facts = holdFacts();
  facts.recevoir({ projet: PARADE, demande: 1, a: "2026-10-14T10:00:00.000Z", sorties: [{ commande: "facts", texte: JSON.stringify({ ...FACTS, stations: [] }) }] });
  return facts.attendre(putAPart(readEntry(text))) ?? assert.fail("rien n'est redessiné");
}
const boardOf = (drawable: Drawable) => ("tableau" in drawable ? drawable.tableau : assert.fail("pas de tableau"));

const SECOND: Terminal = { id: 1, projet: PARADE, genre: "second", titre: "second · claude", note: "session neuve", arrete: false };
const ANSWERS = {
  demarrage: () => ({
    configuration: forTheBar({ chemin: "/tmp/app.json", projets: [{ nom: PARADE, dossier: "/tmp/parade" }] }, () => true),
    palette: PALETTE,
    exemple: EXAMPLE,
    onglets: TABS, rubriques: HEADINGS,
    gestes: { allumage: POWER_UP, cuisine: KITCHEN_ACTIONS, directs: DIRECT, confirmes: CONFIRMED },
    banniere: BANNER,
    calibrage: { modeles: MODELS, efforts: EFFORTS },
    code: undefined,
  }),
  espace: () => [SECOND],
};

describe("rien ne cuit : base rouge, réparation en cours", () => {
  test("`status` écrit la ligne en première ligne, avec la durée et le numéro de la réparation", (t) => {
    assert.equal(kitchen(t).split("\n")[0], LINE);
  });

  test("la carte la pose en une seule ligne, et le bloc `attend` ne la contient pas", async (t) => {
    const text = kitchen(t);
    const shownOne = putAPart(readEntry(text));
    assert.ok("attend" in shownOne && shownOne.attend !== undefined);
    assert.ok(!shownOne.attend.includes("nothing cooks"));
    assert.deepEqual(shownOne.sorties.flatMap(({ texte: text }) => text.split("\n").filter((line) => line.startsWith("nothing cooks"))), [LINE]);

    const drawable = drawn(text);
    assert.equal(boardOf(drawable).rienNeCuit, LINE);

    const vue = await playTheVue(ANSWERS);
    (vue.element("projets").children.at(1) ?? assert.fail("pas de case pour parade")).click();
    await repos();
    vue.dire("surFaits", { ...drawable, demande: vue.dernier("faits")[0] as number });
    // La ligne est en tête du bloc des stations, sur l'onglet Stations (#1456).
    await openTab(vue, "Stations");
    const setEntries = vue.element("rail").dessous("p").filter((p) => p.textContent === LINE);
    assert.equal(setEntries.length, 1);
    assert.ok(!setEntries[0]?.textContent.includes("\n"));
  });

  test("la base verte, ni `status` ni la carte ne la portent", (t) => {
    const text = kitchen(t, { verte: true });
    assert.ok(!text.includes("nothing cooks"));
    assert.equal(boardOf(drawn(text)).rienNeCuit, undefined);
  });

  test("la réparation échouée, la ligne ne dit plus « réparation en cours » : la ligne `base` du bloc `attend` prend le relais", (t) => {
    const text = kitchen(t, { echouee: true });
    assert.ok(!text.includes("nothing cooks"));
    assert.ok(!/repair #501 in progress/.test(text));
    assert.match(text, /^ {2}base {2}/m);
    assert.equal(boardOf(drawn(text)).rienNeCuit, undefined);
  });
});
