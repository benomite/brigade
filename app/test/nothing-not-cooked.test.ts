// Une base rouge que son ticket de réparation travaille : `status` l'écrit en tête, d'une seule
// ligne, hors du bloc `attend` — rien n'y attend le chef —, et la carte du projet la pose
// telle quelle. Verte, ou réparation échouée, elle n'est plus lue nulle part : c'est la ligne
// `base` du bloc `attend` qui prend le relais (base-red.test.ts). Ce que la box rend est la sortie
// de `status` de l'ancien runtime, recopiée telle qu'il l'écrivait (runtime/src/status.ts, supprimé
// avec lui, #4499).
import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { POWER_UP } from "../src/power-up.ts";
import { putAside } from "../src/awaiting.ts";
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
const LINE = "nothing cooks: base red since 3 h 00 ago, repair #501 in progress";

// Une base rouge depuis trois heures, dont le ticket de réparation #501 est ouvert : ce que `status` en rendait.
const STATUS_REPAIRING = [
  "nothing cooks: base red since 3 h 00 ago, repair #501 in progress",
  "project    parade",
  "runtime    never started",
  "kitchen    open · breaker closed (0 failures in a row, opens at ?)",
  "base       RED since 3 h 00 ago on ba5e000 — the station takes no more tickets, the pass neither judges nor merges",
  "           gates replayed 3 h 00 ago: the base is still red",
  "           replay its gates without waiting for a commit: brigade <projet> base replay",
  "backup     NEVER DONE — is the timer `brigade-sauvegarde@parade` running?",
  "",
  "awaiting   nothing awaits the chef",
  "end awaiting",
  "",
  "rail       1 queued",
  "  #501  queued  prio:0  since 3 h 00  Réparer la base `v2`",
  "",
  "cooks      none running",
  "",
  "consumed   in flight: nothing",
  "           5 h: nothing",
  "           24 h: nothing",
  "           what this project has launched, not the account's consumption: /usage gives it",
  "",
  "latest events",
  "  1  2026-10-14T07:00:00.000Z  parade  -  base.checked  pass  {\"sha\":\"ba5e0001ffff\",\"outcome\":\"red\",\"gates\":{\"outcome\":\"red\",\"code\":1,\"failures\":[\"FAIL  tests du runtime en échec\"],\"tail\":\"\"},\"tickets\":[]}",
  "  2  2026-10-14T07:00:00.000Z  parade  -  base.recheck-requested  pass  {}",
  "  3  2026-10-14T07:00:00.000Z  parade  -  base.checked  pass  {\"sha\":\"ba5e0001ffff\",\"outcome\":\"red\",\"gates\":{\"outcome\":\"red\",\"code\":1,\"failures\":[\"FAIL  tests du runtime en échec\"],\"tail\":\"\"},\"tickets\":[]}",
  "  4  2026-10-14T07:00:00.000Z  parade  -  base.repair-opening  pass  {\"sha\":\"ba5e0001ffff\"}",
  "  5  2026-10-14T07:00:00.000Z  parade  #501  base.repair-opened  pass  {\"sha\":\"ba5e0001ffff\",\"failures\":[\"tests du runtime en échec\"],\"reconciled\":false}",
  "  6  2026-10-14T07:00:00.000Z  parade  #501  ticket.arrived  github  {\"title\":\"Réparer la base `v2`\",\"priority\":0,\"createdAt\":\"2026-10-01T00:00:00Z\",\"url\":\"https://exemple.test/501\"}",
  "identity   GitHub — single identity, the machine's `gh`: the chef's account is the kitchen's, nothing reserves the merge for the pass",
  "           calls by identity: cook 0, pass 0, manager 0, chef's account 0",
  "Restarts (24h): 0",
  "blocked w/o q 0",
  "chef        not resolved yet — the kitchen resolves it when it runs",
  "",
  "todo       last 7 d: 0 entered — product 0 · design 0",
  "product role: OFF — 0/3 issues filed today — last run: never",
  "tickets: no measured ticket yet",
  "Ticket time: no measure yet",
  "on time     no merged ticket in the last 24 h",
  "taken-to-merged 24 h: not known — the ticket times of the clone cannot be read",
  "lost time    no data yet / 2 min",
  "vs estimate  no data yet / ×1.50",
  "first try    no data yet / 70%",
  "main repairs no data yet / 0.1 per merge",
  "repairs     0 repairs of main / 0 merged PRs = n/a (recent tickets)",
].join("\n") + "\n";
// La réparation a échoué : #501 a quitté le rail sans être servi.
const STATUS_FAILED = [
  "project    parade",
  "runtime    never started",
  "kitchen    open · breaker closed (0 failures in a row, opens at ?)",
  "base       RED since 3 h 00 ago on ba5e000 — the station takes no more tickets, the pass neither judges nor merges",
  "           gates replayed 3 h 00 ago: the base is still red",
  "           replay its gates without waiting for a commit: brigade <projet> base replay",
  "backup     NEVER DONE — is the timer `brigade-sauvegarde@parade` running?",
  "",
  "awaiting   1 decision awaits the chef — for 3 h 00",
  "  base  for 3 h 00  BASE RED on ba5e000, failing: tests du runtime en échec — its repair #501 left the rail without being served — to repair: fix the base by hand, or restart #501: set `fire` on it again, its issue reopened if needed; the pass replays it as soon as it moves, and the kitchen starts again on its own once green; a red that is not down to the code is replayed on the station: no app button for it yet",
  "end awaiting",
  "",
  "rail       empty",
  "",
  "cooks      none running",
  "",
  "consumed   in flight: nothing",
  "           5 h: nothing",
  "           24 h: nothing",
  "           what this project has launched, not the account's consumption: /usage gives it",
  "",
  "latest events",
  "  1  2026-10-14T07:00:00.000Z  parade  -  base.checked  pass  {\"sha\":\"ba5e0001ffff\",\"outcome\":\"red\",\"gates\":{\"outcome\":\"red\",\"code\":1,\"failures\":[\"FAIL  tests du runtime en échec\"],\"tail\":\"\"},\"tickets\":[]}",
  "  2  2026-10-14T07:00:00.000Z  parade  -  base.recheck-requested  pass  {}",
  "  3  2026-10-14T07:00:00.000Z  parade  -  base.checked  pass  {\"sha\":\"ba5e0001ffff\",\"outcome\":\"red\",\"gates\":{\"outcome\":\"red\",\"code\":1,\"failures\":[\"FAIL  tests du runtime en échec\"],\"tail\":\"\"},\"tickets\":[]}",
  "  4  2026-10-14T07:00:00.000Z  parade  -  base.repair-opening  pass  {\"sha\":\"ba5e0001ffff\"}",
  "  5  2026-10-14T07:00:00.000Z  parade  #501  base.repair-opened  pass  {\"sha\":\"ba5e0001ffff\",\"failures\":[\"tests du runtime en échec\"],\"reconciled\":false}",
  "  6  2026-10-14T07:00:00.000Z  parade  #501  ticket.arrived  github  {\"title\":\"Réparer la base `v2`\",\"priority\":0,\"createdAt\":\"2026-10-01T00:00:00Z\",\"url\":\"https://exemple.test/501\"}",
  "  7  2026-10-14T07:00:00.000Z  parade  #501  ticket.left  github  {\"reason\":\"closed\"}",
  "identity   GitHub — single identity, the machine's `gh`: the chef's account is the kitchen's, nothing reserves the merge for the pass",
  "           calls by identity: cook 0, pass 0, manager 0, chef's account 0",
  "Restarts (24h): 0",
  "blocked w/o q 0",
  "chef        not resolved yet — the kitchen resolves it when it runs",
  "",
  "todo       last 7 d: 0 entered — product 0 · design 0",
  "product role: OFF — 0/3 issues filed today — last run: never",
  "tickets: no measured ticket yet",
  "Ticket time: no measure yet",
  "on time     no merged ticket in the last 24 h",
  "taken-to-merged 24 h: not known — the ticket times of the clone cannot be read",
  "lost time    no data yet / 2 min",
  "vs estimate  no data yet / ×1.50",
  "first try    no data yet / 70%",
  "main repairs no data yet / 0.1 per merge",
  "repairs     0 repairs of main / 0 merged PRs = n/a (recent tickets)",
].join("\n") + "\n";
// La base a été revue au vert.
const STATUS_GREEN = [
  "project    parade",
  "runtime    never started",
  "kitchen    open · breaker closed (0 failures in a row, opens at ?)",
  "base       base re-checked on ba5e000 3 h 00 ago, after the base moved past ba5e000: green, the hold is lifted",
  "backup     NEVER DONE — is the timer `brigade-sauvegarde@parade` running?",
  "",
  "awaiting   nothing awaits the chef",
  "end awaiting",
  "",
  "rail       1 queued",
  "  #501  queued  prio:0  since 3 h 00  Réparer la base `v2`",
  "",
  "cooks      none running",
  "",
  "consumed   in flight: nothing",
  "           5 h: nothing",
  "           24 h: nothing",
  "           what this project has launched, not the account's consumption: /usage gives it",
  "",
  "latest events",
  "  1  2026-10-14T07:00:00.000Z  parade  -  base.checked  pass  {\"sha\":\"ba5e0001ffff\",\"outcome\":\"red\",\"gates\":{\"outcome\":\"red\",\"code\":1,\"failures\":[\"FAIL  tests du runtime en échec\"],\"tail\":\"\"},\"tickets\":[]}",
  "  2  2026-10-14T07:00:00.000Z  parade  -  base.recheck-requested  pass  {}",
  "  3  2026-10-14T07:00:00.000Z  parade  -  base.checked  pass  {\"sha\":\"ba5e0001ffff\",\"outcome\":\"red\",\"gates\":{\"outcome\":\"red\",\"code\":1,\"failures\":[\"FAIL  tests du runtime en échec\"],\"tail\":\"\"},\"tickets\":[]}",
  "  4  2026-10-14T07:00:00.000Z  parade  -  base.repair-opening  pass  {\"sha\":\"ba5e0001ffff\"}",
  "  5  2026-10-14T07:00:00.000Z  parade  #501  base.repair-opened  pass  {\"sha\":\"ba5e0001ffff\",\"failures\":[\"tests du runtime en échec\"],\"reconciled\":false}",
  "  6  2026-10-14T07:00:00.000Z  parade  #501  ticket.arrived  github  {\"title\":\"Réparer la base `v2`\",\"priority\":0,\"createdAt\":\"2026-10-01T00:00:00Z\",\"url\":\"https://exemple.test/501\"}",
  "  7  2026-10-14T07:00:00.000Z  parade  -  base.checked  pass  {\"sha\":\"ba5e0002ffff\",\"outcome\":\"green\",\"gates\":{\"outcome\":\"green\",\"code\":0,\"failures\":[],\"tail\":\"\"},\"tickets\":[]}",
  "identity   GitHub — single identity, the machine's `gh`: the chef's account is the kitchen's, nothing reserves the merge for the pass",
  "           calls by identity: cook 0, pass 0, manager 0, chef's account 0",
  "Restarts (24h): 0",
  "blocked w/o q 0",
  "chef        not resolved yet — the kitchen resolves it when it runs",
  "",
  "todo       last 7 d: 0 entered — product 0 · design 0",
  "product role: OFF — 0/3 issues filed today — last run: never",
  "tickets: no measured ticket yet",
  "Ticket time: no measure yet",
  "on time     no merged ticket in the last 24 h",
  "taken-to-merged 24 h: not known — the ticket times of the clone cannot be read",
  "lost time    no data yet / 2 min",
  "vs estimate  no data yet / ×1.50",
  "first try    no data yet / 70%",
  "main repairs no data yet / 0.1 per merge",
  "repairs     0 repairs of main / 0 merged PRs = n/a (recent tickets)",
].join("\n") + "\n";

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
  return facts.attendre(putAside(readEntry(text))) ?? assert.fail("rien n'est redessiné");
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
  test("la carte la pose en une seule ligne, et le bloc `attend` ne la contient pas", async () => {
    const text = STATUS_REPAIRING;
    const shownOne = putAside(readEntry(text));
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

  test("la base verte, ni `status` ni la carte ne la portent", () => {
    const text = STATUS_GREEN;
    assert.ok(!text.includes("nothing cooks"));
    assert.equal(boardOf(drawn(text)).rienNeCuit, undefined);
  });

  test("la réparation échouée, la ligne ne dit plus « réparation en cours » : la ligne `base` du bloc `attend` prend le relais", () => {
    const text = STATUS_FAILED;
    assert.ok(!text.includes("nothing cooks"));
    assert.ok(!/repair #501 in progress/.test(text));
    assert.match(text, /^ {2}base {2}/m);
    assert.equal(boardOf(drawn(text)).rienNeCuit, undefined);
  });
});
