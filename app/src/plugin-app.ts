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
import type { Projet } from "./config.ts";

export const MARKETPLACE = "brigade-app";
export const PLUGIN = "brigade-app";
export const ID = `${PLUGIN}@${MARKETPLACE}`;
// Le nom du manifeste : celui sous lequel les commandes se tapent, `/brigade:dev`.
export const ESPACE = "brigade";
// Les commandes du plugin copiées de `commands/` du dépôt.
export const COMMANDES = ["dev.md", "ask.md"] as const;
// Les commandes que l'app porte elle-même, dans `PROPRES` (#2595).
export const COMMANDES_DE_L_APP = ["init.md"] as const;
// Le dossier de ce que l'app porte elle-même : il est dans `src/`, que le paquet porte entier.
export const PROPRES = join(import.meta.dirname, "plugin");
// Le script de `/brigade:init`, posé dans le marketplace sous `scripts/` ; la commande le nomme par
// `@SCRIPT@`, remplacé à la pose par son chemin.
export const SCRIPT_INIT = "init.sh";
// Le catalogue des labels que le script lit, posé à côté de lui.
export const CATALOGUE_DES_LABELS = "labels.tsv";
const MARQUE_DU_SCRIPT = "@SCRIPT@";
// Le dossier du marketplace, à côté du fichier des projets.
export const DOSSIER = "plugin-app";
// Le fichier que Claude Code écrit dans le dossier du projet pour le scope local.
export const REGLAGES_LOCAUX = ".claude/settings.local.json";
// La version que l'app se donne quand elle tourne depuis son dépôt (son package.json).
const VERSION_DU_DEPOT = "0.0.0";

// La version du plugin que l'app porte : la sienne, installée ; depuis le dépôt, l'empreinte des
// commandes — une commande changée change la version, et les projets se mettent à jour.
export function versionDuPlugin(versionDeLApp: string, commandes: string, propres = PROPRES): string {
  if (versionDeLApp !== VERSION_DU_DEPOT) return versionDeLApp;
  const empreinte = createHash("sha256");
  for (const nom of COMMANDES) empreinte.update(nom).update("\0").update(readFileSync(join(commandes, nom))).update("\0");
  for (const nom of [...COMMANDES_DE_L_APP, SCRIPT_INIT, CATALOGUE_DES_LABELS]) empreinte.update(nom).update("\0").update(readFileSync(join(propres, nom))).update("\0");
  return `${VERSION_DU_DEPOT}-${empreinte.digest("hex").slice(0, 12)}`;
}

// Pose le marketplace de l'app dans `dossier` : ses deux manifestes, les deux commandes copiées de
// `commandes`, `/brigade:init` et son script copiés de `propres`. Un fichier déjà tel quel n'est pas réécrit.
export function poserLeMarketplace(dossier: string, commandes: string, version: string, propres = PROPRES): void {
  const manifestes = join(dossier, ".claude-plugin");
  const marketplace = {
    name: MARKETPLACE,
    description: "The brigade app's commands, installed by the app in the projects it opens",
    owner: { name: "benomite" },
    plugins: [{ name: PLUGIN, source: "./", version, description: "/brigade:dev, /brigade:ask and /brigade:init, nothing else" }],
  };
  const plugin = {
    name: ESPACE,
    version,
    description: "/brigade:dev <number>, /brigade:ask <number> and /brigade:init, installed by the brigade app",
    author: { name: "benomite" },
    license: "MIT",
    homepage: "https://github.com/benomite/brigade",
    commands: [...COMMANDES, ...COMMANDES_DE_L_APP].map((nom) => `./commands/${nom}`),
  };
  ecrire(join(manifestes, "marketplace.json"), `${JSON.stringify(marketplace, null, 2)}\n`);
  ecrire(join(manifestes, "plugin.json"), `${JSON.stringify(plugin, null, 2)}\n`);
  for (const nom of COMMANDES) ecrire(join(dossier, "commands", nom), readFileSync(join(commandes, nom), "utf8"));
  // Le chemin du script, en barres obliques : la commande le passe à `bash`, Git Bash compris.
  const script = join(dossier, "scripts", SCRIPT_INIT);
  ecrire(script, readFileSync(join(propres, SCRIPT_INIT), "utf8"));
  chmodSync(script, 0o755);
  ecrire(join(dossier, "scripts", CATALOGUE_DES_LABELS), readFileSync(join(propres, CATALOGUE_DES_LABELS), "utf8"));
  for (const nom of COMMANDES_DE_L_APP) ecrire(join(dossier, "commands", nom), readFileSync(join(propres, nom), "utf8").replaceAll(MARQUE_DU_SCRIPT, script.replaceAll("\\", "/")));
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
export type Lancer = (commande: string, args: readonly string[], dossier?: string) => Promise<Rendu>;

export const lancerVraiment =
  (env: Record<string, string | undefined>, delaiMs = 60_000): Lancer =>
  (commande, args, dossier) =>
    new Promise((resoudre) => {
      // Rien ne lui sera tapé : son entrée est fermée, une question n'attend pas jusqu'au délai.
      const enfant = execFile(commande, [...args], { cwd: dossier, env, timeout: delaiMs, windowsHide: true, encoding: "utf8", maxBuffer: 4 * 1024 * 1024 }, (erreur, sortie, sortieErreur) => {
        const code = erreur === null ? 0 : typeof erreur.code === "number" ? erreur.code : null;
        resoudre({ code, sortie: sortie ?? "", erreur: `${sortieErreur ?? ""}${erreur !== null && code === null ? erreur.message : ""}` });
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
  // Ce que l'app dit de ce qu'elle a fait, ou pas, pour le terminal qui l'a lancée.
  dire: (ligne: string) => void;
};

export function tenirLePluginApp(options: OptionsPluginApp) {
  const git = options.git ?? "git";
  const claude = (args: readonly string[], dossier?: string) => options.lancer(options.claude, ["plugin", ...args], dossier);
  // Les dossiers déjà à jour pendant ce lancement de l'app.
  const faits = new Set<string>();
  let declare: string | undefined;
  let file: Promise<unknown> = Promise.resolve();
  const enFile = <T>(tache: () => Promise<T>): Promise<T> => {
    const suite = file.then(tache);
    file = suite.catch(() => {});
    return suite;
  };
  const raison = ({ code, sortie, erreur }: Rendu) => (erreur.trim() || sortie.trim()).split("\n").at(-1)?.trim() || `code ${code}`;

  // Le marketplace de l'app, posé à la version portée et déclaré ; rend sa version, ou rien s'il ne l'est pas.
  async function marketplace(): Promise<string | undefined> {
    let version: string;
    try {
      version = versionDuPlugin(options.versionDeLApp, options.commandes);
      poserLeMarketplace(options.marketplace, options.commandes, version);
    } catch (erreur) {
      options.dire(`brigade: the app's plugin was not prepared — ${(erreur as Error).message}`);
      return undefined;
    }
    if (declare === version) return version;
    const ajout = await claude(["marketplace", "add", options.marketplace]);
    if (ajout.code !== 0) {
      options.dire(`brigade: the app's plugin marketplace was not added to Claude Code — ${raison(ajout)}`);
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
    if ((await options.lancer(git, ["check-ignore", "-q", REGLAGES_LOCAUX], dossier)).code === 0) return;
    const exclude = await options.lancer(git, ["rev-parse", "--git-path", "info/exclude"], dossier);
    if (exclude.code !== 0) return;
    const chemin = resolve(dossier, exclude.sortie.trim());
    let avant = "";
    try {
      avant = readFileSync(chemin, "utf8");
    } catch {}
    mkdirSync(dirname(chemin), { recursive: true });
    writeFileSync(chemin, `${avant}${avant === "" || avant.endsWith("\n") ? "" : "\n"}# Claude Code's local settings, where the brigade app enables its plugin\n/${prefixe.sortie.trim()}${REGLAGES_LOCAUX}\n`);
  }

  return {
    // Les projets ouverts par l'app : chacun reçoit le plugin à la version portée, s'il ne l'a pas déjà.
    suivre(projets: readonly Projet[]): Promise<void> {
      return enFile(async () => {
        const ouverts = projets.filter(({ refus, dossier }) => refus === undefined && existsSync(dossier) && !faits.has(reel(dossier)));
        if (ouverts.length === 0) return;
        const version = await marketplace();
        if (version === undefined) return;
        const installes = await installations();
        if (installes === undefined) return;
        for (const { nom, dossier } of ouverts) {
          const ici = reel(dossier);
          const installee = installes.get(ici);
          if (installee === version) {
            faits.add(ici);
            continue;
          }
          try {
            await ignorer(dossier);
          } catch (erreur) {
            options.dire(`brigade: the app's plugin is not installed in “${nom}” — git could not be told to ignore ${REGLAGES_LOCAUX} (${(erreur as Error).message})`);
            continue;
          }
          const geste = installee === undefined ? ["install", ID, "--scope", "local"] : ["update", ID, "--scope", "local"];
          const rendu = await claude(geste, dossier);
          if (rendu.code === 0) faits.add(ici);
          else options.dire(`brigade: the app's plugin was not ${installee === undefined ? "installed" : "updated"} in “${nom}” — ${raison(rendu)}`);
        }
      });
    },

    // Un projet retiré de l'app : `brigade-app` quitte le scope local de son dossier, et rien d'autre.
    retirer({ nom, dossier }: Pick<Projet, "nom" | "dossier">): Promise<void> {
      return enFile(async () => {
        const ici = reel(dossier);
        faits.delete(ici);
        const installes = await installations();
        if (installes === undefined || !installes.has(ici)) return;
        const rendu = await claude(["uninstall", ID, "--scope", "local"], dossier);
        if (rendu.code !== 0) options.dire(`brigade: the app's plugin was not uninstalled from “${nom}” — ${raison(rendu)}`);
      });
    },
  };
}

export type PluginApp = ReturnType<typeof tenirLePluginApp>;

// L'app lancée avec un `claude` de remplacement (`BRIGADE_CLAUDE_BIN`, un essai) : le plugin n'est posé ni retiré
// nulle part, et l'app le dit une fois.
export function sansPluginApp(dire: (ligne: string) => void): PluginApp {
  dire("brigade: BRIGADE_CLAUDE_BIN is set — the app's plugin (/brigade:dev, /brigade:ask, /brigade:init) is installed in no project");
  return { suivre: async () => {}, retirer: async () => {} };
}

function reel(chemin: string): string {
  try {
    return realpathSync(chemin);
  } catch {
    return resolve(chemin);
  }
}
