// Le plugin de l'app (#2160) : dans chaque projet que l'app ouvre, `/brigade:dev <numéro>`,
// `/brigade:ask <numéro>` et `/brigade:init` répondent dans toute session Claude Code de son dossier
// — les onglets de l'app comme un terminal à part —, sans rien installer à la main. Ces trois
// commandes, et elles seules : aucun rôle V1 (`po`, `manager`, `designer`, `sync`), aucun agent —
// l'app et les stations les remplacent.
//
// `/brigade:init` n'est pas celui du plugin V1 (`commands/init.md`, box et marketplace V1) : c'est
// celui de l'app (#2595), `plugin/init.md` à côté de ce module, sur le seul chemin GitHub, et le
// script qui écrit pour lui (`plugin/init.sh`), posé dans le marketplace sous `scripts/`. Il quitte
// le plugin quand l'ajout d'un projet prépare le dépôt d'un geste (#2584) — pas avant.
//
// Le mécanisme est celui de Claude Code lui-même :
// - **un marketplace à l'app**, `brigade-app`, que l'app pose à côté du fichier des projets
//   (`~/.config/brigade/plugin-app/`) depuis les commandes qu'elle porte — `commands/dev.md` et
//   `commands/ask.md` du dépôt, ou leur copie dans son paquet (emplacements.ts). Il est déclaré une
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
import { chmodSync, existsSync, mkdirSync, readFileSync, realpathSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import type { Project } from "./config.ts";

export const MARKETPLACE = "brigade-app";
export const PLUGIN = "brigade-app";
export const ID = `${PLUGIN}@${MARKETPLACE}`;
// Le nom du manifeste : celui sous lequel les commandes se tapent, `/brigade:dev`.
export const SPACE = "brigade";
// Les commandes du plugin copiées de `commands/` du dépôt.
export const COMMANDS = ["dev.md", "ask.md"] as const;
// Les commandes que l'app porte elle-même, dans `PROPRES` (#2595).
export const COMMANDS_DE_L_APP = ["init.md"] as const;
// Le dossier de ce que l'app porte elle-même : il est dans `src/`, que le paquet porte entier.
export const PROPRES = join(import.meta.dirname, "plugin");
// Le script de `/brigade:init`, posé dans le marketplace sous `scripts/` ; la commande le nomme par
// `@SCRIPT@`, remplacé à la pose par son chemin.
export const SCRIPT_INIT = "init.sh";
// Le catalogue des labels que le script lit, posé à côté de lui.
export const CATALOGUE_DES_LABELS = "labels.tsv";
const MARQUE_DU_SCRIPT = "@SCRIPT@";
// La commande du runtime qui lance ce script, pose la carte de sa PR dans le TODO et rend le mot de fin du second
// (runtime/src/second-init/pr-de-setup.ts, #3169), et le `node` qui la joue : `@SETUP_PR@` et `@NODE@`, remplacés de même.
const MARQUE_DE_LA_PR = "@SETUP_PR@";
const MARQUE_DU_NODE = "@NODE@";
export const PR_DE_SETUP = ["src", "second-init", "pr-de-setup.ts"] as const;
// Où sont le runtime et son `node` (emplacements.ts) ; par défaut, le runtime à côté de l'app et le `node` du PATH.
export type Lieux = { node: string; runtime: string };
export const LIEUX_PAR_DEFAUT: Lieux = { node: "node", runtime: join(import.meta.dirname, "..", "..", "runtime") };
// Le dossier du marketplace, à côté du fichier des projets.
export const DOSSIER = "plugin-app";
// Le fichier que Claude Code écrit dans le dossier du projet pour le scope local.
export const SETTINGS_LOCAUX = ".claude/settings.local.json";
// La version que l'app se donne quand elle tourne depuis son dépôt (son package.json).
const VERSION_DU_REPOSITORY = "0.0.0";

// La version du plugin que l'app porte : la sienne, installée ; depuis le dépôt, l'empreinte des
// commandes — une commande changée change la version, et les projets se mettent à jour.
export function versionDuPlugin(versionDeLApp: string, commands: string, propres = PROPRES): string {
  if (versionDeLApp !== VERSION_DU_REPOSITORY) return versionDeLApp;
  const empreinte = createHash("sha256");
  for (const name of COMMANDS) empreinte.update(name).update("\0").update(readFileSync(join(commands, name))).update("\0");
  for (const name of [...COMMANDS_DE_L_APP, SCRIPT_INIT, CATALOGUE_DES_LABELS]) empreinte.update(name).update("\0").update(readFileSync(join(propres, name))).update("\0");
  return `${VERSION_DU_REPOSITORY}-${empreinte.digest("hex").slice(0, 12)}`;
}

// Pose le marketplace de l'app dans `dossier` : ses deux manifestes, les deux commandes copiées de
// `commandes`, `/brigade:init` et son script copiés de `propres`. Un fichier déjà tel quel n'est pas réécrit.
export function poserLeMarketplace(dossier: string, commands: string, version: string, propres = PROPRES, lieux: Lieux = LIEUX_PAR_DEFAUT): void {
  const manifestes = join(dossier, ".claude-plugin");
  const marketplace = {
    name: MARKETPLACE,
    description: "The brigade app's commands, installed by the app in the projects it opens",
    owner: { name: "benomite" },
    plugins: [{ name: PLUGIN, source: "./", version, description: "/brigade:dev, /brigade:ask and /brigade:init, nothing else" }],
  };
  const plugin = {
    name: SPACE,
    version,
    description: "/brigade:dev <number>, /brigade:ask <number> and /brigade:init, installed by the brigade app",
    author: { name: "benomite" },
    license: "MIT",
    homepage: "https://github.com/benomite/brigade",
    commands: [...COMMANDS, ...COMMANDS_DE_L_APP].map((name) => `./commands/${name}`),
  };
  ecrire(join(manifestes, "marketplace.json"), `${JSON.stringify(marketplace, null, 2)}\n`);
  ecrire(join(manifestes, "plugin.json"), `${JSON.stringify(plugin, null, 2)}\n`);
  for (const name of COMMANDS) ecrire(join(dossier, "commands", name), readFileSync(join(commands, name), "utf8"));
  // Le chemin du script, en barres obliques : la commande le passe à `bash`, Git Bash compris.
  const script = join(dossier, "scripts", SCRIPT_INIT);
  ecrire(script, readFileSync(join(propres, SCRIPT_INIT), "utf8"));
  chmodSync(script, 0o755);
  ecrire(join(dossier, "scripts", CATALOGUE_DES_LABELS), readFileSync(join(propres, CATALOGUE_DES_LABELS), "utf8"));
  const prDeSetup = join(lieux.runtime, ...PR_DE_SETUP);
  for (const name of COMMANDS_DE_L_APP)
    ecrire(
      join(dossier, "commands", name),
      readFileSync(join(propres, name), "utf8").replaceAll(MARQUE_DU_SCRIPT, script.replaceAll("\\", "/")).replaceAll(MARQUE_DE_LA_PR, prDeSetup.replaceAll("\\", "/")).replaceAll(MARQUE_DU_NODE, lieux.node.replaceAll("\\", "/")),
    );
}

function ecrire(chemin: string, contenu: string): void {
  try {
    if (readFileSync(chemin, "utf8") === contenu) return;
  } catch {}
  mkdirSync(dirname(chemin), { recursive: true });
  writeFileSync(chemin, contenu);
}

export type Rendu = { code: number | null; sortie: string; erreur: string };
// Lance une commande dans un dossier (ou celui de l'app) : `claude` ou `git`.
export type Lancer = (command: string, args: readonly string[], dossier?: string) => Promise<Rendu>;

export const lancerVraiment =
  (env: Record<string, string | undefined>, delayMs = 60_000): Lancer =>
  (command, args, dossier) =>
    new Promise((resoudre) => {
      // Rien ne lui sera tapé : son entrée est fermée, une question n'attend pas jusqu'au délai.
      const enfant = execFile(command, [...args], { cwd: dossier, env, timeout: delayMs, windowsHide: true, encoding: "utf8", maxBuffer: 4 * 1024 * 1024 }, (error, sortie, sortieError) => {
        const code = error === null ? 0 : typeof error.code === "number" ? error.code : null;
        resoudre({ code, sortie: sortie ?? "", erreur: `${sortieError ?? ""}${error !== null && code === null ? error.message : ""}` });
      });
      enfant.stdin?.end();
    });

// Une installation du plugin, telle que `claude plugin list --json` la rend.
type Installation = { id?: unknown; scope?: unknown; version?: unknown; projectPath?: unknown };

export type OptionsPluginApp = {
  lancer: Lancer;
  claude: string;
  git?: string;
  // Le dossier où poser le marketplace (`DOSSIER`, à côté du fichier des projets).
  marketplace: string;
  // Le dossier des commandes que l'app porte.
  commandes: string;
  versionDeLApp: string;
  // Le runtime et son `node`, que `/brigade:init` lance pour finir (#3169).
  lieux?: Lieux;
  // Ce que l'app dit de ce qu'elle a fait, ou pas, pour le terminal qui l'a lancée.
  dire: (line: string) => void;
};

export function holdLePluginApp(options: OptionsPluginApp) {
  const git = options.git ?? "git";
  const claude = (args: readonly string[], dossier?: string) => options.lancer(options.claude, ["plugin", ...args], dossier);
  // Les dossiers déjà à jour pendant ce lancement de l'app.
  const facts = new Set<string>();
  let declare: string | undefined;
  let file: Promise<unknown> = Promise.resolve();
  const enFile = <T>(tache: () => Promise<T>): Promise<T> => {
    const suite = file.then(tache);
    file = suite.catch(() => {});
    return suite;
  };
  const raison = ({ code, sortie, erreur: error }: Rendu) => (error.trim() || sortie.trim()).split("\n").at(-1)?.trim() || `code ${code}`;

  // Le marketplace de l'app, posé à la version portée et déclaré ; rend sa version, ou rien s'il ne l'est pas.
  async function marketplace(): Promise<string | undefined> {
    let version: string;
    try {
      version = versionDuPlugin(options.versionDeLApp, options.commandes);
      poserLeMarketplace(options.marketplace, options.commandes, version, PROPRES, options.lieux);
    } catch (error) {
      options.dire(`brigade: the app's plugin was not prepared — ${(error as Error).message}`);
      return undefined;
    }
    if (declare === version) return version;
    const addition = await claude(["marketplace", "add", options.marketplace]);
    if (addition.code !== 0) {
      options.dire(`brigade: the app's plugin marketplace was not added to Claude Code — ${raison(addition)}`);
      return undefined;
    }
    declare = version;
    return version;
  }

  // Les installations locales du plugin, par dossier (chemin réel), ou rien si la liste ne se lit pas.
  async function installations(): Promise<Map<string, string> | undefined> {
    const liste = await claude(["list", "--json"]);
    let lues: unknown;
    try {
      lues = liste.code === 0 ? JSON.parse(liste.sortie) : undefined;
    } catch {}
    if (!Array.isArray(lues)) {
      options.dire(`brigade: Claude Code's plugins were not read — ${raison(liste)}`);
      return undefined;
    }
    const parDossier = new Map<string, string>();
    for (const { id, scope, version, projectPath } of lues as Installation[]) {
      if (id === ID && scope === "local" && typeof projectPath === "string") parDossier.set(reel(projectPath), typeof version === "string" ? version : "");
    }
    return parDossier;
  }

  // Que git ignore `.claude/settings.local.json` dans ce dossier : par l'`info/exclude` du clone,
  // qui ne se commite pas, quand rien ne l'ignore déjà. Hors d'un dépôt git, rien à faire.
  async function ignorer(dossier: string): Promise<void> {
    const prefixe = await options.lancer(git, ["rev-parse", "--show-prefix"], dossier);
    if (prefixe.code !== 0) return;
    if ((await options.lancer(git, ["check-ignore", "-q", SETTINGS_LOCAUX], dossier)).code === 0) return;
    const exclude = await options.lancer(git, ["rev-parse", "--git-path", "info/exclude"], dossier);
    if (exclude.code !== 0) return;
    const chemin = resolve(dossier, exclude.sortie.trim());
    let avant = "";
    try {
      avant = readFileSync(chemin, "utf8");
    } catch {}
    mkdirSync(dirname(chemin), { recursive: true });
    writeFileSync(chemin, `${avant}${avant === "" || avant.endsWith("\n") ? "" : "\n"}# Claude Code's local settings, where the brigade app enables its plugin\n/${prefixe.sortie.trim()}${SETTINGS_LOCAUX}\n`);
  }

  return {
    // Les projets ouverts par l'app : chacun reçoit le plugin à la version portée, s'il ne l'a pas déjà.
    suivre(projects: readonly Project[]): Promise<void> {
      return enFile(async () => {
        const ouverts = projects.filter(({ refus: refusal, dossier }) => refusal === undefined && existsSync(dossier) && !facts.has(reel(dossier)));
        if (ouverts.length === 0) return;
        const version = await marketplace();
        if (version === undefined) return;
        const installes = await installations();
        if (installes === undefined) return;
        for (const { nom: name, dossier } of ouverts) {
          const ici = reel(dossier);
          const installee = installes.get(ici);
          if (installee === version) {
            facts.add(ici);
            continue;
          }
          try {
            await ignorer(dossier);
          } catch (error) {
            options.dire(`brigade: the app's plugin is not installed in “${name}” — git could not be told to ignore ${SETTINGS_LOCAUX} (${(error as Error).message})`);
            continue;
          }
          const action = installee === undefined ? ["install", ID, "--scope", "local"] : ["update", ID, "--scope", "local"];
          const rendu = await claude(action, dossier);
          if (rendu.code === 0) facts.add(ici);
          else options.dire(`brigade: the app's plugin was not ${installee === undefined ? "installed" : "updated"} in “${name}” — ${raison(rendu)}`);
        }
      });
    },

    // Un projet retiré de l'app : `brigade-app` quitte le scope local de son dossier, et rien d'autre.
    retirer({ nom: name, dossier }: Pick<Project, "nom" | "dossier">): Promise<void> {
      return enFile(async () => {
        const ici = reel(dossier);
        facts.delete(ici);
        const installes = await installations();
        if (installes === undefined || !installes.has(ici)) return;
        const rendu = await claude(["uninstall", ID, "--scope", "local"], dossier);
        if (rendu.code !== 0) options.dire(`brigade: the app's plugin was not uninstalled from “${name}” — ${raison(rendu)}`);
      });
    },
  };
}

export type PluginApp = ReturnType<typeof holdLePluginApp>;

// L'app lancée avec un `claude` de remplacement (`BRIGADE_CLAUDE_BIN`, un essai) : le plugin n'est posé ni retiré
// nulle part, et l'app le dit une fois.
export function sansPluginApp(tell: (line: string) => void): PluginApp {
  tell("brigade: BRIGADE_CLAUDE_BIN is set — the app's plugin (/brigade:dev, /brigade:ask, /brigade:init) is installed in no project");
  return { suivre: async () => {}, retirer: async () => {} };
}

function reel(chemin: string): string {
  try {
    return realpathSync(chemin);
  } catch {
    return resolve(chemin);
  }
}
