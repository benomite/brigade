// Le lancement du second sur l'ordinateur du chef (#1433), d'abord sous
// Windows, où l'onglet restait vide : `claude` y est souvent un lanceur
// `claude.cmd` (installé par npm), que Windows ne lance pas seul, et le nom nu
// que l'app donnait à son pty y trouvait au mieux le fichier sans extension
// qu'npm pose à côté — que Windows ne sait pas lancer non plus.
//
// Le plan (`planDuSecond`) dit ce qu'il faut lancer, et rien d'autre : le
// chemin de `claude` que le PATH donne, et sous Windows ce qui le lance — un
// `.exe` tel quel, un `.cmd` par `cmd.exe /d /s /c`, sa ligne écrite pour lui
// (`lancementSousWindows`, `sans-invite.ts`) —, avec le Git Bash où Claude Code
// joue ses commandes (`CLAUDE_CODE_GIT_BASH_PATH`). L'app le donne à son pty :
// `args`, et quand `verbatim` est vrai, `args` joints par des espaces, une ligne
// déjà écrite que rien ne doit plus citer (node-pty prend alors une chaîne).
//
// Le plan rend toujours l'un de deux états, et ne lève pas :
//   - `ready` : `launch` — `command`, `args`, `verbatim`, `folder` et `env`, ce
//     qu'il faut ajouter à l'environnement du chef. Un outil qui manque sans
//     empêcher le second de partir (`gh`, et `git` hors de Windows) est
//     dit dans `missing`, avec `reason` : le second part, et le dit ;
//   - `cannot-start` : `cause` (stable : `tools-missing` — `claude`, ou sous
//     Windows `git`, manque —, `git-bash-missing`, `folder-missing`, `invalid`,
//     et au démarrage `launch-refused`), `reason`, une phrase, et `tools` quand
//     ce sont les outils (`outils.ts`), chacun avec la phrase qui dit comment
//     l'obtenir.
//
// `demarrerLeSecond` le joue : il lance le plan par un `ouvrir` — celui de
// l'app pour son pty, par défaut des tuyaux (`sans-invite.ts`), ce que les
// tests et la commande ci-dessous emploient. Le second démarré reçoit ce qu'on
// lui écrit, rend sa sortie, et dit sa fin en une phrase : jamais un arrêt
// muet.
//
// L'app les importe, ou lance la commande :
//
//   node runtime/src/second/lancement.ts <dossier du projet> [-- <arguments de claude>…]
//
// qui rend le plan en une ligne JSON — code 0 quand le second peut partir, 1
// sinon. `BRIGADE_CLAUDE_BIN` (et `BRIGADE_GH_BIN`, `BRIGADE_GIT_BIN`) nomment les programmes des outils.
import { statSync } from "node:fs";
import { constants } from "node:os";
import { resolve, win32 } from "node:path";
import { enProcess, Sortie, type Appel } from "../appel.ts";
import { lancementSousWindows, premiereLigne, spawn } from "../sans-invite.ts";
import { enListe, poste, programmesDe, variable, verifierLesOutils, type OptionsDesOutils, type Outil, type OutilVu } from "./outils.ts";

export type LancementDuSecond = { command: string; args: string[]; verbatim: boolean; folder: string; env: Record<string, string> };

export type CauseDuSecond = "tools-missing" | "git-bash-missing" | "folder-missing" | "invalid" | "launch-refused";

export type PlanDuSecond =
  | { state: "ready"; launch: LancementDuSecond; missing: Outil[]; reason?: string; tools: OutilVu[] }
  | { state: "cannot-start"; cause: CauseDuSecond; reason: string; tools?: OutilVu[]; detail?: string };

export type OptionsDuSecond = OptionsDesOutils & {
  // Le dossier du projet, où le second s'ouvre.
  folder: string;
  // Ce que `claude` reçoit : le rôle, `--continue`.
  args?: readonly string[];
};

// Les outils sans lesquels le second ne part pas : `claude`, et sous Windows
// `git`, dont Claude Code exige le Git Bash.
const indispensables = (plateforme: NodeJS.Platform): Outil[] => (plateforme === "win32" ? ["claude", "git"] : ["claude"]);

const estUnDossier = (chemin: string) => {
  try {
    return statSync(chemin).isDirectory();
  } catch {
    return false;
  }
};

// Le Git Bash de Windows, comme Claude Code le cherche : celui que nomme
// `CLAUDE_CODE_GIT_BASH_PATH`, ou celui de l'installation du `git` du PATH
// (`<Git>\cmd\git.exe`, `<Git>\bin\git.exe`, `<Git>\mingw64\bin\git.exe` :
// `<Git>\bin\bash.exe`), ou celui de `Program Files`. Null : aucun.
export function bashDeGit(git: string, env: Record<string, string | undefined>, existe: (chemin: string) => boolean): string | null {
  const parent = win32.dirname(win32.dirname(git));
  const racines = [parent, win32.dirname(parent)];
  for (const nom of ["ProgramW6432", "ProgramFiles"]) {
    const dossier = variable(env, nom, "win32");
    if (dossier !== undefined && dossier !== "") racines.push(win32.join(dossier, "Git"));
  }
  return racines.map((racine) => win32.join(racine, "bin", "bash.exe")).find(existe) ?? null;
}

const fichier = (chemin: string) => {
  try {
    return statSync(chemin).isFile();
  } catch {
    return false;
  }
};

// Ce qu'il faut lancer pour le second dans ce dossier. Ne lève pas.
export function planDuSecond(options: OptionsDuSecond): PlanDuSecond {
  const plateforme = options.plateforme ?? process.platform;
  const env = options.env ?? process.env;
  const ici = poste(plateforme);
  const outils = verifierLesOutils(options);
  const manquants = outils.state === "ready" ? [] : outils.missing;
  const bloquants = manquants.filter((outil) => indispensables(plateforme).includes(outil));
  if (bloquants.length > 0) {
    const noms = enListe(bloquants.map((outil) => `\`${outil}\``));
    return { state: "cannot-start", cause: "tools-missing", reason: `The second cannot start: ${noms} ${bloquants.length === 1 ? "is" : "are"} missing on ${ici}.`, tools: outils.tools };
  }

  const dossier = resolve(options.folder);
  if (!estUnDossier(dossier)) {
    return { state: "cannot-start", cause: "folder-missing", reason: `The second cannot start: the project's folder ${dossier} does not exist on ${ici}.` };
  }

  const chemin = (outil: Outil) => {
    const vu = outils.tools.find(({ tool }) => tool === outil);
    return vu?.present ? vu.path : null;
  };
  const claude = chemin("claude") as string;
  const args = [...(options.args ?? [])];
  const ajouts: Record<string, string> = {};
  let launch: LancementDuSecond = { command: claude, args, verbatim: false, folder: dossier, env: ajouts };

  if (plateforme === "win32") {
    const existe = options.existe ?? fichier;
    const nomme = variable(env, "CLAUDE_CODE_GIT_BASH_PATH", plateforme);
    let bash: string | null;
    if (nomme !== undefined && nomme !== "") {
      if (!existe(nomme)) {
        return { state: "cannot-start", cause: "git-bash-missing", reason: `The second cannot start: CLAUDE_CODE_GIT_BASH_PATH names ${nomme}, which does not exist on ${ici} — point it to Git Bash (bash.exe in the bin folder of Git for Windows), or unset it.` };
      }
      bash = nomme;
    } else {
      bash = bashDeGit(chemin("git") as string, env, existe);
      if (bash === null) {
        return {
          state: "cannot-start",
          cause: "git-bash-missing",
          reason: `The second cannot start: Claude Code runs its commands in Git Bash, and the git of ${ici} (${chemin("git")}) comes without it — install Git for Windows with \`winget install --id Git.Git\`, then restart the app.`,
        };
      }
      ajouts.CLAUDE_CODE_GIT_BASH_PATH = bash;
    }
    const shells = { bash, sh: bash };
    try {
      const lance = lancementSousWindows(claude, args, { node: process.execPath, cmd: variable(env, "ComSpec", plateforme) || "cmd.exe", shells: () => shells, premiereLigne });
      launch = { ...launch, command: lance.commande, args: lance.args, verbatim: lance.tels };
    } catch (erreur) {
      return { state: "cannot-start", cause: "invalid", reason: `The second cannot start: ${(erreur as Error).message}.` };
    }
  }

  const autres = manquants.filter((outil) => !bloquants.includes(outil));
  if (autres.length === 0) return { state: "ready", launch, missing: [], tools: outils.tools };
  const noms = enListe(autres.map((outil) => `\`${outil}\``));
  return {
    state: "ready",
    launch,
    missing: autres,
    reason: `The second starts, but ${noms} ${autres.length === 1 ? "is" : "are"} missing on ${ici}, and what needs ${autres.length === 1 ? "it" : "them"} will fail until ${autres.length === 1 ? "it is" : "they are"} installed.`,
    tools: outils.tools,
  };
}

// Un second qui tourne : ce qu'on lui écrit, ce qu'il rend, et sa fin.
export type Second = {
  ecrire(texte: string): void;
  surSortie(ecouter: (donnees: string) => void): void;
  tuer(): void;
  // Sa fin, dite en une phrase.
  fin: Promise<FinDuSecond>;
};

export type FinDuSecond = { code: number; reason: string };

// Ouvre le lancement, et rend le second une fois parti — ou lève ce qui l'a empêché.
export type Ouvrir = (lancement: LancementDuSecond) => Promise<Second>;

export type SecondDemarre =
  | { state: "started"; launch: LancementDuSecond; missing: Outil[]; reason?: string; tools: OutilVu[]; second: Second }
  | Extract<PlanDuSecond, { state: "cannot-start" }>;

// Ce qui reste d'une sortie de terminal à dire : sans ses séquences de contrôle.
const SEQUENCES = /\x1b\[[0-?]*[ -/]*[@-~]|\x1b\][^\x07\x1b]*(?:\x07|\x1b\\)|\x1b[@-_]/g;
const derniereLigne = (sortie: string) =>
  sortie
    .replace(SEQUENCES, "")
    .split(/\r?\n|\r/)
    .map((ligne) => ligne.trim())
    .filter((ligne) => ligne !== "")
    .at(-1)
    ?.replace(/[.\s]+$/, "") ?? "";

// La fin d'un second, en une phrase : son code, et la dernière ligne qu'il a écrite.
export function finDuSecond(code: number, sortie: string): FinDuSecond {
  const dit = derniereLigne(sortie);
  return { code, reason: `The second stopped with code ${code}${dit === "" ? ", without a word" : `: ${dit}`}.` };
}

// La sortie qu'on garde d'un second, pour dire sa fin : sa fin.
const GARDE = 4_096;

// Le second par des tuyaux, dans l'environnement `env` : sa sortie et sa sortie
// d'erreur, mêlées, comme un terminal les montrerait.
export const parDesTuyaux =
  (env: Record<string, string | undefined> = process.env): Ouvrir =>
  (lancement) =>
  new Promise((resolu, rejete) => {
    const enfant = spawn(lancement.command, lancement.args, {
      cwd: lancement.folder,
      env: { ...env, ...lancement.env },
      stdio: ["pipe", "pipe", "pipe"],
      windowsHide: true,
      windowsVerbatimArguments: lancement.verbatim,
    });
    const ecoutes: ((donnees: string) => void)[] = [];
    let garde = "";
    const recevoir = (morceau: Buffer) => {
      const donnees = morceau.toString("utf8");
      garde = (garde + donnees).slice(-GARDE);
      for (const ecouter of ecoutes) ecouter(donnees);
    };
    enfant.stdout?.on("data", recevoir);
    enfant.stderr?.on("data", recevoir);
    // Un second qui s'arrête pendant qu'on lui écrit : sa fin le dira.
    enfant.stdin?.on("error", () => {});
    // Tué par un signal, un process n'a pas de code : celui du shell (128 + signal).
    const numeros = constants.signals as unknown as Record<string, number | undefined>;
    const fin = new Promise<FinDuSecond>((finir) => {
      enfant.on("close", (code, signal) => finir(finDuSecond(code ?? 128 + (signal === null ? 0 : (numeros[signal] ?? 0)), garde)));
    });
    // Une erreur après le départ (un `kill` refusé) ne dit rien de plus : la fin le dira.
    enfant.on("error", rejete);
    enfant.once("spawn", () =>
      resolu({
        ecrire: (texte) => void enfant.stdin?.write(texte),
        surSortie: (ecouter) => void ecoutes.push(ecouter),
        tuer: () => void enfant.kill(),
        fin,
      }),
    );
  });

// Démarre le second : le plan, puis son lancement. Ne lève pas : ce qui
// l'empêche de partir est un état, avec sa phrase.
export async function demarrerLeSecond(options: OptionsDuSecond & { ouvrir?: Ouvrir }): Promise<SecondDemarre> {
  const plan = planDuSecond(options);
  if (plan.state !== "ready") return plan;
  try {
    const second = await (options.ouvrir ?? parDesTuyaux(options.env))(plan.launch);
    return { ...plan, state: "started", second };
  } catch (erreur) {
    const { code, message } = erreur as NodeJS.ErrnoException;
    const programme = plan.launch.command;
    const pourquoi =
      code === "ENOENT" ? `${programme} was not found` : code === "EACCES" || code === "EPERM" ? `${programme} may not be run by this account` : `launching ${programme} failed (${String(message ?? erreur).replace(/[.\s]+$/, "")})`;
    return { state: "cannot-start", cause: "launch-refused", reason: `The second cannot start on ${poste(options.plateforme ?? process.platform)}: ${pourquoi}.`, tools: plan.tools, detail: String(message ?? erreur) };
  }
}

const USAGE = "usage: node runtime/src/second/lancement.ts <project folder> [-- <claude arguments>…]";

export function principal(appel: Appel): void {
  const [dossier, separateur, ...args] = appel.args;
  if (dossier === undefined || dossier === "" || (separateur !== undefined && separateur !== "--")) {
    appel.redire(USAGE);
    throw new Sortie(2);
  }
  const plan = planDuSecond({ folder: dossier, args, env: appel.env, programmes: programmesDe(appel.env) });
  appel.dire(JSON.stringify(plan));
  if (plan.state !== "ready") throw new Sortie(1);
}

if (import.meta.main) await enProcess((appel) => principal(appel));
