// Un seul geste pour lancer l'app : `npm start` passe d'abord ici, qui la met à
// jour — son clone avance jusqu'à la branche de l'origine qu'il suit (rattrapage.ts) —,
// puis pose ce qui manque — les dépendances, puis le binaire d'Electron — en le disant.
// Joué par Node seul, avant toute dépendance : rien ne s'importe hors de Node.
import { spawnSync } from "node:child_process";
import { existsSync, statSync } from "node:fs";
import { join } from "node:path";
import { direAuLancement, rattraper } from "./rattrapage.ts";

const POSE = ["ci", "--ignore-scripts"];

// Pourquoi les dépendances sont à poser — ou rien, si elles sont à jour. npm
// laisse dans node_modules la trace de ce qu'il y a posé : plus vieille que le
// verrou, c'est que le verrou a changé depuis.
function aPoser(app: string): string | undefined {
  const trace = join(app, "node_modules/.package-lock.json");
  if (!existsSync(trace)) return "they are not there yet";
  if (statSync(join(app, "package-lock.json")).mtimeMs > statSync(trace).mtimeMs) return "`package-lock.json` has changed since they were installed";
  return undefined;
}

// Rend le code de sortie : autre que 0, l'app n'est pas lancée.
export function preparer(options: { app: string; node: string; executer(commande: string, args: string[]): number; dire(ligne: string): void }): number {
  const { app, executer, dire } = options;
  const raison = aPoser(app);
  if (raison !== undefined) {
    dire(`brigade: installing the app's dependencies (\`npm ${POSE.join(" ")}\`) — ${raison}.`);
    const code = executer("npm", POSE);
    if (code !== 0) {
      dire(`brigade: \`npm ${POSE.join(" ")}\` failed (code ${code}) — the app is not launched.`);
      return code;
    }
  }
  // Les dépendances sont posées sans leurs scripts : le binaire d'Electron vient à part.
  if (raison !== undefined || !existsSync(join(app, "node_modules/electron/path.txt"))) {
    dire("brigade: installing Electron — downloaded the first time on this workstation, 311 MB on disk.");
    const code = executer(options.node, ["node_modules/electron/install.js"]);
    if (code !== 0) {
      dire(`brigade: Electron could not be installed (code ${code}) — the app is not launched.`);
      return code;
    }
  }
  return 0;
}

if (import.meta.main) {
  const app = join(import.meta.dirname, "..");
  // D'abord la nouvelle version, s'il y en a une : les dépendances qu'elle demande se posent
  // ensuite. Une origine muette, au bout d'une minute, laisse l'app s'ouvrir sur son code.
  const dit = direAuLancement(await rattraper({ git: "git", delaiMs: 60_000 }, app));
  if (dit !== undefined) console.error(dit);
  process.exitCode = preparer({
    app,
    node: process.execPath,
    // `npm` est rejoué par le `node` qui joue `npm start`, sur le script que npm lui donne : sous
    // Windows, `npm` est un `npm.cmd`, qu'aucun process ne lance sans passer par `cmd.exe`.
    executer: (commande, args) => {
      const npm = commande === "npm" ? process.env.npm_execpath : undefined;
      return (npm === undefined ? spawnSync(commande, args, { cwd: app, stdio: "inherit" }) : spawnSync(process.execPath, [npm, ...args], { cwd: app, stdio: "inherit" })).status ?? 1;
    },
    dire: (ligne) => console.error(ligne),
  });
}
