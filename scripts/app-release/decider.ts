// Decides whether a merge changes the app, and which `app-v<version>` tag it publishes.
//
//   node scripts/app-release/decider.ts [--minor] [--tag app-v1.2.3]... < changed-files
//
// stdin: the files the merge changed, one path per line (`git diff --name-only`). Each `--tag` is
// an existing release tag; `--minor` raises the minor (an epic's release) instead of the patch; only `app-v<major>.<minor>.<patch>` ones count.
// stdout, two lines a workflow can append to $GITHUB_OUTPUT:
//   changed=true|false
//   tag=app-v<version>     (only when changed=true)
import { readFileSync } from "node:fs";
import { compareVersions, isOneVersion, LABEL } from "../../app/src/update/flux.ts";

// The version published when no app-v tag exists yet.
export const VERSION_DE_DEPART = "1.0.0";

// The app changes when a file under app/ changes, except under app/test/, or a file under
// runtime/src/: the app bundles the runtime code it imports (the rail's reasons, the board's
// reading), on the desktop and on the phone. A runtime fix of what the app shows once reached
// the station and never the installed app (#3828).
export const touchLApp = (fichiers: string[]): boolean =>
  fichiers.some((fichier) => {
    const chemin = fichier.trim().replace(/^\.\//, "");
    return (chemin.startsWith("app/") && !chemin.startsWith("app/test/")) || chemin.startsWith("runtime/src/");
  });

// The next version: the patch of the highest existing `app-v<x.y.z>` tag plus one, or with `mineure`
// its minor plus one and the patch back to 0.
export function versionSuivante(etiquettes: string[], mineure = false): string {
  const versions = etiquettes
    .filter((etiquette) => etiquette.startsWith(LABEL))
    .map((etiquette) => etiquette.slice(LABEL.length))
    .filter((version) => /^\d+\.\d+\.\d+$/.test(version) && isOneVersion(version))
    .sort((a, b) => compareVersions(b, a));
  const derniere = versions[0];
  if (derniere === undefined) return VERSION_DE_DEPART;
  const [majeure, mineureDerniere, correctif] = derniere.split(".").map(Number);
  if (mineure) return `${majeure}.${(mineureDerniere ?? 0) + 1}.0`;
  return `${majeure}.${mineureDerniere}.${(correctif ?? 0) + 1}`;
}

export function decider(fichiers: string[], etiquettes: string[], mineure = false): string {
  if (!touchLApp(fichiers)) return "changed=false\n";
  return `changed=true\ntag=${LABEL}${versionSuivante(etiquettes, mineure)}\n`;
}

if (import.meta.main) {
  const etiquettes: string[] = [];
  let mineure = false;
  const args = process.argv.slice(2);
  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--minor") mineure = true;
    else if (args[i] === "--tag" && args[i + 1] !== undefined) etiquettes.push(args[++i] as string);
    else {
      console.error(`usage: decider.ts [--minor] [--tag app-v1.2.3]... < changed-files`);
      process.exit(2);
    }
  }
  const fichiers = readFileSync(0, "utf8").split("\n").filter((ligne) => ligne.trim() !== "");
  process.stdout.write(decider(fichiers, etiquettes, mineure));
}
