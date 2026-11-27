// What a release says changed, from the pull request that was merged.
//
//   gh pr list --state merged --search <sha> --json number,title,body,headRefName | node scripts/app-release/changements.ts
//
// stdin: that JSON list. stdout, two kinds of output:
//   `epic`     prints `true` when a merged PR is headed `epic/*`, else `false`
//   `notes`    prints the changes: the `## What changes for the user` section of an epic PR's body,
//              the title of a lone ticket's PR; nothing when no PR is found.
import { readFileSync } from "node:fs";

export type PR = { number?: number; title: string; body?: string | null; headRefName: string };

export const estUnEpic = (prs: PR[]): boolean => prs.some((pr) => pr.headRefName.startsWith("epic/"));

// The text under `## What changes for the user`, up to the next `## ` heading.
export function sectionPourLUtilisateur(corps: string): string | undefined {
  const lignes = corps.split("\n");
  const debut = lignes.findIndex((ligne) => /^##\s+What changes for the user\s*$/i.test(ligne.trim()));
  if (debut === -1) return undefined;
  const suite = lignes.slice(debut + 1);
  const fin = suite.findIndex((ligne) => /^##\s/.test(ligne));
  const texte = (fin === -1 ? suite : suite.slice(0, fin)).join("\n").trim();
  return texte === "" ? undefined : texte;
}

export function changements(prs: PR[]): string {
  const epic = prs.find((pr) => pr.headRefName.startsWith("epic/"));
  if (epic !== undefined) {
    return sectionPourLUtilisateur(epic.body ?? "") ?? epic.title;
  }
  return prs[0]?.title ?? "";
}

if (import.meta.main) {
  const commande = process.argv[2];
  const prs = JSON.parse(readFileSync(0, "utf8") || "[]") as PR[];
  if (commande === "epic") process.stdout.write(`${estUnEpic(prs)}\n`);
  else if (commande === "notes") process.stdout.write(changements(prs) === "" ? "" : `${changements(prs)}\n`);
  else {
    console.error("usage: changements.ts epic|notes < prs.json");
    process.exit(2);
  }
}
