// #4499 — every command the app launches through its station's gesture (`runtime/src/station/geste.ts`, box.ts `ACTION`) has
// a handler behind it. The commands are collected by calling the app's own functions with a launcher that only records
// what it is given; then each one is launched for real, through `launchHere`, on the real runtime of this clone: the real
// geste.ts, the real `package.json`, the real command file. Each is given one word it does not know, so it refuses on its
// own, with its usage, and touches nothing — a command without a handler is refused by the gesture itself (code 66), and a
// handler that lost one of its imports does not load.
import assert from "node:assert/strict";
import { mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, test } from "node:test";
import { launchHere, words, type Locale } from "../src/box.ts";
import { CACHE_OF_COMPILATION } from "./helpers/cache-of-compilation.ts";

const SRC = join(import.meta.dirname, "..", "src");
const RUNTIME = join(import.meta.dirname, "..", "..", "runtime");
const PROJECT = "calculus";
// The gesture's own refusals (box.ts `CASE`, docs/runtime/exploitation.md): none of them is the command's answer.
const OF_THE_GESTURE = [64, 65, 66, 67];

// What the app launches through the gesture: nothing (#4710) — `manager` and `send-word` went with the old runtime's commands.
function commandsTheAppLaunches(): string[] {
  return [];
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
    const importers: string[] = [];
    const places = readFileSync(join(SRC, "main.ts"), "utf8").split("\n").filter((line) => /\blaunchOnTheKitchen\b|\blaunchThe\(/.test(line)).length;
    assert.equal(places, 0, "main.ts launches a command through the gesture: add it to commandsTheAppLaunches");
    // No source of the app names the commands any more: the backlog, the upstream and a word to a cook go through GitHub.
    for (const file of readdirSync(SRC, { recursive: true, encoding: "utf8" }).filter((name) => name.endsWith(".ts"))) assert.doesNotMatch(readFileSync(join(SRC, file), "utf8"), /["'`](manager (upstream|backlog)|send-word)["'`]/, file);
    for (const file of importers) assert.match(readFileSync(join(SRC, file), "utf8"), /\b(launchThe|launchHere|ACTION)\b/, file);
  });

  test("each command the app launches has a handler behind the real geste.ts: it answers itself, never the gesture's “not a runtime command”", async (t) => {
    const launched = commandsTheAppLaunches();
    const heads = [...new Set(launched.map((command) => words(command)[0] ?? ""))].sort();
    assert.deepEqual(heads, []);
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
    assert.match(rendered.erreurs, /« status » n'est pas une commande du runtime — celles de cette station : help\s*$/);
  });
});
