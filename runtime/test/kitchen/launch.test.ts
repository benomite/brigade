// How the new kitchen launches its agents on macOS: inside Claude Code's
// sandbox, with the project's network allowlist — or not at all.
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import type { Sondes } from "../../src/bac-a-sable/detection.ts";
import type { Git } from "../../src/kitchen/kitchen.ts";
import { projectHosts } from "../../src/bac-a-sable/kitchen-sandbox.ts";
import { launcherOf } from "../../src/kitchen/launch.ts";

const root = mkdtempSync(join(tmpdir(), "kitchen-launch-"));
const home = join(root, "home");
const worktrees = join(root, "state", "worktrees");
const CALIBRATION = { model: "sonnet", effort: "low" };

// A Mac whose sandbox is there: Seatbelt, and a recent enough `claude`.
const mac = (overrides: Partial<Sondes> = {}): Sondes => ({ plateforme: "darwin", existe: () => true, versionDeClaude: () => "2.1.300 (Claude Code)", temporaire: () => join(root, "tmp"), ...overrides });

// The base branch declares one more host than the base ones.
const git: Git = async (_cwd, args) => {
  if (args.join(" ") === "show origin/main:.claude/brigade/reseau") return "registry.npmjs.org\n";
  throw new Error(`fake git: ${args.join(" ")}`);
};

function place(probes: Sondes, hosts: Awaited<ReturnType<typeof projectHosts>> = []) {
  return { project: "demo", env: { HOME: home, PATH: process.env.PATH }, claude: "claude", state: join(root, "state"), clone: join(root, "depot"), worktrees, hosts: () => hosts, probes, portOf: () => null };
}

const settingsOf = (args: string[]) => JSON.parse(args[args.indexOf("--settings") + 1] as string) as { sandbox: { filesystem: { allowWrite: string[] }; network: { allowedDomains: string[] } } };

test("on darwin, a cook's launch goes through Claude Code's sandbox with the project's hosts, and writes only in its worktree", async () => {
  const launcher = launcherOf(place(mac(), await projectHosts(git, join(root, "depot"), "main")));
  assert.ok("launch" in launcher);
  const wt = join(worktrees, "7-github");
  const launch = launcher.launch("cook", wt, true, CALIBRATION, "ticket");
  assert.equal(launch.command, "claude");
  assert.equal(launch.args[launch.args.indexOf("--permission-mode") + 1], "dontAsk");
  assert.ok(!launch.args.includes("bypassPermissions"));
  const { sandbox } = settingsOf(launch.args);
  assert.ok(sandbox.network.allowedDomains.includes("registry.npmjs.org"), sandbox.network.allowedDomains.join(" "));
  assert.ok(sandbox.network.allowedDomains.includes("github.com"));
  assert.ok(!sandbox.network.allowedDomains.includes("example.com"));
  assert.ok(sandbox.filesystem.allowWrite.includes(wt));
  assert.ok(sandbox.filesystem.allowWrite.every((lieu) => lieu === wt || !lieu.startsWith(root) || lieu.startsWith(home)), sandbox.filesystem.allowWrite.join(" "));
});

test("on darwin, a read-only launch (reviewer, manager) writes nowhere", () => {
  const launcher = launcherOf(place(mac()));
  assert.ok("launch" in launcher);
  for (const kind of ["pass", "manager"] as const) {
    const launch = launcher.launch(kind, join(root, "depot"), false, CALIBRATION, "input");
    assert.deepEqual(settingsOf(launch.args).sandbox.filesystem.allowWrite, []);
  }
});

test("on darwin with the sandbox missing, no agent is launched and the one-line reason says why", () => {
  const launcher = launcherOf(place(mac({ existe: () => false })));
  assert.ok(!("launch" in launcher));
  assert.ok("refused" in launcher);
  assert.match(launcher.refused, /^no agent launched: on macOS every agent runs inside Claude Code's sandbox, and it is not usable — Seatbelt est introuvable/);
  assert.ok(!launcher.refused.includes("\n"));
  const tooOld = launcherOf(place(mac({ versionDeClaude: () => "2.0.1" })));
  assert.ok("refused" in tooOld && tooOld.refused.includes("trop ancien"));
});

test("on Linux, the launch goes through bwrap unchanged, without Claude Code's sandbox", () => {
  const linux: Sondes = { plateforme: "linux", existe: () => false, versionDeClaude: () => null };
  const bwrap = process.execPath;
  const launcher = launcherOf({ ...place(linux), env: { HOME: home, PATH: process.env.PATH, BRIGADE_SANDBOX_BIN: bwrap, BRIGADE_SANDBOX_HIDDEN: `${join(root, "state")}:${join(root, "depot")}` } });
  assert.ok("launch" in launcher);
  const launch = launcher.launch("cook", join(worktrees, "7-github"), true, CALIBRATION, "ticket");
  assert.ok(launch.args.includes(bwrap) && launch.args.includes("--unshare-pid"), launch.args.join(" "));
  assert.ok(launch.args.includes("claude"));
  assert.equal(launch.args[launch.args.indexOf("--permission-mode") + 1], "bypassPermissions");
  assert.ok(!launch.args.includes("--settings"));
});

test("the project's hosts are the base ones when the base branch declares none", async () => {
  const hosts = await projectHosts(async () => Promise.reject(new Error("no such path")), join(root, "depot"), "main");
  assert.ok(hosts.some((regle) => regle.hote === "github.com"));
  assert.ok(!hosts.some((regle) => regle.hote === "registry.npmjs.org"));
});
