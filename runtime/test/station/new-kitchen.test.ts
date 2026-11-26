// On a Mac, the station runs `src/kitchen/main.ts` for the projects of
// `kitchen/projects`, and its old runtime serves none of them (#4484).
import assert from "node:assert/strict";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { test, type TestContext } from "node:test";
import type { Cuisine, OptionsCuisine } from "../../src/station/cuisine.ts";
import { holdKitchen, kitchenProjects } from "../../src/station/new-kitchen.ts";
import { ouvrirStation } from "../../src/station/station.ts";
import { aArreter, repertoireTemporaire } from "../outils.ts";

type KitchenLaunch = { command: string; args: string[]; env: Record<string, string | undefined> };

function stationDir(t: TestContext, configuration: string, kitchen: string | null) {
  const root = repertoireTemporaire(t);
  writeFileSync(join(root, "projets"), configuration);
  if (kitchen !== null) {
    mkdirSync(join(root, "kitchen"), { recursive: true });
    writeFileSync(join(root, "kitchen", "projects"), kitchen);
  }
  return root;
}

// The old runtime, as a witness: the projects it opens.
function oldRuntime(t: TestContext, root: string) {
  const opened: string[] = [];
  const stopped: Array<[string, string]> = [];
  const lines: string[] = [];
  const ouvrir = (env: Record<string, string | undefined>, _options: OptionsCuisine): Cuisine => {
    const projet = env.BRIGADE_PROJECT ?? "";
    opened.push(projet);
    return { projet, repertoireEtat: env.BRIGADE_STATE_DIR ?? "", arreter: (motif) => void stopped.push([projet, motif]) };
  };
  const station = ouvrirStation({ racine: root, env: { BRIGADE_CLAUDE_BIN: "claude" }, dire: (line) => void lines.push(line), ouvrir, relectureMs: 3_600_000, portes: null });
  aArreter(t, () => station.arreter("end of test"));
  return { station, opened, stopped, lines };
}

function kitchen(t: TestContext, root: string, platform: NodeJS.Platform) {
  const launches: KitchenLaunch[] = [];
  const exits: Array<(code: number | null, signal: string | null) => void> = [];
  let kills = 0;
  const lines: string[] = [];
  const held = holdKitchen({
    root,
    env: { HOME: "/Users/chef", BRIGADE_STATION_PORTES: "/p.json" },
    platform,
    say: (line) => void lines.push(line),
    launch: (launch) => {
      launches.push(launch);
      return { onExit: (listener) => void exits.push(listener), kill: () => void kills++ };
    },
    checkMs: 3_600_000,
    restartMs: 0,
  });
  aArreter(t, () => held.stop());
  return { held, launches, exits, lines, kills: () => kills };
}

test("on a Mac, the station starts the kitchen's entry point for a project of kitchen/projects, and the old runtime does not serve it", (t) => {
  const root = stationDir(t, "secondes acme/secondes main\nespace acme/espace main\n", "secondes acme/secondes main PLACES=2\n");
  const old = oldRuntime(t, root);
  const { launches, lines } = kitchen(t, root, "darwin");

  assert.equal(launches.length, 1);
  assert.equal(launches[0]?.command, process.execPath);
  assert.equal(launches[0]?.args.length, 1);
  assert.match(launches[0]?.args[0] ?? "", /[\\/]src[\\/]kitchen[\\/]main\.ts$/);
  assert.ok(existsSync(launches[0]?.args[0] ?? ""));
  assert.equal(launches[0]?.env.BRIGADE_STATION_DIR, root);
  assert.equal(launches[0]?.env.BRIGADE_STATION_PORTES, "/p.json");
  assert.match(lines[0] ?? "", /the new kitchen serves secondes/);

  assert.deepEqual(old.opened, ["espace"]);
  assert.deepEqual(old.station.projets(), ["espace"]);
  assert.ok(old.lines.includes("brigade [secondes] : served by the new kitchen (kitchen/projects): the old runtime does not serve it"));
});

test("a project moved to kitchen/projects stops in the old runtime", (t) => {
  const root = stationDir(t, "secondes acme/secondes main\n", null);
  const old = oldRuntime(t, root);
  assert.deepEqual(old.station.projets(), ["secondes"]);
  mkdirSync(join(root, "kitchen"));
  writeFileSync(join(root, "kitchen", "projects"), "secondes acme/secondes main\n");
  old.station.relire();
  assert.deepEqual(old.station.projets(), []);
  assert.deepEqual(old.stopped, [["secondes", "new-kitchen"]]);
});

test("with no project in kitchen/projects, the Mac starts no kitchen; it starts once one is listed", (t) => {
  const root = stationDir(t, "", "# none yet\n");
  const { held, launches } = kitchen(t, root, "darwin");
  assert.equal(launches.length, 0);
  writeFileSync(join(root, "kitchen", "projects"), "baloo acme/baloo main\n");
  held.check();
  held.check();
  assert.equal(launches.length, 1);
});

test("a kitchen that exits is started again; stopping the station stops it", (t) => {
  const root = stationDir(t, "", "baloo acme/baloo main\n");
  const { held, launches, exits, lines, kills } = kitchen(t, root, "darwin");
  exits[0]?.(1, null);
  assert.ok(lines.some((line) => line.includes("the new kitchen exited (code 1)")));
  held.check();
  assert.equal(launches.length, 2);
  held.stop();
  assert.equal(kills(), 1);
  held.check();
  assert.equal(launches.length, 2);
});

test("off a Mac, the station starts no kitchen: the box has its own unit", (t) => {
  const root = stationDir(t, "", "baloo acme/baloo main\n");
  const { launches } = kitchen(t, root, "linux");
  assert.equal(launches.length, 0);
});

test("kitchenProjects reads names and repositories, skipping comments and blank lines", (t) => {
  const root = stationDir(t, "", "# comment\n\nbaloo acme/baloo main CLONE=/c\nsolo\n");
  assert.deepEqual(kitchenProjects(root), [
    { name: "baloo", repo: "acme/baloo" },
    { name: "solo", repo: null },
  ]);
  assert.deepEqual(kitchenProjects(repertoireTemporaire(t)), []);
});
