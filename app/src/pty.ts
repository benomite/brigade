// Le vrai pty : node-pty, le seul module natif de l'app. Il est livré compilé
// pour macOS et pour Windows (ConPTY), et passe par N-API — le même binaire sert
// Node (les tests) et Electron (l'app), sans recompilation.
import { chmodSync, existsSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import type { Lancement, Pty } from "./terminaux.ts";

const requerir = createRequire(import.meta.url);
const PRECOMPILE = join(dirname(requerir.resolve("node-pty/package.json")), "prebuilds", `${process.platform}-${process.arch}`);

// node-pty 1.1.0 livre `spawn-helper` sans son bit d'exécution : tout lancement
// échoue alors par « posix_spawnp failed ». Windows n'en a pas.
const AIDE = join(PRECOMPILE, "spawn-helper");
if (existsSync(AIDE)) chmodSync(AIDE, 0o755);

// Faux là où node-pty n'est pas livré compilé (Linux) : l'app est une app du Mac et de Windows.
export const ptyDisponible = existsSync(PRECOMPILE);

// L'environnement du chef, moins ce que `npm start` y a ajouté : ses variables
// suivraient le chef dans chaque shell et dans le second.
const environnement = (): Record<string, string> =>
  Object.fromEntries(Object.entries(process.env).filter((paire): paire is [string, string] => paire[1] !== undefined && !paire[0].startsWith("npm_")));

export function ouvrirPty(lancement: Lancement): Pty {
  // node-pty charge son binaire dès qu'il est importé, et lève là où il n'en a
  // pas : il n'est donc chargé qu'ici, à l'usage. Ce module, lui, se charge
  // partout — c'est ce qui laisse `ptyDisponible` répondre sur Linux.
  const { spawn } = requerir("node-pty") as typeof import("node-pty");
  const pty = spawn(lancement.commande, lancement.args, {
    name: "xterm-256color",
    cwd: lancement.dossier,
    cols: lancement.colonnes,
    rows: lancement.lignes,
    env: environnement(),
  });
  pty.onData(lancement.surSortie);
  // Tué par un signal, un process n'a pas de code : celui du shell (128 + signal).
  pty.onExit(({ exitCode, signal }) => lancement.surFin(exitCode || (signal ? 128 + signal : 0)));
  return {
    ecrire: (donnees) => pty.write(donnees),
    redimensionner: (colonnes, lignes) => pty.resize(colonnes, lignes),
    tuer: () => pty.kill(),
  };
}
