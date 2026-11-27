// The Mac station's network guarantee: the `pf` anchor `brigade` (installed by `runtime/paquet/macos/`), which
// blocks every outgoing packet of user `brigade` except to loopback. The station and its agents run as that user and
// go out through the project's gate alone (`HTTPS_PROXY`); the gate runs as root, which the anchor does not block.
// Without the anchor loaded the station cooks nothing.
import { execFileSync } from "../sans-invite.ts";

export const ANCRE_PF = "brigade";

// What `pfctl -a brigade -sr` prints once the anchor holds both rules.
const BLOQUE = /^block\b.*\bout\b.*\buser\b/m;
const PASSE_LA_BOUCLE = /^pass\b.*\bout\b.*\blo0\b/m;

// The anchor's rules as `pfctl` reads them back, null when it cannot be run (not loaded, no right to read it).
export function reglesDeLAncre(): string | null {
  try {
    return execFileSync("/usr/bin/sudo", ["-n", "/sbin/pfctl", "-a", ANCRE_PF, "-sr"], { encoding: "utf8", timeout: 10_000, stdio: ["ignore", "pipe", "ignore"] });
  } catch {
    return null;
  }
}

export type Ancre = { ok: true } | { ok: false; raison: string };

export function verifierAncre(regles: string | null): Ancre {
  if (regles === null || !BLOQUE.test(regles) || !PASSE_LA_BOUCLE.test(regles)) return { ok: false, raison: `the pf anchor "${ANCRE_PF}" is not loaded: on macOS the station goes out through the gate alone, and cooks nothing without it` };
  return { ok: true };
}
