// Is Claude Code's native sandbox there, on this machine? It is the condition
// for an ordinary cook to run on the chef's Mac: without it, the cook would
// read everything the account reads — the ssh key to the box, the prod access,
// the chef's credentials. The sandbox of the Mac's cooks is the macOS one
// (Seatbelt, driven by `sandbox-exec`): on any other platform it is
// unavailable, even if `claude` knows how to set one up — the box has its own
// partition (`cloison.ts`).
//
// Three things to bring together: macOS, Seatbelt's tool, and a `claude` recent
// enough to read the configuration that `configuration.ts` writes. That last
// point is not a comfort: launched with `-p`, `claude` silently ignores
// settings it cannot validate — and the cook would start without a sandbox.
import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";

export type Detection = { available: true; version: string } | { available: false; reason: string };

// What the detection looks at on the machine: so a test can simulate it.
export type Probes = {
  platform: NodeJS.Platform;
  exists(path: string): boolean;
  // The output of `claude --version`, null if it did not answer.
  claudeVersion(): string | null;
};

// The tool through which Claude Code's sandbox sets up Seatbelt.
export const SEATBELT = "/usr/bin/sandbox-exec";

// The oldest `claude` version that reads the whole sandbox configuration:
// `network.strictAllowlist` (v2.1.219), without which a cook would reach hosts
// outside the list, and the sandbox built from the `--settings` alone when
// `--setting-sources` cuts the other sources (v2.1.246) — that is how a cook is
// launched (`claude.ts`).
export const MINIMUM_VERSION = "2.1.246";

const VERSION = /(\d+)\.(\d+)\.(\d+)/;

// True if `version` is at least `minimum` — two "major.minor.patch".
export function atLeast(version: string, minimum: string): boolean {
  const [a, b] = [version, minimum].map((text) => (VERSION.exec(text) ?? []).slice(1).map(Number));
  if (a?.length !== 3 || b?.length !== 3) return false;
  for (let rank = 0; rank < 3; rank++) if (a[rank] !== b[rank]) return (a[rank] ?? 0) > (b[rank] ?? 0);
  return true;
}

export function detect(probes: Probes): Detection {
  if (probes.platform !== "darwin") return { available: false, reason: `le bac à sable des cooks est celui de macOS, et cette machine tourne sous ${probes.platform}` };
  if (!probes.exists(SEATBELT)) return { available: false, reason: `Seatbelt est introuvable : \`${SEATBELT}\` n'existe pas sur ce Mac` };
  const output = probes.claudeVersion();
  if (output === null) return { available: false, reason: "`claude --version` n'a pas répondu : impossible de savoir si ce `claude` connaît le bac à sable" };
  const version = VERSION.exec(output)?.[0];
  if (version === undefined) return { available: false, reason: `\`claude --version\` ne donne pas de version lisible (« ${output.trim().slice(0, 80)} »)` };
  if (!atLeast(version, MINIMUM_VERSION))
    return { available: false, reason: `\`claude\` ${version} est trop ancien : il faut ${MINIMUM_VERSION} au moins pour qu'il lise la configuration du bac à sable — \`claude update\`` };
  return { available: true, version };
}

// The probes of the machine the runtime runs on. `bin`: the `claude` the
// station launches (`BRIGADE_CLAUDE_BIN`, otherwise `claude`).
export function machineProbes(bin: string): Probes {
  return {
    platform: process.platform,
    exists: existsSync,
    claudeVersion() {
      try {
        return execFileSync(bin, ["--version"], { encoding: "utf8", timeout: 30_000, stdio: ["ignore", "pipe", "ignore"] });
      } catch {
        return null;
      }
    },
  };
}
