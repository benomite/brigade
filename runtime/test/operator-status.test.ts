// The operator status file (#4738): every field read back, its mode and place, and a refusal to cook said in one line.
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { delimiter, isAbsolute, join, relative } from "node:path";
import { test } from "node:test";
import { publishStatus, STATUS_FILE, type Status } from "../src/operator-status.ts";
import { ecrireEtatMiseAJour } from "../src/mise-a-jour/etat.ts";
import { jusqua } from "./outils.ts";

const RATE_LIMIT = { resources: { core: { limit: 5000, remaining: 4321, reset: 1_800_000_000 }, graphql: { limit: 5000, remaining: 4000, reset: 1_800_000_100 } } };
const read = (dir: string) => JSON.parse(readFileSync(join(dir, STATUS_FILE), "utf8")) as Status;
const ready = (dir: string) => () => {
  try {
    return read(dir).quota !== null;
  } catch {
    return false;
  }
};

test("the status file says version, start, projects, cooks, update, quota and refusal, with mode 0644", async () => {
  const station = mkdtempSync(join(tmpdir(), "status-"));
  const updateDir = join(station, "update");
  const started = 1_700_000_000_000;
  const run = join(station, "kitchen", "alpha", "runs", "cook-7");
  mkdirSync(run, { recursive: true });
  writeFileSync(join(run, "meta.json"), JSON.stringify({ kind: "cook", issue: 7, pr: null, started, worktree: null }));
  // This process stands for the cook's relay.
  writeFileSync(join(run, "relay.json"), JSON.stringify({ pid: process.pid, run: "cook-7" }));
  ecrireEtatMiseAJour(updateDir, { installee: "1.2.0", disponible: "1.3.0", gelee: false, verifieeLe: "2026-11-27T10:00:00.000Z", verification: null, retenue: "version 1.3.0 failed before", ratees: [], derniere: { quoi: "passee", version: "1.2.0", depuis: "1.1.0", le: "2026-11-26T08:00:00.000Z" } });
  const gh = async (args: string[]) => {
    assert.deepEqual(args, ["api", "rate_limit"]);
    return JSON.stringify(RATE_LIMIT);
  };
  const stop = publishStatus(station, () => ({ projects: ["beta", "alpha"], refused: { gamma: "no agent launched: no sandbox" } }), { gh, updateDir, version: "9.9.9", now: () => new Date("2026-11-27T12:00:00.000Z"), checkMs: 20 });
  try {
    await jusqua(ready(station));
  } finally {
    stop();
  }
  const status = read(station);
  assert.equal(status.version, "9.9.9");
  assert.equal(status.since, "2026-11-27T12:00:00.000Z");
  assert.equal(status.updatedAt, "2026-11-27T12:00:00.000Z");
  assert.deepEqual(status.projects, ["alpha", "beta"]);
  assert.deepEqual(status.cooks, [{ project: "alpha", issue: 7, since: new Date(started).toISOString() }]);
  assert.deepEqual(status.update, { installed: "1.2.0", available: "1.3.0", frozen: false, held: "version 1.3.0 failed before", checkedAt: "2026-11-27T10:00:00.000Z", last: { result: "passed", version: "1.2.0", at: "2026-11-26T08:00:00.000Z" } });
  assert.deepEqual(status.quota, { core: { limit: 5000, remaining: 4321, resetsAt: new Date(1_800_000_000_000).toISOString() }, graphql: { limit: 5000, remaining: 4000, resetsAt: new Date(1_800_000_100_000).toISOString() } });
  assert.equal(status.refusal, "gamma: no agent launched: no sandbox");
  assert.deepEqual(status.refused, { gamma: "no agent launched: no sandbox" });
  assert.equal(statSync(join(station, STATUS_FILE)).mode & 0o777, 0o644);
});

test("the station's unit writes the status file outside BRIGADE_SANDBOX_HIDDEN", () => {
  const unit = readFileSync(join(import.meta.dirname, "../paquet/systemd/brigade-station.service"), "utf8");
  const value = (name: string) => new RegExp(`^Environment=${name}=(.+)$`, "m").exec(unit)?.[1] ?? "";
  const hidden = value("BRIGADE_SANDBOX_HIDDEN").split(delimiter);
  const dir = value("BRIGADE_STATUS_DIR");
  assert.ok(isAbsolute(dir) && hidden.length > 0);
  for (const one of hidden) {
    const inside = relative(one, join(dir, STATUS_FILE));
    assert.ok(inside.startsWith("..") || isAbsolute(inside), `${join(dir, STATUS_FILE)} is under ${one}`);
  }
});

test("a kitchen that refuses to cook says why in status.json", async () => {
  const station = mkdtempSync(join(tmpdir(), "status-"));
  mkdirSync(join(station, "kitchen"), { recursive: true });
  writeFileSync(join(station, "kitchen", "projects"), "alpha owner/alpha main\n");
  const gh = join(station, "gh");
  writeFileSync(gh, `#!/bin/sh\necho '${JSON.stringify(RATE_LIMIT)}'\n`);
  chmodSync(gh, 0o755);
  // No BRIGADE_SANDBOX_BIN: on Linux the kitchen launches no agent.
  const env = { PATH: process.env.PATH, HOME: station, BRIGADE_STATION_DIR: station, BRIGADE_GH_BIN: gh, BRIGADE_KITCHEN_TURN_SECONDS: "1" };
  const child = spawn(process.execPath, [join(import.meta.dirname, "../src/kitchen/main.ts")], { env, stdio: "ignore" });
  try {
    await jusqua(() => {
      try {
        return read(station).refusal !== null;
      } catch {
        return false;
      }
    });
  } finally {
    child.kill();
  }
  const status = read(station);
  assert.match(status.refusal ?? "", /^alpha: no agent launched: /);
  assert.ok(!(status.refusal ?? "").includes("\n"));
  assert.deepEqual(status.projects, []);
  assert.equal(statSync(join(station, STATUS_FILE)).mode & 0o777, 0o644);
});
