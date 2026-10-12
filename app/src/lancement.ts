// Un seul geste pour lancer l'app : `npm start` passe d'abord ici, qui pose ce
// qui manque — les dépendances, puis le binaire d'Electron — en le disant.
// Joué par Node seul, avant toute dépendance : rien ne s'importe hors de Node.
import { spawnSync } from "node:child_process";
import { existsSync, statSync } from "node:fs";
import { join } from "node:path";

const POSE = ["ci", "--ignore-scripts"];

// Pourquoi les dépendances sont à poser — ou rien, si elles sont à jour. npm
// laisse dans node_modules la trace de ce qu'il y a posé : plus vieille que le
// verrou, c'est que le verrou a changé depuis.
function aPoser(app: string): string | undefined {
  const trace = join(app, "node_modules/.package-lock.json");
  if (!existsSync(trace)) return "elles ne sont pas encore là";
  if (statSync(join(app, "package-lock.json")).mtimeMs > statSync(trace).mtimeMs) return "`package-lock.json` a changé depuis qu'elles ont été posées";
  return undefined;
}

// Rend le code de sortie : autre que 0, l'app n'est pas lancée.
export function preparer(options: { app: string; node: string; executer(commande: string, args: string[]): number; dire(ligne: string): void }): number {
  const { app, executer, dire } = options;
  const raison = aPoser(app);
  if (raison !== undefined) {
    dire(`brigade : je pose les dépendances de l'app (\`npm ${POSE.join(" ")}\`) — ${raison}.`);
    const code = executer("npm", POSE);
    if (code !== 0) {
      dire(`brigade : \`npm ${POSE.join(" ")}\` a échoué (code ${code}) — l'app n'est pas lancée.`);
      return code;
    }
  }
  // Les dépendances sont posées sans leurs scripts : le binaire d'Electron vient à part.
  if (raison !== undefined || !existsSync(join(app, "node_modules/electron/path.txt"))) {
    dire("brigade : je pose Electron — téléchargé la première fois sur ce poste, 311 Mo sur le disque.");
    const code = executer(options.node, ["node_modules/electron/install.js"]);
    if (code !== 0) {
      dire(`brigade : Electron n'a pas pu être posé (code ${code}) — l'app n'est pas lancée.`);
      return code;
    }
  }
  return 0;
}

if (import.meta.main) {
  const app = join(import.meta.dirname, "..");
  process.exitCode = preparer({
    app,
    node: process.execPath,
    executer: (commande, args) => spawnSync(commande, args, { cwd: app, stdio: "inherit" }).status ?? 1,
    dire: (ligne) => console.error(ligne),
  });
}
