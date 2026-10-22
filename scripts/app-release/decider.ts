// Decides whether a merge changes the app, and which `app-v<version>` tag it publishes.
//
//   node scripts/app-release/decider.ts [--tag app-v1.2.3]... < changed-files
//
// stdin: the files the merge changed, one path per line (`git diff --name-only`). Each `--tag` is
// an existing release tag; only `app-v<major>.<minor>.<patch>` ones count.
// stdout, two lines a workflow can append to $GITHUB_OUTPUT:
//   changed=true|false
//   tag=app-v<version>     (only when changed=true)
import { readFileSync } from "node:fs";
import { comparerVersions, estUneVersion, ETIQUETTE } from "../../app/src/mise-a-jour/flux.ts";

// The version published when no app-v tag exists yet.
export const VERSION_DE_DEPART = "1.0.0";

// The app changes when a file under app/ changes, except under app/test/.
export const touchLApp = (fichiers: string[]): boolean =>
  fichiers.some((fichier) => {
    const chemin = fichier.trim().replace(/^\.\//, "");
    return chemin.startsWith("app/") && !chemin.startsWith("app/test/");
  });

// The next version: the patch of the highest existing `app-v<x.y.z>` tag plus one.
export function versionSuivante(etiquettes: string[]): string {
  const versions = etiquettes
    .filter((etiquette) => etiquette.startsWith(ETIQUETTE))
    .map((etiquette) => etiquette.slice(ETIQUETTE.length))
    .filter((version) => /^\d+\.\d+\.\d+$/.test(version) && estUneVersion(version))
    .sort((a, b) => comparerVersions(b, a));
  const derniere = versions[0];
  if (derniere === undefined) return VERSION_DE_DEPART;
  const [majeure, mineure, correctif] = derniere.split(".").map(Number);
  return `${majeure}.${mineure}.${(correctif ?? 0) + 1}`;
}

export function decider(fichiers: string[], etiquettes: string[]): string {
  if (!touchLApp(fichiers)) return "changed=false\n";
  return `changed=true\ntag=${ETIQUETTE}${versionSuivante(etiquettes)}\n`;
}

if (import.meta.main) {
  const etiquettes: string[] = [];
  const args = process.argv.slice(2);
  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--tag" && args[i + 1] !== undefined) etiquettes.push(args[++i] as string);
    else {
      console.error(`usage: decider.ts [--tag app-v1.2.3]... < changed-files`);
      process.exit(2);
    }
  }
  const fichiers = readFileSync(0, "utf8").split("\n").filter((ligne) => ligne.trim() !== "");
  process.stdout.write(decider(fichiers, etiquettes));
}
