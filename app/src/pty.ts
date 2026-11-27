// Le vrai pty : node-pty, le seul module natif de l'app. Il est livré compilé
// pour macOS et pour Windows (ConPTY), et passe par N-API — le même binaire sert
// Node (les tests) et Electron (l'app), sans recompilation.
import { accessSync, chmodSync, constants, existsSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import type { Launch, Pty } from "./terminals.ts";

const require = createRequire(import.meta.url);
const PRECOMPILED = join(dirname(require.resolve("node-pty/package.json")), "prebuilds", `${process.platform}-${process.arch}`);

// node-pty 1.1.0 livre `spawn-helper` sans son bit d'exécution : tout lancement
// échoue alors par « posix_spawnp failed ». Windows n'en a pas.
const HELP = join(PRECOMPILED, "spawn-helper");

// Lancée d'un lieu en lecture seule (l'app ouverte depuis l'image disque, #4269), l'app ne peut pas rendre l'aide
// exécutable (EROFS). Si elle l'est déjà, tout va bien ; sinon aucun terminal ne s'ouvrira, et l'app doit le dire.
// Toute autre erreur reste levée : ce n'est pas ce cas-là.
export function helpUsable(
  help: string,
  fs: { existe: (path: string) => boolean; chmod: (path: string) => void; executable: (path: string) => boolean } = {
    existe: existsSync,
    chmod: (path) => chmodSync(path, 0o755),
    executable: (path) => {
      try {
        accessSync(path, constants.X_OK);
        return true;
      } catch {
        return false;
      }
    },
  },
): boolean {
  if (!fs.existe(help)) return true;
  try {
    fs.chmod(help);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "EROFS") throw error;
    return fs.executable(help);
  }
  return true;
}

export const helpUnusable = !helpUsable(HELP);

// Faux là où node-pty n'est pas livré compilé (Linux) : l'app est une app du Mac et de Windows.
export const ptyAvailable = existsSync(PRECOMPILED);

// L'environnement du chef, moins ce que `npm start` y a ajouté : ses variables
// suivraient le chef dans chaque shell et dans le second.
const environment = (): Record<string, string> =>
  Object.fromEntries(Object.entries(process.env).filter((pair): pair is [string, string] => pair[1] !== undefined && !pair[0].startsWith("npm_")));

export function openPty(launch: Launch): Pty {
  // node-pty charge son binaire dès qu'il est importé, et lève là où il n'en a
  // pas : il n'est donc chargé qu'ici, à l'usage. Ce module, lui, se charge
  // partout — c'est ce qui laisse `ptyDisponible` répondre sur Linux.
  const { spawn } = require("node-pty") as typeof import("node-pty");
  // Une ligne déjà écrite pour Windows (le plan du second, #1433) part telle quelle : node-pty la prend en une chaîne.
  const pty = spawn(launch.commande, launch.verbatim === true ? launch.args.join(" ") : launch.args, {
    name: "xterm-256color",
    cwd: launch.dossier,
    cols: launch.colonnes,
    rows: launch.lignes,
    env: { ...environment(), ...launch.env },
  });
  pty.onData(launch.surSortie);
  // Tué par un signal, un process n'a pas de code : celui du shell (128 + signal).
  pty.onExit(({ exitCode, signal }) => launch.surFin(exitCode || (signal ? 128 + signal : 0)));
  return {
    ecrire: (data) => pty.write(data),
    redimensionner: (columns, lines) => pty.resize(columns, lines),
    tuer: () => pty.kill(),
  };
}
