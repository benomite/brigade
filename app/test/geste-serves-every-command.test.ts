// #4499 — every command the app launches through its station's gesture (`runtime/src/station/geste.ts`, box.ts `ACTION`) has
// a handler behind it. The commands are collected by calling the app's own functions with a launcher that only records
// what it is given; then each one is launched for real, through `launchHere`, on the real runtime of this clone: the real
// geste.ts, the real `package.json`, the real command file. Each is given one word it does not know, so it refuses on its
// own, with its usage, and touches nothing — a command without a handler is refused by the gesture itself (code 66), and a
// handler that lost one of its imports does not load.
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, test } from "node:test";
import { ACTIONS } from "../src/actions.ts";
import { launchHere, words, type Locale, type Read, type Rendered } from "../src/box.ts";
import { readTheHumans, writeTheHumans } from "../src/humans-of-project.ts";
import { COMMAND as POWER_UP } from "../src/power-up.ts";
import { COMMANDS as OF_INSTALLATION, JUDGMENT, VERIFICATION } from "../src/service.ts";
import { proposeTheSetting, readTheSettings } from "../src/settings-of-project.ts";
import { readTheStations, writeTheStations } from "../src/stations-contributors.ts";
import { TABS } from "../src/tabs.ts";
import { COMMAND_OF_LOG } from "../src/vue/report/opening.ts";
import { plugTheWordAtCook } from "../src/vue/word-at-cook/word-at-cook-box.ts";
import { CACHE_OF_COMPILATION } from "./helpers/cache-of-compilation.ts";

const SRC = join(import.meta.dirname, "..", "src");
const RUNTIME = join(import.meta.dirname, "..", "..", "runtime");
const PROJECT = "calculus";
// The gesture's own refusals (box.ts `CASE`, docs/runtime/exploitation.md): none of them is the command's answer.
const OF_THE_GESTURE = [64, 65, 66, 67];

// What the app launches, recorded: each launcher answers an empty success, and nothing leaves the test.
async function commandsTheAppLaunches(): Promise<string[]> {
  const launched: string[] = [];
  const nothing: Rendered = { lance: "", erreur: null, sortie: "", erreurs: "" };
  const record = async (_: Read | string, command: string) => (launched.push(command), nothing);
  const readOne: Read = { nom: PROJECT, cuisine: { locale: { node: "node", runtime: RUNTIME, racine: tmpdir(), env: {} } } };
  const quietly = (run: () => Promise<unknown>) => run().catch(() => undefined);

  // The gestures written into the second (actions.ts), and switching a project on (power-up.ts).
  launched.push(...ACTIONS.map(({ commande }) => commande), POWER_UP);
  // The guided installation (service.ts) and the log (tabs.ts, the report).
  launched.push(VERIFICATION, JUDGMENT, ...Object.values(OF_INSTALLATION), ...TABS.map(({ commande }) => commande), COMMAND_OF_LOG);
  // Settings, humans, contributor stations, the word to a cook: read and written by the station.
  await quietly(() => readTheSettings(PROJECT, readOne, record));
  await quietly(() => proposeTheSetting(PROJECT, readOne, { cle: "branche", valeur: "main" }, record));
  await quietly(() => readTheHumans(PROJECT, readOne, record));
  await quietly(() => writeTheHumans(PROJECT, readOne, { remove: "octocat" }, record));
  await quietly(() => readTheStations(PROJECT, readOne, record));
  await quietly(() => writeTheStations(PROJECT, readOne, { refuse: "mac" }, record));
  let send: ((event: unknown, ...args: unknown[]) => unknown) | undefined;
  plugTheWordAtCook({ handle: (_, listen) => (send = listen) }, () => ({ vise: { nom: PROJECT }, lu: readOne }), record);
  await quietly(async () => send?.(undefined, PROJECT, { ticket: 1, text: "hello" }));
  return launched;
}

// A station of this computer serving one project, as the app reads it: its directory, its configuration, this `node`.
function station(): { locale: Locale; remove: () => void } {
  const root = mkdtempSync(join(tmpdir(), "brigade-app-geste-"));
  writeFileSync(join(root, "projets"), `${PROJECT} acme/${PROJECT} main\n`);
  const env = { PATH: process.env.PATH, HOME: root, SystemRoot: process.env.SystemRoot, TEMP: process.env.TEMP, TMP: process.env.TMP, ...CACHE_OF_COMPILATION };
  return { locale: { node: process.execPath, runtime: RUNTIME, racine: root, env }, remove: () => rmSync(root, { recursive: true, force: true }) };
}

describe("#4499 — the station's gesture serves every command the app launches", () => {
  test("the app launches its commands from the same places as when this test was written: a new place adds its command above", () => {
    // Who imports a launcher of the gesture from box.ts, and how often main.ts launches through it.
    const importers = ["main.ts", "power-up.ts", "actions.ts"];
    const places = readFileSync(join(SRC, "main.ts"), "utf8").split("\n").filter((line) => /\blaunchOnTheKitchen\b|\blaunchThe\(/.test(line)).length;
    assert.equal(places, 11, "main.ts launches a command through the gesture in a new place: add it to commandsTheAppLaunches");
    for (const file of importers) assert.match(readFileSync(join(SRC, file), "utf8"), /\b(launchThe|launchHere|ACTION)\b/, file);
  });

  test("each command the app launches has a handler behind the real geste.ts: it answers itself, never the gesture's “not a runtime command”", async (t) => {
    const launched = await commandsTheAppLaunches();
    const heads = [...new Set(launched.map((command) => words(command)[0] ?? ""))].sort();
    // What the app launched when this test was written: a command added since is checked too, never one dropped silently.
    for (const known of ["contributor-stations", "guardrails", "humans", "installation", "log", "manager", "send-word", "setting", "switch"]) assert.ok(heads.includes(known), known);
    const { locale, remove } = station();
    t.after(remove);
    for (const head of heads) {
      const rendered = await launchHere(locale, PROJECT, `${head} --brigade-test-no-such-word`, 60_000);
      const said = `${rendered.lance}\n${rendered.erreurs}${rendered.sortie}`;
      const code = rendered.erreur === null ? 0 : rendered.erreur.code;
      assert.equal(typeof code, "number", `${head}: ${said}`);
      assert.ok(!OF_THE_GESTURE.includes(code as number), `${head}: refused by the gesture (${String(code)}) — ${said}`);
      assert.doesNotMatch(said, /n'est pas une commande du runtime|ERR_MODULE_NOT_FOUND|Cannot find module/, head);
    }
  });

  test("a command the station does not serve is refused by the gesture with code 66, naming the ones it serves", async (t) => {
    const { locale, remove } = station();
    t.after(remove);
    const rendered = await launchHere(locale, PROJECT, "status", 60_000);
    assert.equal(rendered.erreur?.code, 66);
    assert.match(rendered.erreurs, /« status » n'est pas une commande du runtime — celles de cette station : .*\bguardrails\b/);
  });
});
