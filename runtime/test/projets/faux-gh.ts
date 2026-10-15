#!/usr/bin/env node
// Doublure de `gh` pour une station à qui l'app ajoute un projet, sans réseau :
// `gh repo clone <owner>/<repo> <dossier>` clone l'origine nue
// `$FAUX_ORIGINES/<owner>/<repo>.git` ; tout le reste — les gists du compte —
// va à la doublure des gists (../appairage/faux-gh-gists.ts). Un clone est
// noté dans `$FAUX_GISTS/clones`, une ligne chacun.
import { execFileSync, spawnSync } from "node:child_process";
import { appendFileSync, existsSync } from "node:fs";
import { join } from "node:path";

const args = process.argv.slice(2);
if (args[0] === "repo" && args[1] === "clone") {
  const [depot = "", dossier = ""] = args.slice(2);
  const origine = join(process.env.FAUX_ORIGINES ?? "", `${depot}.git`);
  appendFileSync(join(process.env.FAUX_GISTS ?? "", "clones"), `${depot} ${dossier}\n`);
  if (!existsSync(origine)) {
    process.stderr.write(`GraphQL: Could not resolve to a Repository with the name '${depot}'. (repository)\n`);
    process.exit(1);
  }
  execFileSync("git", ["clone", "-q", origine, dossier], { stdio: "inherit" });
} else {
  const rendu = spawnSync(process.execPath, [join(import.meta.dirname, "../appairage/faux-gh-gists.ts"), ...args], { stdio: "inherit" });
  process.exit(rendu.status ?? 1);
}
