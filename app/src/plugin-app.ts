// Le plugin de l'app (#2160) : dans chaque projet que l'app ouvre, `/brigade:dev <numéro>` et
// `/brigade:ask <numéro>` répondent dans toute session Claude Code de son dossier — les onglets de
// l'app comme un terminal à part —, sans rien installer à la main. Ces deux commandes, et elles
// seules : aucun rôle V1 (`po`, `manager`, `designer`, `sync`), aucun agent — l'app et les stations
// les remplacent. La préparation d'un dépôt n'est pas une commande du plugin : l'onglet Second
// l'ouvre avec ses instructions (setup/setup.ts, #4632).
//
// Le mécanisme est celui de Claude Code lui-même :
// - **un marketplace à l'app**, `brigade-app`, que l'app pose à côté du fichier des projets
//   (`~/.config/brigade/plugin-app/`) depuis les commandes qu'elle porte — `commands/dev.md` et
//   `commands/ask.md` du dépôt, ou leur copie dans son paquet (locations.ts). Il est déclaré une
//   fois, dans les réglages du compte (`claude plugin marketplace add`) : il ne porte que le plugin
//   `brigade-app`, et le marketplace `brigade` du plugin V1 n'est pas touché ;
// - **le plugin `brigade-app`, en scope local** dans le dossier du projet : Claude Code l'écrit dans
//   `.claude/settings.local.json`, qui n'est pas versionné. Si git ne l'ignore pas déjà, l'app
//   l'ajoute à l'`info/exclude` du clone — jamais au `.gitignore` : `git status` n'en montre rien,
//   et rien ne se commite. Son manifeste s'appelle `brigade` : c'est le nom sous lequel ses
//   commandes se tapent.
//
// La version installée est celle que l'app porte : la sienne une fois installée, ou, lancée depuis
// le dépôt (où elle se dit 0.0.0), l'empreinte des deux commandes. Une app mise à jour pose son
// marketplace à sa nouvelle version, et chaque projet ouvert est mis à jour à son lancement.
//
// Retirer un projet de l'app désinstalle `brigade-app` du scope local de son dossier, et rien
// d'autre : un plugin `brigade` V1 installé à la main y reste, le marketplace de l'app reste déclaré
// pour les autres projets (le retirer désinstallerait le plugin de tous).
//
// Un seul `claude plugin` à la fois : ils écrivent tous le même registre du compte.
import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, realpathSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import type { Project } from "./config.ts";

export const MARKETPLACE = "brigade-app";
export const PLUGIN = "brigade-app";
export const ID = `${PLUGIN}@${MARKETPLACE}`;
// Le nom du manifeste : celui sous lequel les commandes se tapent, `/brigade:dev`.
export const SPACE = "brigade";
// Les commandes du plugin copiées de `commands/` du dépôt.
export const COMMANDS = ["dev.md", "ask.md"] as const;
// Le dossier du marketplace, à côté du fichier des projets.
export const FOLDER = "plugin-app";
// Le fichier que Claude Code écrit dans le dossier du projet pour le scope local.
export const SETTINGS_LOCAL = ".claude/settings.local.json";
// La version que l'app se donne quand elle tourne depuis son dépôt (son package.json).
const VERSION_OF_REPOSITORY = "0.0.0";

// La version du plugin que l'app porte : la sienne, installée ; depuis le dépôt, l'empreinte des
// commandes — une commande changée change la version, et les projets se mettent à jour.
export function versionOfPlugin(versionOfTheApp: string, commands: string): string {
  if (versionOfTheApp !== VERSION_OF_REPOSITORY) return versionOfTheApp;
  const fingerprint = createHash("sha256");
  for (const name of COMMANDS) fingerprint.update(name).update("\0").update(readFileSync(join(commands, name))).update("\0");
  return `${VERSION_OF_REPOSITORY}-${fingerprint.digest("hex").slice(0, 12)}`;
}

// Pose le marketplace de l'app dans `dossier` : ses deux manifestes et les deux commandes copiées de
// `commandes`. Un fichier déjà tel quel n'est pas réécrit.
export function setTheMarketplace(folder: string, commands: string, version: string): void {
  const manifests = join(folder, ".claude-plugin");
  const marketplace = {
    name: MARKETPLACE,
    description: "The brigade app's commands, installed by the app in the projects it opens",
    owner: { name: "benomite" },
    plugins: [{ name: PLUGIN, source: "./", version, description: "/brigade:dev and /brigade:ask, nothing else" }],
  };
  const plugin = {
    name: SPACE,
    version,
    description: "/brigade:dev <number> and /brigade:ask <number>, installed by the brigade app",
    author: { name: "benomite" },
    license: "MIT",
    homepage: "https://github.com/benomite/brigade",
    commands: COMMANDS.map((name) => `./commands/${name}`),
  };
  write(join(manifests, "marketplace.json"), `${JSON.stringify(marketplace, null, 2)}\n`);
  write(join(manifests, "plugin.json"), `${JSON.stringify(plugin, null, 2)}\n`);
  for (const name of COMMANDS) write(join(folder, "commands", name), readFileSync(join(commands, name), "utf8"));
}

function write(path: string, content: string): void {
  try {
    if (readFileSync(path, "utf8") === content) return;
  } catch {}
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, content);
}

export type Rendered = { code: number | null; sortie: string; erreur: string };
// Lance une commande dans un dossier (ou celui de l'app) : `claude` ou `git`.
export type Launch = (command: string, args: readonly string[], folder?: string) => Promise<Rendered>;

export const launchReally =
  (env: Record<string, string | undefined>, delayMs = 60_000): Launch =>
  (command, args, folder) =>
    new Promise((settle) => {
      // Rien ne lui sera tapé : son entrée est fermée, une question n'attend pas jusqu'au délai.
      const child = execFile(command, [...args], { cwd: folder, env, timeout: delayMs, windowsHide: true, encoding: "utf8", maxBuffer: 4 * 1024 * 1024 }, (error, output, outputError) => {
        const code = error === null ? 0 : typeof error.code === "number" ? error.code : null;
        settle({ code, sortie: output ?? "", erreur: `${outputError ?? ""}${error !== null && code === null ? error.message : ""}` });
      });
      child.stdin?.end();
    });

// Une installation du plugin, telle que `claude plugin list --json` la rend.
type Installation = { id?: unknown; scope?: unknown; version?: unknown; projectPath?: unknown };

export type OptionsPluginApp = {
  lancer: Launch;
  claude: string;
  git?: string;
  // Le dossier où poser le marketplace (`DOSSIER`, à côté du fichier des projets).
  marketplace: string;
  // Le dossier des commandes que l'app porte.
  commandes: string;
  versionDeLApp: string;
  // Ce que l'app dit de ce qu'elle a fait, ou pas, pour le terminal qui l'a lancée.
  dire: (line: string) => void;
};

export function holdThePluginApp(options: OptionsPluginApp) {
  const git = options.git ?? "git";
  const claude = (args: readonly string[], folder?: string) => options.lancer(options.claude, ["plugin", ...args], folder);
  // Les dossiers déjà à jour pendant ce lancement de l'app.
  const facts = new Set<string>();
  let declare: string | undefined;
  let file: Promise<unknown> = Promise.resolve();
  const inFile = <T>(task: () => Promise<T>): Promise<T> => {
    const suite = file.then(task);
    file = suite.catch(() => {});
    return suite;
  };
  const reason = ({ code, sortie: output, erreur: error }: Rendered) => (error.trim() || output.trim()).split("\n").at(-1)?.trim() || `code ${code}`;

  // Le marketplace de l'app, posé à la version portée et déclaré ; rend sa version, ou rien s'il ne l'est pas.
  async function marketplace(): Promise<string | undefined> {
    let version: string;
    try {
      version = versionOfPlugin(options.versionDeLApp, options.commandes);
      setTheMarketplace(options.marketplace, options.commandes, version);
    } catch (error) {
      options.dire(`brigade: the app's plugin was not prepared — ${(error as Error).message}`);
      return undefined;
    }
    if (declare === version) return version;
    const addition = await claude(["marketplace", "add", options.marketplace]);
    if (addition.code !== 0) {
      options.dire(`brigade: the app's plugin marketplace was not added to Claude Code — ${reason(addition)}`);
      return undefined;
    }
    declare = version;
    return version;
  }

  // Les installations locales du plugin, par dossier (chemin réel), ou rien si la liste ne se lit pas.
  async function installations(): Promise<Map<string, string> | undefined> {
    const list = await claude(["list", "--json"]);
    let readEntries: unknown;
    try {
      readEntries = list.code === 0 ? JSON.parse(list.sortie) : undefined;
    } catch {}
    if (!Array.isArray(readEntries)) {
      options.dire(`brigade: Claude Code's plugins were not read — ${reason(list)}`);
      return undefined;
    }
    const byFolder = new Map<string, string>();
    for (const { id, scope, version, projectPath } of readEntries as Installation[]) {
      if (id === ID && scope === "local" && typeof projectPath === "string") byFolder.set(real(projectPath), typeof version === "string" ? version : "");
    }
    return byFolder;
  }

  // Que git ignore `.claude/settings.local.json` dans ce dossier : par l'`info/exclude` du clone,
  // qui ne se commite pas, quand rien ne l'ignore déjà. Hors d'un dépôt git, rien à faire.
  async function ignorer(folder: string): Promise<void> {
    const prefix = await options.lancer(git, ["rev-parse", "--show-prefix"], folder);
    if (prefix.code !== 0) return;
    if ((await options.lancer(git, ["check-ignore", "-q", SETTINGS_LOCAL], folder)).code === 0) return;
    const exclude = await options.lancer(git, ["rev-parse", "--git-path", "info/exclude"], folder);
    if (exclude.code !== 0) return;
    const path = resolve(folder, exclude.sortie.trim());
    let before = "";
    try {
      before = readFileSync(path, "utf8");
    } catch {}
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, `${before}${before === "" || before.endsWith("\n") ? "" : "\n"}# Claude Code's local settings, where the brigade app enables its plugin\n/${prefix.sortie.trim()}${SETTINGS_LOCAL}\n`);
  }

  return {
    // Les projets ouverts par l'app : chacun reçoit le plugin à la version portée, s'il ne l'a pas déjà.
    suivre(projects: readonly Project[]): Promise<void> {
      return inFile(async () => {
        const openOnes = projects.filter(({ refus: refusal, dossier: folder }) => refusal === undefined && existsSync(folder) && !facts.has(real(folder)));
        if (openOnes.length === 0) return;
        const version = await marketplace();
        if (version === undefined) return;
        const installed = await installations();
        if (installed === undefined) return;
        for (const { nom: name, dossier: folder } of openOnes) {
          const here = real(folder);
          const installedOne = installed.get(here);
          if (installedOne === version) {
            facts.add(here);
            continue;
          }
          try {
            await ignorer(folder);
          } catch (error) {
            options.dire(`brigade: the app's plugin is not installed in “${name}” — git could not be told to ignore ${SETTINGS_LOCAL} (${(error as Error).message})`);
            continue;
          }
          const action = installedOne === undefined ? ["install", ID, "--scope", "local"] : ["update", ID, "--scope", "local"];
          const rendered = await claude(action, folder);
          if (rendered.code === 0) facts.add(here);
          else options.dire(`brigade: the app's plugin was not ${installedOne === undefined ? "installed" : "updated"} in “${name}” — ${reason(rendered)}`);
        }
      });
    },

    // Un projet retiré de l'app : `brigade-app` quitte le scope local de son dossier, et rien d'autre.
    retirer({ nom: name, dossier: folder }: Pick<Project, "nom" | "dossier">): Promise<void> {
      return inFile(async () => {
        const here = real(folder);
        facts.delete(here);
        const installed = await installations();
        if (installed === undefined || !installed.has(here)) return;
        const rendered = await claude(["uninstall", ID, "--scope", "local"], folder);
        if (rendered.code !== 0) options.dire(`brigade: the app's plugin was not uninstalled from “${name}” — ${reason(rendered)}`);
      });
    },
  };
}

export type PluginApp = ReturnType<typeof holdThePluginApp>;

// L'app lancée avec un `claude` de remplacement (`BRIGADE_CLAUDE_BIN`, un essai) : le plugin n'est posé ni retiré
// nulle part, et l'app le dit une fois.
export function withoutPluginApp(tell: (line: string) => void): PluginApp {
  tell("brigade: BRIGADE_CLAUDE_BIN is set — the app's plugin (/brigade:dev, /brigade:ask) is installed in no project");
  return { suivre: async () => {}, retirer: async () => {} };
}

function real(path: string): string {
  try {
    return realpathSync(path);
  } catch {
    return resolve(path);
  }
}
