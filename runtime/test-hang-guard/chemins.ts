// On Windows, `new URL("…", import.meta.url).pathname` gives `/D:/a/…`, which `fs` reads as
// `D:\D:\a\…` (ENOENT). A frozen acceptance test may walk a folder this way and cannot be rewritten
// (acceptation-4242/6-…, red on the Windows runner): the preload (charger.ts) drops that slash before
// `fs` reads the path. Elsewhere, and for any other path, nothing changes.
import fs from "node:fs";
import { syncBuiltinESMExports } from "node:module";

export function cheminLisible(chemin: unknown, plateforme: NodeJS.Platform = process.platform): unknown {
  if (plateforme !== "win32" || typeof chemin !== "string") return chemin;
  return chemin.replace(/^[\\/]([A-Za-z]:[\\/])/, "$1");
}

// The synchronous reads a test uses to walk the repo; the `import { … } from "node:fs"` of a test sees them too.
const LECTURES = ["readdirSync", "statSync", "lstatSync", "readFileSync", "existsSync"] as const;

export function adapterFs(plateforme: NodeJS.Platform = process.platform): void {
  if (plateforme !== "win32") return;
  const lectures = fs as unknown as Record<string, (...args: unknown[]) => unknown>;
  for (const nom of LECTURES) {
    const original = lectures[nom];
    lectures[nom] = (chemin: unknown, ...reste: unknown[]) => original(cheminLisible(chemin, plateforme), ...reste);
  }
  syncBuiltinESMExports();
}
