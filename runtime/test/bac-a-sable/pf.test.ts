// The Mac station's network guarantee, `pf`: the anchor's rules, the cook's settings under it, the refusal without it.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { configurer, type Cook } from "../../src/bac-a-sable/configuration.ts";
import type { Sondes } from "../../src/bac-a-sable/detection.ts";
import { launcherOf } from "../../src/bac-a-sable/kitchen-launch.ts";
import { verifierAncre } from "../../src/bac-a-sable/pf.ts";
import { reglesDuProjet } from "../../src/reseau.ts";

const ancre = readFileSync(new URL("../../paquet/macos/brigade.pf.conf", import.meta.url), "utf8")
  .split("\n")
  .filter((ligne) => ligne.trim() !== "" && !ligne.startsWith("#"));

test("the anchor blocks every outgoing packet of user brigade, and passes only loopback for it", () => {
  assert.ok(ancre.some((ligne) => /^block\b.*\bout\b.*\buser brigade$/.test(ligne)), ancre.join("\n"));
  assert.ok(ancre.some((ligne) => /^pass\b.*\bout\b.*\bto lo0\b.*\buser brigade$/.test(ligne)), ancre.join("\n"));
  assert.equal(ancre.length, 2);
});

const cook: Cook = { worktree: "/Users/chef/wt/1", caches: [], hotes: reglesDuProjet(["registry.npmjs.org"]), home: "/Users/chef" };

test("a Mac station under pf writes no network.allowedDomains; the other cases are unchanged", () => {
  const sous = configurer({ ...cook, sousPf: true }).reglages.sandbox.network;
  assert.deepEqual(sous, { allowLocalBinding: true, allowAllUnixSockets: false });
  for (const autre of [cook, { ...cook, sousPf: false }]) {
    const reseau = configurer(autre).reglages.sandbox.network;
    assert.ok("allowedDomains" in reseau && reseau.allowedDomains.includes("registry.npmjs.org") && reseau.strictAllowlist);
  }
});

const mac = (ancrePf: () => string | null): Sondes => ({ plateforme: "darwin", existe: () => true, versionDeClaude: () => "2.1.300 (Claude Code)", ancrePf });
const place = (probes: Sondes, port: number | null) => ({ project: "demo", env: { HOME: "/Users/chef", PATH: process.env.PATH }, claude: "claude", state: "/s", clone: "/c", worktrees: "/Users/chef/w", hosts: () => [], probes, portOf: () => port });

test("a Mac station under pf gives its cooks HTTPS_PROXY and no allowedDomains", () => {
  const launcher = launcherOf(place(mac(() => "block drop out all user = 400\npass out quick on lo0 inet to lo0 user = 400"), 4321));
  assert.ok("launch" in launcher);
  const launch = launcher.launch("cook", "/Users/chef/w/1", true, { model: "sonnet", effort: "low" }, "t");
  assert.equal(launch.env.HTTPS_PROXY, "http://127.0.0.1:4321");
  const { sandbox } = JSON.parse(launch.args[launch.args.indexOf("--settings") + 1] as string);
  assert.ok(!("allowedDomains" in sandbox.network));
});

test("the kitchen refuses to cook, in one line, when the anchor is not loaded", () => {
  for (const regles of [null, "", "pass out quick on lo0 to lo0 user = 400"]) {
    const launcher = launcherOf(place(mac(() => regles), 4321));
    assert.ok("refused" in launcher);
    assert.equal(launcher.refused, 'no agent launched: the pf anchor "brigade" is not loaded: on macOS the station goes out through the gate alone, and cooks nothing without it');
  }
  assert.deepEqual(verifierAncre("block drop out all user = 400\npass out on lo0 to lo0 user = 400"), { ok: true });
});
