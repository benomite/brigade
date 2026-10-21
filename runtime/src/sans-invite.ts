// Le seul endroit où le runtime lance un process : git, gh, ssh et tout autre
// outil qu'une station démarre ne doivent jamais interroger le terminal qui a
// lancé l'app. Un accès refusé est un échec immédiat, avec la raison de l'outil
// sur sa sortie d'erreur — pas une invite « Username for … » qui bloque la
// station, et à laquelle taper un secret serait dangereux.
//
// Ces quatre fonctions ont la signature de celles de `node:child_process` et
// ajoutent l'environnement de `envSansInvite` à chaque lancement. Aucun autre
// module de `runtime/src` n'importe `node:child_process` (voir
// `test/sans-invite.test.ts`).
//
// C'est aussi là que le runtime se fait au lancement de Windows (`pourWindows`) :
// aucun process n'y ouvre de fenêtre, et ce que Windows ne sait pas lancer seul
// — `bash`, `sh`, un script à shebang — passe par le bash de Git.
import { closeSync, openSync, readSync, statSync } from "node:fs";
import { basename, dirname, join } from "node:path";
import { promisify } from "node:util";
import { type ChildProcess, execFile as lancerEtAttendre, execFileSync as lancerEtAttendreSync, spawn as lancer, spawnSync as lancerSync } from "node:child_process";

// Ce que l'outil ne doit pas demander. Une valeur déjà posée par l'appelant
// (un askpass qui donne vraiment un jeton, un ssh réglé) reste la sienne : seul
// l'absence de réglage devient un refus.
export const envSansInvite = (base: NodeJS.ProcessEnv = process.env): NodeJS.ProcessEnv => ({
  ...base,
  GIT_TERMINAL_PROMPT: "0",
  GIT_ASKPASS: base.GIT_ASKPASS ?? "false",
  SSH_ASKPASS: base.SSH_ASKPASS ?? "false",
  SSH_ASKPASS_REQUIRE: base.SSH_ASKPASS_REQUIRE ?? "never",
  GIT_SSH_COMMAND: base.GIT_SSH_COMMAND ?? "ssh -o BatchMode=yes",
  GCM_INTERACTIVE: "never",
  GH_PROMPT_DISABLED: "1",
});

const estOptions = (valeur: unknown): valeur is { env?: NodeJS.ProcessEnv } => typeof valeur === "object" && valeur !== null && !Array.isArray(valeur);

// Les arguments d'un lancement : (programme, [args], [options], [rappel]). On
// remplace l'environnement des options, ou on les ajoute là où elles vont.
const avecEnvSansInvite = (args: unknown[]): unknown[] => {
  const rang = args.findIndex((argument, i) => i > 0 && estOptions(argument));
  if (rang >= 0) return args.map((argument, i) => (i === rang ? { ...(argument as object), env: envSansInvite((argument as { env?: NodeJS.ProcessEnv }).env) } : argument));
  const options = { env: envSansInvite() };
  const rappel = args.findIndex((argument) => typeof argument === "function");
  if (rappel >= 0) return [...args.slice(0, rappel), options, ...args.slice(rappel)];
  return args.length === 1 ? [args[0], [], options] : [...args, options];
};

// --- Sous Windows -------------------------------------------------------------
//
// Windows ne lance que ses exécutables : ni `bash`, ni `sh` (la commande des
// gates d'un projet, du service d'un worktree), ni un script à shebang (un
// `BRIGADE_*_BIN` qui en nomme un, les doublures des tests). Le seul shell POSIX
// qu'une machine qui a `git` est sûre d'avoir est celui de Git pour Windows :
// c'est lui qui les joue. Un script `#!/usr/bin/env node` est joué par le `node`
// du runtime.

export type Shells = { bash: string; sh: string };

// Le bash et le sh de Git pour Windows, trouvés à côté du `git` de la machine
// (`git --exec-path` est `<Git>/mingw64/libexec/git-core`). `BRIGADE_BASH_BIN`
// en nomme un autre. Sans Git, les noms nus : le lancement dira qu'ils manquent.
export function shellsDeGit(env: NodeJS.ProcessEnv = process.env, existe: (chemin: string) => boolean = estUnFichier): Shells {
  if (env.BRIGADE_BASH_BIN) return { bash: env.BRIGADE_BASH_BIN, sh: env.BRIGADE_BASH_BIN };
  const lu = lancerSync("git", ["--exec-path"], { encoding: "utf8", windowsHide: true, env: { ...env } });
  const coeur = lu.status === 0 ? lu.stdout.trim() : "";
  if (coeur === "") return { bash: "bash", sh: "sh" };
  const racine = dirname(dirname(dirname(coeur)));
  const trouver = (nom: string) => [join(racine, "bin", nom), join(racine, "usr", "bin", nom)].find(existe);
  const bash = trouver("bash.exe") ?? "bash";
  return { bash, sh: trouver("sh.exe") ?? bash };
}

const estUnFichier = (chemin: string) => {
  try {
    return statSync(chemin).isFile();
  } catch {
    return false;
  }
};

// La première ligne d'un fichier, s'il y en a un à ce chemin.
export function premiereLigne(chemin: string): string | null {
  if (!estUnFichier(chemin)) return null;
  let descripteur: number | undefined;
  try {
    descripteur = openSync(chemin, "r");
    const tampon = Buffer.alloc(256);
    const n = readSync(descripteur, tampon, 0, tampon.length, 0);
    return tampon.subarray(0, n).toString("utf8").split(/\r?\n/)[0] ?? "";
  } catch {
    return null;
  } finally {
    if (descripteur !== undefined) closeSync(descripteur);
  }
}

const BASH = new Set(["bash", "/bin/bash", "/usr/bin/bash"]);
const SH = new Set(["sh", "/bin/sh", "/usr/bin/sh"]);

// Ce que Windows lance pour `commande args`. Un exécutable reste tel quel.
export function pourWindows(commande: string, args: readonly string[], shells: Shells, lire: (chemin: string) => string | null = premiereLigne): { commande: string; args: string[] } {
  if (BASH.has(commande)) return { commande: shells.bash, args: [...args] };
  if (SH.has(commande)) return { commande: shells.sh, args: [...args] };
  if (!/[\\/]/.test(commande) || /\.(exe|com|cmd|bat)$/i.test(commande)) return { commande, args: [...args] };
  const ligne = lire(commande);
  if (ligne === null || !ligne.startsWith("#!")) return { commande, args: [...args] };
  const [programme = "", ...suite] = ligne.slice(2).trim().split(/\s+/);
  const interprete = basename(programme) === "env" ? (suite.find((mot) => !mot.startsWith("-")) ?? "") : basename(programme);
  const script = commande.replaceAll("\\", "/");
  if (interprete === "node") return { commande: process.execPath, args: [commande, ...args] };
  if (interprete === "sh") return { commande: shells.sh, args: [script, ...args] };
  return { commande: shells.bash, args: [script, ...args] };
}

let shells: Shells | null = null;

// Les arguments d'un lancement, prêts pour la plateforme : sous Windows, la
// commande que Windows sait lancer, et aucune fenêtre.
const preparer = (args: unknown[]): unknown[] => {
  const prets = avecEnvSansInvite(args);
  if (process.platform !== "win32") return prets;
  const [commande, ...suite] = prets;
  const liste = Array.isArray(suite[0]) ? (suite.shift() as unknown[]).map(String) : [];
  shells ??= shellsDeGit();
  const lancement = pourWindows(String(commande), liste, shells);
  const rang = suite.findIndex(estOptions);
  if (rang >= 0) suite[rang] = { windowsHide: true, ...(suite[rang] as object) };
  return [lancement.commande, lancement.args, ...suite];
};

export const execFile = ((...args: unknown[]) => (lancerEtAttendre as (...a: unknown[]) => unknown)(...preparer(args))) as typeof lancerEtAttendre;
// `promisify(execFile)` rend `{ stdout, stderr }` grâce à ce symbole : sans lui, il rendrait la seule sortie.
Object.defineProperty(execFile, promisify.custom, { value: (...args: unknown[]) => (promisify(lancerEtAttendre) as (...a: unknown[]) => unknown)(...preparer(args)) });
export const execFileSync = ((...args: unknown[]) => (lancerEtAttendreSync as (...a: unknown[]) => unknown)(...preparer(args))) as typeof lancerEtAttendreSync;
export const spawn = ((...args: unknown[]) => (lancer as (...a: unknown[]) => unknown)(...preparer(args))) as typeof lancer;
export const spawnSync = ((...args: unknown[]) => (lancerSync as (...a: unknown[]) => unknown)(...preparer(args))) as typeof lancerSync;
export type { ChildProcess };
