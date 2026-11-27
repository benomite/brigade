// Où l'app trouve ce qu'elle lance hors d'elle : le runtime de la station de la machine, le
// `node` qui le joue, et le clone de son propre code. Deux façons d'être lancée, et seulement
// deux :
//
// - **Depuis le dépôt** (`npm --prefix app start`) : le runtime est à côté de l'app dans son
//   clone, et le `node` est celui qui a joué `npm start` — Electron n'en est pas un. L'app lit le
//   retard de son clone, et se met à jour par lui (delay.ts, catch-up.ts).
// - **Installée** (le .dmg, app/packaging/) : tout est dans le paquet de l'app —
//   `Contents/Resources/` porte l'app (`app/`), le runtime (`runtime/`), le `node` qui le joue
//   (`node/bin/brigade-node`) et les commandes du plugin de l'app (`plugin/commands/`). Il n'y a ni clone, ni `node`, ni `npm` à chercher sur la machine : rien
//   ne s'y lit du retard d'un clone, rien ne s'y met à jour par `git`.
//
// Ouverte depuis le Finder, une app ne reçoit pas le PATH du chef : seulement celui du système.
// `claude`, `gh` — et le `git` d'Homebrew — n'y sont pas, et la station n'y cuirait rien. L'app
// installée prend donc le PATH du shell de connexion du chef, comme un terminal l'aurait, et y
// ajoute le dossier de son `node` : ce que la station lance trouve un `node` même sur une machine
// qui n'en a pas.
//
// Le fichier des projets et le répertoire de la station ne dépendent pas de cette façon : ce
// sont ceux de `~/.config/brigade/`, quelle que soit l'app qui les lit (config.ts).
import { spawnSync } from "node:child_process";
import { realpathSync } from "node:fs";
import { delimiter, join, resolve } from "node:path";

export type Locations = {
  // `installee` : l'app du .dmg, `depot` : celle du clone.
  facon: "depot" | "installee";
  // Le dossier du runtime : son point d'entrée de station, la cuisine, y est sous `src/kitchen/main.ts`.
  runtime: string;
  // Le `node` qui joue la station.
  node: string;
  // Le dossier de l'app dans son clone, dont le retard se lit ; aucun pour l'app installée.
  clone: string | undefined;
  // Le dossier des commandes que l'app installe dans les projets qu'elle ouvre (plugin-app.ts) :
  // `commands/` du dépôt, ou leur copie dans le paquet.
  commandes: string;
};

export type OptionsLocations = {
  // `process.resourcesPath` d'Electron : le `Contents/Resources` du paquet qui joue l'app.
  ressources: string;
  // Le dossier des sources de l'app (`app/src`), là où tourne son process principal.
  src: string;
  env: Record<string, string | undefined>;
  // Le vrai chemin d'un dossier, liens résolus.
  reel?: (path: string) => string;
};

// Ce que le paquet de l'app porte, sous `Contents/Resources` : la forme qu'écrit app/packaging/.
export const APP_OF_PACKAGE = "app";
export const RUNTIME_OF_PACKAGE = "runtime";
export const NODE_OF_PACKAGE = join("node", "bin", "brigade-node");
// Les commandes du plugin de l'app (plugin-app.ts), copiées de `commands/` du dépôt.
export const COMMANDS_OF_PACKAGE = join("plugin", "commands");

// L'app est installée quand ses sources sont celles du paquet qui la joue : `Resources/app/src`.
// Depuis le dépôt, Electron est celui de `app/node_modules`, et les sources sont à côté. Ce n'est
// pas `app.isPackaged` : Electron le dit faux depuis le dépôt, où l'exécutable s'appelle `electron`.
export function isInstalled(options: Pick<OptionsLocations, "ressources" | "src" | "reel">): boolean {
  const real = (path: string) => {
    try {
      return (options.reel ?? realpathSync)(path);
    } catch {
      return resolve(path);
    }
  };
  return real(options.src) === real(join(options.ressources, APP_OF_PACKAGE, "src"));
}

export function locationsOf(options: OptionsLocations): Locations {
  const { env } = options;
  if (isInstalled(options)) {
    return {
      facon: "installee",
      runtime: join(options.ressources, RUNTIME_OF_PACKAGE),
      // Une doublure pour les essais, comme depuis le dépôt ; sinon celui du paquet, jamais celui de la machine.
      node: env.BRIGADE_NODE_BIN || join(options.ressources, NODE_OF_PACKAGE),
      clone: undefined,
      commandes: join(options.ressources, COMMANDS_OF_PACKAGE),
    };
  }
  return {
    facon: "depot",
    runtime: join(options.src, "..", "..", "runtime"),
    // Le `node` de `npm start` : Electron n'en est pas un.
    node: env.BRIGADE_NODE_BIN || env.npm_node_execpath || "node",
    clone: join(options.src, ".."),
    commandes: join(options.src, "..", "..", "commands"),
  };
}

// Là où un Mac pose `claude`, `gh` et `git` quand le shell de connexion ne les a pas dits :
// Homebrew sur Apple Silicon, puis sur Intel, puis l'installation de `claude` dans le dossier du chef.
// Sous Windows, `gh` et `git` s'installent dans le PATH du compte, que l'app reçoit : seul reste le
// dossier où l'installeur de `claude` le pose.
export const PATHS_KNOWN = (home: string, platform: string): string[] =>
  platform === "win32" ? [join(home, ".local", "bin")] : ["/opt/homebrew/bin", "/opt/homebrew/sbin", "/usr/local/bin", join(home, ".local", "bin"), join(home, ".claude", "local")];

export type OptionsPath = {
  emplacements: Locations;
  env: Record<string, string | undefined>;
  maison: string;
  plateforme: string;
  // Le PATH du shell de connexion du chef, ou rien s'il ne s'est pas lu.
  duShell(): string | undefined;
};

// Le PATH que l'app donne à tout ce qu'elle lance — ou rien : depuis le dépôt, elle garde celui
// du terminal qui l'a lancée. Installée : celui du shell de connexion du chef d'abord, puis le
// sien, puis les dossiers connus, et le dossier de son `node` en dernier — un `node` du chef passe
// devant. Chaque dossier n'y est qu'une fois, à sa première place.
export function pathOf(options: OptionsPath): string | undefined {
  const { emplacements: locations } = options;
  if (locations.facon === "depot") return undefined;
  const pieces = [options.duShell() ?? "", options.env.PATH ?? "", PATHS_KNOWN(options.maison, options.plateforme).join(delimiter), join(locations.node, "..")];
  const seenOnes = new Set<string>();
  for (const folder of pieces.join(delimiter).split(delimiter)) if (folder !== "") seenOnes.add(folder);
  return [...seenOnes].join(delimiter);
}

// Ce qui encadre le PATH dans ce que le shell écrit : ses fichiers de démarrage peuvent écrire
// autre chose avant et après.
const START = "__brigade_path_debut__";
const END = "__brigade_path_fin__";

// Le PATH du shell de connexion du chef, tel qu'un terminal le lui donne — sur un Mac ou un Linux :
// sous Windows, une app reçoit le PATH du compte, il n'y a pas de shell de connexion à lire (`-l`, et `-i` pour ce
// que son `.zshrc` ajoute) — ou rien : un shell absent, qui échoue, ou qui n'a rien rendu dans le
// délai. Il est lu une fois, au lancement de l'app : rien de ce qu'il dit d'autre n'est gardé.
export function readPathOfShell(shell: string, delayMs: number, env: Record<string, string | undefined> = process.env): string | undefined {
  const readOne = spawnSync(shell, ["-ilc", `printf '%s%s%s' '${START}' "$PATH" '${END}'`], {
    encoding: "utf8",
    timeout: delayMs,
    stdio: ["ignore", "pipe", "ignore"],
    // oh-my-zsh ne propose pas sa mise à jour à un shell que personne ne lit.
    env: { ...env, DISABLE_AUTO_UPDATE: "true" },
  });
  if (readOne.error !== undefined || readOne.status !== 0 || typeof readOne.stdout !== "string") return undefined;
  const start = readOne.stdout.lastIndexOf(START);
  const end = readOne.stdout.lastIndexOf(END);
  if (start < 0 || end < start) return undefined;
  const path = readOne.stdout.slice(start + START.length, end).trim();
  return path === "" ? undefined : path;
}
