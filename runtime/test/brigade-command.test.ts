// The `brigade` command on a linux and a darwin machine, with systemctl, launchctl, journalctl and sudo stubbed.
import assert from "node:assert/strict";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { runCommand, USAGE } from "../src/brigade-command/command.ts";
import type { Machine, Ran } from "../src/brigade-command/shared.ts";
import { repertoireTemporaire } from "./outils.ts";

const PLATFORMS = ["linux", "darwin"] as const;
type Call = { program: string; args: string[]; input?: string };

const STATUS = {
  version: "1.4.0",
  since: "2026-11-27T08:00:00Z",
  projects: [{ name: "brigade", repo: "benomite/brigade", places: 4 }, { name: "site", repo: "benomite/site", places: 2 }],
  cooks: [{ project: "brigade", ticket: 4739, since: "2026-11-27T09:30:00Z" }],
  update: { at: "2026-11-27T07:00:00Z", result: "switched to 1.4.0" },
  github: { remaining: 4800, limit: 5000, resetsAt: "2026-11-27T10:00:00Z" },
  refusal: null,
};

function setup(t: Parameters<typeof repertoireTemporaire>[0], platform: (typeof PLATFORMS)[number], extra: { env?: NodeJS.ProcessEnv; answer?: (call: Call) => Partial<Ran> } = {}) {
  const dir = repertoireTemporaire(t);
  const calls: Call[] = [];
  const machine: Machine = {
    platform,
    env: { BRIGADE_STATION_DIR: dir, BRIGADE_MISE_A_JOUR_DIR: join(dir, "update"), ...extra.env },
    now: () => new Date("2026-11-27T12:00:00Z"),
    run(program, args, input) {
      const call = { program, args, input };
      calls.push(call);
      const given = extra.answer?.(call) ?? {};
      if (given.code !== undefined || given.stdout !== undefined) return { code: 0, stdout: "", stderr: "", ...given };
      // The service managers, running since 10:00.
      if (program === "systemctl" && args[0] === "show") return { code: 0, stdout: "ActiveState=active\nActiveEnterTimestamp=Fri 2026-11-27 08:00:00 UTC\n", stderr: "" };
      if (program === "launchctl" && args[0] === "print") return { code: 0, stdout: "system/com.brigade.station = {\n\tstate = running\n}\n", stderr: "" };
      return { code: 0, stdout: "", stderr: "" };
    },
    freeBytes: () => 12.5 * 1024 ** 3,
  };
  return { dir, calls, machine };
}

test("no argument, help and --help print a usage that lists every subcommand; an unknown one is refused with it", (t) => {
  const { machine } = setup(t, "linux");
  for (const argv of [[], ["help"], ["--help"]]) {
    const done = runCommand(machine, argv);
    assert.equal(done.code, 0);
    assert.equal(done.out, USAGE);
  }
  for (const word of ["status [--json]", "logs [--since 1h]", "restart", "project add <name> <owner/repo> [--places N]", "project remove <name>", "update [--check]", "uninstall [--purge]"]) assert.ok(USAGE.includes(word), word);
  const refused = runCommand(machine, ["frobnicate"]);
  assert.equal(refused.code, 2);
  assert.match(refused.err, /unknown command "frobnicate"/);
  assert.ok(refused.err.includes(USAGE));
});

test("status prints the same text on linux and darwin for the same status.json", (t) => {
  const texts = PLATFORMS.map((platform) => {
    const { dir, machine } = setup(t, platform);
    writeFileSync(join(dir, "status.json"), JSON.stringify(STATUS));
    const done = runCommand(machine, ["status"]);
    assert.equal(done.code, 0);
    return done.out;
  });
  assert.equal(texts[0], texts[1]);
  assert.equal(
    texts[0],
    [
      "Brigade station 1.4.0",
      "Service: running since 2026-11-27T08:00:00Z",
      "Projects: 2",
      "  brigade  benomite/brigade  4 places",
      "  site  benomite/site  2 places",
      "Cooks running: 1",
      "  brigade #4739 since 2026-11-27T09:30:00Z",
      "Last update: 2026-11-27T07:00:00Z — switched to 1.4.0",
      "GitHub quota: 4800/5000 left, resets 2026-11-27T10:00:00Z",
      "Disk free: 12.5 GB",
      "",
    ].join("\n"),
  );
});

test("status asks systemctl on linux and launchctl on darwin, and says a stopped service and why the station refuses to cook", (t) => {
  for (const platform of PLATFORMS) {
    const { dir, calls, machine } = setup(t, platform, {
      answer: (call) => (call.program === "systemctl" ? { code: 0, stdout: "ActiveState=inactive\n" } : call.program === "launchctl" ? { code: 113, stdout: "", stderr: "Could not find service" } : {}),
    });
    writeFileSync(join(dir, "status.json"), JSON.stringify({ ...STATUS, refusal: "no sandbox: bwrap is missing" }));
    const done = runCommand(machine, ["status"]);
    assert.equal(calls[0]?.program, platform === "linux" ? "systemctl" : "launchctl");
    assert.match(done.out, platform === "linux" ? /Service: not running \(inactive\)/ : /Service: not running \(not loaded\)/);
    assert.match(done.out, /Refuses to cook: no sandbox: bwrap is missing/);
  }
});

test("status says so when status.json is not written yet, still with the service and the disk", (t) => {
  const { machine } = setup(t, "linux");
  const done = runCommand(machine, ["status"]);
  assert.equal(done.code, 0);
  assert.match(done.out, /not published yet/);
  assert.match(done.out, /Service: running since 2026-11-27T08:00:00Z/);
  assert.match(done.out, /Disk free: 12.5 GB/);
});

test("status --json carries every fact of the design's table, the same on both systems", (t) => {
  const docs = PLATFORMS.map((platform) => {
    const { dir, machine } = setup(t, platform);
    writeFileSync(join(dir, "status.json"), JSON.stringify({ ...STATUS, refusal: "no sandbox" }));
    const done = runCommand(machine, ["status", "--json"]);
    assert.equal(done.code, 0);
    return { done, parsed: JSON.parse(done.out), dir };
  });
  const [linux, darwin] = docs;
  assert.deepEqual({ ...linux!.parsed, disk: null }, { ...darwin!.parsed, disk: null });
  assert.deepEqual(linux!.parsed, {
    version: "1.4.0",
    service: { running: true, state: "active", since: "2026-11-27T08:00:00Z" },
    projects: STATUS.projects,
    cooks: STATUS.cooks,
    update: STATUS.update,
    github: STATUS.github,
    refusal: "no sandbox",
    disk: { path: linux!.dir, freeBytes: 12.5 * 1024 ** 3 },
    published: true,
  });
});

test("logs: journalctl on linux (since converted, project filtered), the launchd log file on darwin", (t) => {
  const line = (stamp: string, text: string) => `${stamp} host brigade[1]: ${text}`;
  const journal = [line("2026-11-27T11:30:00+0000", "[brigade] cook started #4739"), line("2026-11-27T11:31:00+0000", "[site] turn done"), ""].join("\n");
  const linux = setup(t, "linux", { answer: (call) => (call.program === "journalctl" ? { code: 0, stdout: journal } : {}) });
  const all = runCommand(linux.machine, ["logs", "--since", "1h"]);
  const call = linux.calls.find((one) => one.program === "journalctl")!;
  assert.deepEqual(call.args.slice(0, 2), ["-u", "brigade-station.service"]);
  assert.deepEqual(call.args.slice(-2), ["--since", "-1h"]);
  assert.match(all.out, /\[site\] turn done/);
  const one = runCommand(linux.machine, ["logs", "site"]);
  assert.match(one.out, /\[site\] turn done/);
  assert.doesNotMatch(one.out, /brigade\] cook/);

  const mac = setup(t, "darwin");
  const file = join(mac.dir, "station.log");
  writeFileSync(file, ["2026-11-27T05:00:00Z [brigade] too old", "  continuation of the old one", "2026-11-27T11:30:00Z [brigade] cook started #4739", "2026-11-27T11:31:00Z [site] turn done", ""].join("\n"));
  mac.machine.env.BRIGADE_LOG_FILE = file;
  const recent = runCommand(mac.machine, ["logs", "--since", "1h"]);
  assert.equal(recent.out, "2026-11-27T11:30:00Z [brigade] cook started #4739\n2026-11-27T11:31:00Z [site] turn done\n");
  assert.equal(runCommand(mac.machine, ["logs", "--since", "1h", "brigade"]).out, "2026-11-27T11:30:00Z [brigade] cook started #4739\n");
  assert.equal(mac.calls.filter((c) => c.program === "journalctl").length, 0);
  assert.equal(runCommand(mac.machine, ["logs", "--since", "yesterday"]).code, 2);
});

test("restart goes through sudo systemctl on linux and sudo launchctl on darwin, and says a refusal", (t) => {
  const linux = setup(t, "linux");
  assert.match(runCommand(linux.machine, ["restart"]).out, /restarted/);
  assert.deepEqual(linux.calls[0], { program: "sudo", args: ["systemctl", "restart", "brigade-station.service"], input: undefined });
  const mac = setup(t, "darwin");
  runCommand(mac.machine, ["restart"]);
  assert.deepEqual(mac.calls[0]?.args, ["launchctl", "kickstart", "-k", "system/com.brigade.station"]);
  const refused = setup(t, "linux", { answer: () => ({ code: 1, stderr: "sudo: a password is required" }) });
  const done = runCommand(refused.machine, ["restart"]);
  assert.equal(done.code, 1);
  assert.match(done.err, /a password is required/);
});

test("project add then remove leaves kitchen/projects as it was, on both systems", (t) => {
  for (const platform of PLATFORMS) {
    const { dir, machine } = setup(t, platform);
    const file = join(dir, "kitchen", "projects");
    mkdirSync(join(dir, "kitchen"));
    const before = "# the projects\nbrigade benomite/brigade main PLACES=4 CLONE=/srv/brigade\n\nsite benomite/site main\n";
    writeFileSync(file, before);
    assert.equal(runCommand(machine, ["project", "add", "blog", "benomite/blog", "--places", "2"]).code, 0);
    assert.equal(readFileSync(file, "utf8"), `${before}blog benomite/blog main PLACES=2\n`);
    assert.equal(runCommand(machine, ["project", "remove", "blog"]).code, 0);
    assert.equal(readFileSync(file, "utf8"), before);
  }
});

test("project add creates the file and remove of the only project removes it again; bad input is refused", (t) => {
  const { dir, machine } = setup(t, "linux");
  const file = join(dir, "kitchen", "projects");
  runCommand(machine, ["project", "add", "blog", "benomite/blog"]);
  assert.equal(readFileSync(file, "utf8"), "blog benomite/blog main\n");
  assert.match(runCommand(machine, ["project", "add", "blog", "benomite/other"]).err, /already served/);
  assert.match(runCommand(machine, ["project", "add", "x", "not-a-repo"]).err, /owner\/repo/);
  assert.match(runCommand(machine, ["project", "add", "x", "a/b", "--places", "0"]).err, /places/);
  assert.match(runCommand(machine, ["project", "remove", "ghost"]).err, /not served/);
  runCommand(machine, ["project", "remove", "blog"]);
  assert.equal(existsSync(file), false);
  assert.equal(runCommand(machine, ["project"]).code, 2);
});

test("update --check says what a pass would do, from the same etat.json, on both systems; update starts the pass through sudo", (t) => {
  const texts = PLATFORMS.map((platform) => {
    const { dir, machine, calls } = setup(t, platform);
    const none = runCommand(machine, ["update", "--check"]);
    assert.match(none.out, /No update pass has run yet/);
    mkdirSync(join(dir, "update"));
    writeFileSync(join(dir, "update", "etat.json"), JSON.stringify({ installee: "1.3.0", disponible: "1.4.0", gelee: false, verifieeLe: "2026-11-27T07:00:00Z", verification: null, retenue: null, ratees: [], derniere: null }));
    const done = runCommand(machine, ["update", "--check"]);
    assert.match(done.out, /would switch 1.3.0 to 1.4.0/);
    assert.equal(calls.length, 0, "--check starts nothing");
    const run = runCommand(machine, ["update"]);
    assert.equal(run.code, 0);
    assert.deepEqual(calls[0]?.args, platform === "linux" ? ["systemctl", "start", "--no-block", "brigade-station-mise-a-jour.service"] : ["launchctl", "kickstart", "system/com.brigade.station-update"]);
    assert.equal(calls[0]?.program, "sudo");
    return done.out;
  });
  assert.equal(texts[0], texts[1]);
});

test("uninstall removes services, account, versions and link, and keeps the state unless --purge", (t) => {
  for (const platform of PLATFORMS) {
    const kept = setup(t, platform);
    const done = runCommand(kept.machine, ["uninstall"]);
    assert.equal(done.code, 0);
    const all = kept.calls.map((call) => `${call.program} ${call.args.join(" ")}`);
    assert.ok(all.every((call) => call.startsWith("sudo ")));
    const needed = platform === "linux" ? ["sudo systemctl disable --now", "sudo userdel brigade"] : ["sudo launchctl bootout", "sudo dscl . -delete /Users/brigade"];
    for (const one of needed) assert.ok(all.some((call) => call.startsWith(one)), one);
    assert.ok(all.includes("sudo rm -rf /opt/brigade-station"));
    assert.ok(all.includes("sudo rm -f /usr/local/bin/brigade"));
    assert.ok(!all.some((call) => call.includes(kept.dir)), "the state is kept");
    assert.match(done.out, /state is kept/);

    const purged = setup(t, platform);
    runCommand(purged.machine, ["uninstall", "--purge"]);
    assert.ok(purged.calls.some((call) => call.args.includes(purged.dir) && call.args[0] === "rm"));
  }
  // A step that fails other than a service that was not there is said, and fails the command.
  const broken = setup(t, "linux", { answer: (call) => (call.args[0] === "rm" ? { code: 1, stderr: "Permission denied" } : {}) });
  const done = runCommand(broken.machine, ["uninstall"]);
  assert.equal(done.code, 1);
  assert.match(done.err, /FAILED .*Permission denied/);
});
