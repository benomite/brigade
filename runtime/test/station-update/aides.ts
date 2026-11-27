// Ce que les tests de la mise à jour de la station se donnent : un répertoire
// de versions publiées, une archive par version, comme la publication de la
// station les range pour un Mac.
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

export const ARCHIVE_MAC = "brigade-station-mac.tar.gz";

// Publie `version` dans `publiees` : `runtime/package.json` dit `dit` (la
// même version par défaut), et le point d'entrée de la station est là, sauf
// `sansPointDEntree`.
export function publier(publiees: string, version: string, { dit = version, sansPointDEntree = false }: { dit?: string; sansPointDEntree?: boolean } = {}): void {
  const brouillon = mkdtempSync(join(tmpdir(), "brigade-release-"));
  try {
    mkdirSync(join(brouillon, "runtime", "src", "station"), { recursive: true });
    writeFileSync(join(brouillon, "runtime", "package.json"), `${JSON.stringify({ name: "brigade-runtime", version: dit })}\n`);
    if (!sansPointDEntree) writeFileSync(join(brouillon, "runtime", "src", "station", "main.ts"), "// la station\n");
    mkdirSync(join(publiees, version), { recursive: true });
    execFileSync("tar", ["-czf", join(publiees, version, ARCHIVE_MAC), "-C", brouillon, "runtime"]);
  } finally {
    rmSync(brouillon, { recursive: true, force: true });
  }
}

// Une archive qui n'en est pas une.
export function publierIllisible(publiees: string, version: string): void {
  mkdirSync(join(publiees, version), { recursive: true });
  writeFileSync(join(publiees, version, ARCHIVE_MAC), "pas une archive");
}
