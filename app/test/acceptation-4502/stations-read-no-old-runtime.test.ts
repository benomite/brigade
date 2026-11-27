// #4502 — the stations, the box and the workstation read nothing from the old runtime: every file of the ticket names no
// `runtime/src/<x>` but `runtime/src/kitchen/`; what only the old runtime did there — keeping a Mac awake — is gone; and
// what the app read through the old runtime's modules — a registration's freshness, the stations of a project on GitHub —
// it reads itself, from what GitHub holds.
import assert from "node:assert/strict";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, test } from "node:test";
import { available, heldUntil } from "../../src/station-freshness.ts";
import { stationsOfGithub, type SignOfLife } from "../../src/vue/cooks/taken.ts";
import { menuOfBackground } from "../../src/tray-background/tray-background.ts";

const SRC = join(import.meta.dirname, "..", "..", "src");
const SCOPE = [
  "workstation",
  "station-process",
  "stations",
  "tray-background",
  "update-background",
  "outages",
  "stations-of-account.ts",
  "stations-contributors.ts",
  "settings-of-the-station.ts",
  "box.ts",
  "team-of-the-box.ts",
  "connection-github.ts",
  "tools-required.ts",
  "vue/stations-tab",
  "vue/stations-of-account.js",
  "vue/cooks",
  "vue/add-server",
  "vue/identities-github.js",
];
const filesOf = (path: string): string[] => (statSync(path).isDirectory() ? readdirSync(path).flatMap((name) => filesOf(join(path, name))) : [path]);

describe("#4502 — the stations read nothing from the old runtime", () => {
  test("no file of the ticket names a path of runtime/src other than runtime/src/kitchen/", () => {
    const found = SCOPE.flatMap((entry) => filesOf(join(SRC, entry))).flatMap((file) =>
      readFileSync(file, "utf8")
        .split("\n")
        .flatMap((line, rank) => (/runtime\/src\/(?!kitchen\/)/.test(line) ? [`${file.slice(SRC.length + 1)}:${rank + 1}: ${line.trim()}`] : [])),
    );
    assert.deepEqual(found, []);
  });

  test("keeping a Mac awake is gone: no module, no line nor checkbox in the icon's menu", () => {
    assert.equal(existsSync(join(SRC, "vue", "standby-machine")), false);
    const entries = menuOfBackground([], "illisible");
    assert.deepEqual([...new Set(entries.map(({ genre }) => genre))].sort(), ["geste", "separateur", "texte"]);
    assert.doesNotMatch(JSON.stringify(entries), /awake/);
  });

  const NOW = Date.parse("2026-11-27T12:00:00.000Z");
  const at = (ms: number) => new Date(NOW - ms).toISOString();
  const sign = (name: string, lastSeenAgo: number, more: Partial<SignOfLife> = {}): SignOfLife => ({ name, lastSeen: at(lastSeenAgo), stoppedAt: null, refreshMs: 120_000, selection: ["acme/parade"], ...more });

  test("a registration is fresh until 2 × its refresh + 30 s without a sign of life, unless it stopped since or GitHub holds it", () => {
    assert.equal(available(sign("mac", 270_000), NOW), true);
    assert.equal(available(sign("mac", 271_000), NOW), false);
    assert.equal(available(sign("mac", 10_000, { stoppedAt: at(5_000) }), NOW), false);
    const held = sign("mac", 3_600_000, { heldBy: { limit: "primary", since: at(3_600_000), until: at(60_000) } });
    assert.equal(heldUntil(held, NOW), at(60_000));
    assert.equal(available(held, NOW), true);
    assert.equal(heldUntil({ ...held, stoppedAt: at(1_000) }, NOW), null);
  });

  test("a project's stations on GitHub: chosen or holding a ticket, the freshest registration of a machine, cooking, idle or silent", () => {
    const signs = [sign("Parade Box", 600_000), sign("parade-box", 30_000), sign("Mac", 900_000), sign("elsewhere", 10_000, { selection: ["acme/other"] })];
    const cooks = [{ ticket: 7, titre: "Seven", station: "mac/claude", le: at(120_000) }];
    const stations = stationsOfGithub(cooks, signs, "Acme/Parade", NOW);
    assert.deepEqual(
      stations.map(({ station, cuisson, presente, vueLe, cooks: its }) => ({ station, cuisson, presente, vueLe, its: (its ?? []).map(({ ticket }) => ticket) })),
      [
        { station: "mac/claude", cuisson: "cooking", presente: false, vueLe: at(900_000), its: [7] },
        { station: "parade-box/claude", cuisson: "idle", presente: true, vueLe: at(30_000), its: [] },
      ],
    );
    assert.deepEqual(
      stationsOfGithub(cooks, null, "acme/parade", NOW).map(({ station, cuisson, vueLe }) => ({ station, cuisson, vueLe })),
      [{ station: "mac/claude", cuisson: "cooking", vueLe: null }],
    );
  });
});
