// Ouvrir un fichier de secrets à d'autres que le compte du service, sur chaque
// plateforme : ce que le runtime doit refuser (`src/droits.ts`).
import { spawnSync } from "node:child_process";
import { chmodSync } from "node:fs";

export const EVERYONE = "S-1-1-0";
export const USERS = "S-1-5-32-545";

// `icacls`, l'outil de Windows : un regard sur les ACL qui ne passe pas par le
// runtime. Lève s'il échoue.
export function icacls(...args: string[]): string {
  const fait = spawnSync("icacls", args, { encoding: "utf8", windowsHide: true });
  if (fait.error) throw fait.error;
  if (fait.status !== 0) throw new Error(`icacls ${args.join(" ")} a rendu ${fait.status} : ${fait.stdout}${fait.stderr}`);
  return fait.stdout;
}

// Ouvre `fichier` en lecture à d'autres : au groupe et aux autres sous macOS et
// Linux (644), à `sid` sous Windows — Everyone, par défaut.
export function exposer(fichier: string, sid = EVERYONE): void {
  if (process.platform !== "win32") chmodSync(fichier, 0o644);
  else icacls(fichier, "/grant", `*${sid}:(R)`);
}

// Ce que le refus d'un fichier ouvert dit de faire, sur cette plateforme.
export const REMEDE = process.platform === "win32" ? /icacls ".+" \/reset`, puis `icacls ".+" \/inheritance:r \/grant:r \*S-1-[\d-]+:F/ : /chmod 600/;
