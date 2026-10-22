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
// C'est aussi là que le runtime se fait au lancement de Windows
// (`lancementSousWindows`) : aucun process n'y ouvre de fenêtre, et ce que
// Windows ne sait pas lancer seul — un script à shebang, `bash`, un `.cmd` —
// part par ce qui le lance.
import { closeSync, openSync, readSync, statSync } from "node:fs";
import { dirname, join, win32 } from "node:path";
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
// Windows ne lance que ses exécutables (`.exe`, `.com`). Le reste passe par ce
// qui sait le lancer :
//
// - un script à shebang — un `BRIGADE_CLAUDE_BIN` qui en nomme un, la doublure
//   d'un test — par son interprète : `node` est le node du runtime, `bash` et
//   `sh` ceux de Git pour Windows, tout autre son nom, cherché dans le PATH ;
// - `bash` et `sh` eux-mêmes par ceux de Git, le seul shell POSIX qu'une machine
//   qui a `git` est sûre d'avoir — et pas le `bash.exe` de WSL que `System32`
//   met souvent devant ;
// - un `.cmd` ou un `.bat` par `cmd.exe`, sa ligne écrite pour lui (`ligneDeCmd`).
//   Un argument sur plusieurs lignes n'y passe pas — `cmd.exe` coupe sa ligne au
//   premier saut — : le lancement est refusé en le disant, plutôt que de partir
//   amputé. La consigne d'un cook en est un : `claude` se nomme alors par son
//   exécutable (`claude.exe`, celui de l'installateur), pas par un lanceur `.cmd`.
//
// Ce qui se décide se décide ici, en TypeScript, et se prouve sous Linux comme
// sous Windows ; seul le lancement lui-même est propre à Windows.

export type Shells = { bash: string; sh: string };

export type OutilsWindows = {
  // Le node du runtime : celui qui joue un script `#!/usr/bin/env node`.
  node: string;
  // L'interprète de commandes : `ComSpec`, ou `cmd.exe`.
  cmd: string;
  // Le bash et le sh de Git, cherchés au premier besoin.
  shells: () => Shells;
  // La première ligne du fichier à ce chemin, ou null s'il n'y en a pas.
  premiereLigne: (chemin: string) => string | null;
};

// Ce que Windows lance : la commande, ses arguments, et s'ils partent tels quels
// (`windowsVerbatimArguments`) — déjà écrits pour `cmd.exe`, Node ne doit plus
// les citer.
export type LancementWindows = { commande: string; args: string[]; tels: boolean };

const BASH = new Set(["bash", "/bin/bash", "/usr/bin/bash"]);
const SH = new Set(["sh", "/bin/sh", "/usr/bin/sh"]);

// Les caractères que `cmd.exe` lit comme les siens : chacun y est précédé de `^`.
const META_DE_CMD = /([()\][%!^"`<>&|;, *?])/g;
const echapperPourCmd = (texte: string) => texte.replace(META_DE_CMD, "^$1");

// Un argument tel que le programme le relira de sa ligne de commande (les règles
// de la bibliothèque C de Windows) : entre guillemets, un guillemet précédé
// d'une contre-oblique, et les contre-obliques qui précèdent un guillemet — ou
// la fin — doublées. Les autres contre-obliques restent ce qu'elles sont : un
// chemin de Windows passe tel quel.
export function citerArgument(argument: string): string {
  let cite = "";
  let obliques = 0;
  for (const caractere of argument) {
    if (caractere === "\\") {
      obliques += 1;
      continue;
    }
    cite += caractere === '"' ? `${"\\".repeat(2 * obliques + 1)}"` : `${"\\".repeat(obliques)}${caractere}`;
    obliques = 0;
  }
  return `"${cite}${"\\".repeat(2 * obliques)}"`;
}

// La ligne que `cmd.exe /d /s /c` lit pour lancer un fichier de commandes. Tout
// y est échappé, guillemets compris : `cmd.exe` n'y voit aucune zone entre
// guillemets, donc rien qu'il interprète — ni `&`, ni `|`, ni `%PATH%`. Les
// arguments le sont deux fois : le fichier de commandes les relit, quand il les
// passe à son tour (`%*`), comme une ligne de plus.
export function ligneDeCmd(fichier: string, args: readonly string[]): string {
  const multiligne = [fichier, ...args].find((texte) => /[\r\n]/.test(texte));
  if (multiligne !== undefined) {
    throw new Error(`cannot launch ${fichier} on Windows: a command file (.cmd, .bat) receives no argument that spans several lines — cmd.exe cuts its line at the first line break; name the executable itself (claude.exe, for \`claude\`) instead of a .cmd launcher`);
  }
  return [echapperPourCmd(fichier), ...args.map((argument) => echapperPourCmd(echapperPourCmd(citerArgument(argument))))].join(" ");
}

// L'interprète que nomme une ligne de shebang, et ce qu'il reçoit avant le
// script : `#!/usr/bin/env -S node --no-warnings` est `node`, avec
// `--no-warnings`. Null : la ligne n'en est pas une.
export function interpreteDuShebang(ligne: string): { nom: string; args: string[] } | null {
  if (!ligne.startsWith("#!")) return null;
  const [programme = "", ...suite] = ligne.slice(2).trim().split(/\s+/);
  let mots = [programme, ...suite];
  // `env` cherche le programme qu'il nomme, passé ses options (`-S`) et les
  // variables qu'il pose.
  if (win32.basename(programme) === "env") {
    mots = suite;
    while (mots[0] !== undefined && (mots[0].startsWith("-") || mots[0].includes("="))) mots = mots.slice(1);
  }
  const [interprete = "", ...args] = mots;
  return interprete === "" ? null : { nom: win32.basename(interprete).replace(/\.exe$/i, ""), args };
}

// Ce que Windows lance pour `commande args`. Un exécutable, ou un nom nu que le
// PATH résoudra, reste tel quel.
export function lancementSousWindows(commande: string, args: readonly string[], outils: OutilsWindows): LancementWindows {
  const tel = { commande, args: [...args], tels: false };
  if (BASH.has(commande)) return { ...tel, commande: outils.shells().bash };
  if (SH.has(commande)) return { ...tel, commande: outils.shells().sh };
  const extension = win32.extname(commande).toLowerCase();
  if (extension === ".cmd" || extension === ".bat") return { commande: outils.cmd, args: ["/d", "/s", "/c", `"${ligneDeCmd(commande, args)}"`], tels: true };
  if (extension === ".exe" || extension === ".com" || !/[\\/]/.test(commande)) return tel;
  const ligne = outils.premiereLigne(commande);
  const interprete = ligne === null ? null : interpreteDuShebang(ligne);
  if (interprete === null) return tel;
  // Le bash de Git lit un chemin de Windows écrit avec des barres obliques.
  const script = commande.replaceAll("\\", "/");
  if (interprete.nom === "node") return { ...tel, commande: outils.node, args: [...interprete.args, commande, ...args] };
  if (interprete.nom === "bash") return { ...tel, commande: outils.shells().bash, args: [...interprete.args, script, ...args] };
  if (interprete.nom === "sh") return { ...tel, commande: outils.shells().sh, args: [...interprete.args, script, ...args] };
  return { ...tel, commande: interprete.nom, args: [...interprete.args, commande, ...args] };
}

// Le bash et le sh de Git pour Windows, trouvés à côté du `git` de la machine
// (`git --exec-path` est `<Git>/mingw64/libexec/git-core`). Sans Git, les noms
// nus : le lancement dira qu'ils manquent.
export function shellsDeGit(execPath: string | null, existe: (chemin: string) => boolean = estUnFichier): Shells {
  if (execPath === null || execPath === "") return { bash: "bash", sh: "sh" };
  const racine = dirname(dirname(dirname(execPath)));
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

// La première ligne d'un fichier ordinaire, lue sur ses premiers octets.
export function premiereLigne(chemin: string): string | null {
  if (!estUnFichier(chemin)) return null;
  let descripteur: number | undefined;
  try {
    descripteur = openSync(chemin, "r");
    const tampon = Buffer.alloc(256);
    const lus = readSync(descripteur, tampon, 0, tampon.length, 0);
    return tampon.subarray(0, lus).toString("utf8").split(/\r?\n/)[0] ?? "";
  } catch {
    return null;
  } finally {
    if (descripteur !== undefined) closeSync(descripteur);
  }
}

let shells: Shells | null = null;
const OUTILS: OutilsWindows = {
  node: process.execPath,
  cmd: process.env.ComSpec || "cmd.exe",
  shells: () => {
    if (shells === null) {
      const lu = lancerSync("git", ["--exec-path"], { encoding: "utf8", windowsHide: true, env: envSansInvite() });
      shells = shellsDeGit(lu.status === 0 ? lu.stdout.trim() : null);
    }
    return shells;
  },
  premiereLigne,
};

// Les arguments d'un lancement, prêts pour la plateforme : sous Windows, ce que
// Windows sait lancer, et sans fenêtre. Les options sont toujours là :
// `avecEnvSansInvite` les a posées.
const pourLaPlateforme = (args: unknown[]): unknown[] => {
  if (process.platform !== "win32") return args;
  const [commande, ...suite] = args;
  const liste = Array.isArray(suite[0]) ? (suite.shift() as unknown[]).map(String) : [];
  const lance = lancementSousWindows(String(commande), liste, OUTILS);
  const rang = suite.findIndex(estOptions);
  if (rang >= 0) suite[rang] = { windowsHide: true, ...(suite[rang] as object), ...(lance.tels ? { windowsVerbatimArguments: true } : {}) };
  return [lance.commande, lance.args, ...suite];
};

const preparer = (args: unknown[]): unknown[] => pourLaPlateforme(avecEnvSansInvite(args));

export const execFile = ((...args: unknown[]) => (lancerEtAttendre as (...a: unknown[]) => unknown)(...preparer(args))) as typeof lancerEtAttendre;
// `promisify(execFile)` rend `{ stdout, stderr }` grâce à ce symbole : sans lui, il rendrait la seule sortie.
Object.defineProperty(execFile, promisify.custom, { value: (...args: unknown[]) => (promisify(lancerEtAttendre) as (...a: unknown[]) => unknown)(...preparer(args)) });
export const execFileSync = ((...args: unknown[]) => (lancerEtAttendreSync as (...a: unknown[]) => unknown)(...preparer(args))) as typeof lancerEtAttendreSync;
export const spawn = ((...args: unknown[]) => (lancer as (...a: unknown[]) => unknown)(...preparer(args))) as typeof lancer;
export const spawnSync = ((...args: unknown[]) => (lancerSync as (...a: unknown[]) => unknown)(...preparer(args))) as typeof lancerSync;
export type { ChildProcess };
