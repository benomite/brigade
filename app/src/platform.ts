import { existsSync } from "node:fs";
import { join } from "node:path";
import { THIS_COMPUTER } from "./vue/lexicon.js";

export const isOneMac = (platform: string): boolean => platform === "darwin";

// Le nom de ce poste, tel que l'écran le dit : « this computer » sur toutes les plateformes (lexique de l'app, src/vue/lexicon.js).
export const nameOfWorkstation = (): string => THIS_COMPUTER;

export type Shell = { commande: string; args: string[] };

// Là où Git for Windows pose son `bash` — ceux que Claude Code cherche aussi, `CLAUDE_CODE_GIT_BASH_PATH`
// d'abord : c'est par lui que `claude` lance les commandes `!` du second et ses crochets.
export const BASH_OF_GIT = (env: Record<string, string | undefined>): string[] =>
  [
    env.CLAUDE_CODE_GIT_BASH_PATH,
    ...[env.ProgramW6432, env.ProgramFiles, env["ProgramFiles(x86)"]].map((folder) => (folder === undefined ? undefined : join(folder, "Git", "bin", "bash.exe"))),
    env.LOCALAPPDATA === undefined ? undefined : join(env.LOCALAPPDATA, "Programs", "Git", "bin", "bash.exe"),
  ].filter((path): path is string => path !== undefined && path !== "");

// Le shell que l'app ouvre sur ce poste. Sur un Mac ou un Linux : celui du chef (`SHELL`), en shell
// de connexion. Sous Windows : le `bash` de Git for Windows, que `claude` exige déjà — les
// commandes que l'app écrit dans un shell sont citées pour un shell POSIX, comme sur le Mac ; sans
// lui, PowerShell, qui est sur tout Windows.
export function shellOfWorkstation(platform: string, env: Record<string, string | undefined>, exists: (path: string) => boolean = existsSync): Shell {
  if (platform !== "win32") return { commande: env.SHELL || (isOneMac(platform) ? "/bin/zsh" : "/bin/sh"), args: ["-l"] };
  const bash = BASH_OF_GIT(env).find((path) => exists(path));
  return bash === undefined ? { commande: "powershell.exe", args: ["-NoLogo"] } : { commande: bash, args: ["--login", "-i"] };
}

// Un shell de ce poste tient-il une session qui survit à son terminal ? Sur un Mac ou un Linux, par
// `tmux` ou `screen` (persistence.ts) ; Windows n'a ni l'un ni l'autre : le shell finit avec son terminal.
export const persistentOn = (platform: string): boolean => platform !== "win32";

// Ce que l'app dit d'un shell de ce poste qui ne tient pas de session.
export const WITHOUT_SESSION = "not persistent: neither tmux nor screen runs on Windows, this shell ends with its terminal";



// Le nom de ce poste-ci, celui où l'app tourne. Lu sans supposer Node : la lecture du téléphone (app/android/web/
// lecture.ts) charge ce module dans la WebView de l'app Android, où `process` n'existe pas.
export const HERE = nameOfWorkstation();
