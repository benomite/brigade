// Ce qui change d'un ordinateur à l'autre, réuni ici : le nom sous lequel l'app dit ce poste, le
// shell qu'elle y ouvre, si ce shell y tient une session persistante, et comment elle arrête un
// process et tout ce qu'il a lancé. Le reste de l'app est le même code sur un Mac, un PC sous
// Windows ou un Linux de bureau : chaque module reçoit d'ici ce qui en dépend, et le process
// principal (main.ts) le lit une fois, sur `process.platform`.
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { join } from "node:path";

export const estUnMac = (plateforme: string): boolean => plateforme === "darwin";

// Le nom de ce poste, tel que l'écran le dit : « this Mac », « this PC », « this computer ».
export function nomDuPoste(plateforme: string): string {
  if (estUnMac(plateforme)) return "this Mac";
  if (plateforme === "win32") return "this PC";
  return "this computer";
}

export type Shell = { commande: string; args: string[] };

// Là où Git for Windows pose son `bash` — ceux que Claude Code cherche aussi, `CLAUDE_CODE_GIT_BASH_PATH`
// d'abord : c'est par lui que `claude` lance les commandes `!` du second et ses crochets.
export const BASH_DE_GIT = (env: Record<string, string | undefined>): string[] =>
  [
    env.CLAUDE_CODE_GIT_BASH_PATH,
    ...[env.ProgramW6432, env.ProgramFiles, env["ProgramFiles(x86)"]].map((dossier) => (dossier === undefined ? undefined : join(dossier, "Git", "bin", "bash.exe"))),
    env.LOCALAPPDATA === undefined ? undefined : join(env.LOCALAPPDATA, "Programs", "Git", "bin", "bash.exe"),
  ].filter((chemin): chemin is string => chemin !== undefined && chemin !== "");

// Le shell que l'app ouvre sur ce poste. Sur un Mac ou un Linux : celui du chef (`SHELL`), en shell
// de connexion. Sous Windows : le `bash` de Git for Windows, que `claude` exige déjà — les
// commandes que l'app écrit dans un shell sont citées pour un shell POSIX, comme sur le Mac ; sans
// lui, PowerShell, qui est sur tout Windows.
export function shellDuPoste(plateforme: string, env: Record<string, string | undefined>, existe: (chemin: string) => boolean = existsSync): Shell {
  if (plateforme !== "win32") return { commande: env.SHELL || (estUnMac(plateforme) ? "/bin/zsh" : "/bin/sh"), args: ["-l"] };
  const bash = BASH_DE_GIT(env).find((chemin) => existe(chemin));
  return bash === undefined ? { commande: "powershell.exe", args: ["-NoLogo"] } : { commande: bash, args: ["--login", "-i"] };
}

// Un shell de ce poste tient-il une session qui survit à son terminal ? Sur un Mac ou un Linux, par
// `tmux` ou `screen` (persistance.ts) ; Windows n'a ni l'un ni l'autre : le shell finit avec son terminal.
export const persistantSur = (plateforme: string): boolean => plateforme !== "win32";

// Ce que l'app dit d'un shell de ce poste qui ne tient pas de session.
export const SANS_SESSION = "not persistent: neither tmux nor screen runs on Windows, this shell ends with its terminal";

// Arrête un process et ce qu'il a lancé. Sur un Mac ou un Linux, il a été lancé chef de son groupe
// (`detached`) : le signal va au groupe. Windows n'a ni groupe ni signal : `taskkill /T /F` arrête
// l'arbre du process, d'un coup — il n'y a pas de SIGTERM à attendre. Jamais d'exception : un
// process déjà parti n'a plus personne à arrêter.
export function arreterLArbre(pid: number, signal: NodeJS.Signals, plateforme: string, tuer: (pid: number, signal: NodeJS.Signals) => void = process.kill): void {
  if (plateforme === "win32") {
    const taskkill = spawn("taskkill", ["/pid", String(pid), "/T", "/F"], { stdio: "ignore", windowsHide: true });
    taskkill.on("error", () => {});
    taskkill.unref();
    return;
  }
  try {
    tuer(-pid, signal);
  } catch {
    // Le groupe n'existe plus.
  }
}

// Lancé chef de son groupe là où un groupe se signale ; sous Windows, `detached` ouvrirait une console à lui.
export const enGroupe = (plateforme: string): boolean => plateforme !== "win32";

// Le nom de ce poste-ci, celui où l'app tourne.
export const ICI = nomDuPoste(process.platform);
