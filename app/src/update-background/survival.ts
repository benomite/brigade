// Une mise à jour de l'app ne coupe ni la station ni ses cooks (#3632). Installer l'app, c'est la
// fermer : la station de l'ordinateur, que l'app tient par son entrée (workstation/envelope.ts), s'arrêterait
// avec elle, et ses cooks avec. Pour une mise à jour, l'app pose donc `survit-a-l-app` dans le
// répertoire de la station avant de fermer : l'entrée fermée ne l'arrête plus, la station continue
// seule. L'app rouverte, sur la nouvelle version, la reprend au lieu d'en lancer une seconde
// (workstation/station.ts) : elle lit son pid dans `en-service`, que la station écrit d'elle-même.
//
// Une station reprise n'a plus d'entrée à fermer : l'app l'arrête par un SIGTERM sur son pid
// (`arreterLaSurvivante`), ce que l'entrée fermée lui donnait.
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";

// Ce que l'app pose avant de fermer pour une mise à jour.
const SURVIVES = "survit-a-l-app";
// Ce que la station écrit d'elle-même quand elle a démarré (runtime/src/mise-a-jour/en-service.ts).
const EN_SERVICE = "en-service";

// L'entrée de la station est fermée : doit-elle continuer ? (l'enveloppe, `racine` : son répertoire)
export const mustSurvive = (root: string | undefined): boolean => root !== undefined && root !== "" && existsSync(join(root, SURVIVES));

export function leaveSurvive(root: string): void {
  writeFileSync(join(root, SURVIVES), `${new Date().toISOString()}\n`);
}

const alive = (pid: number): boolean => {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return (error as NodeJS.ErrnoException).code === "EPERM";
  }
};

// Quand le process `pid` a démarré (ms), ou `undefined` si le système ne le dit pas (`ps`, sous Linux et macOS).
const startsA = (pid: number): number | undefined => {
  try {
    const seconds = Number(execFileSync("ps", ["-o", "etimes=", "-p", String(pid)], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim());
    return Number.isFinite(seconds) ? Date.now() - seconds * 1000 : undefined;
  } catch {
    return undefined;
  }
};

// `en-service.depuis` est écrit par la station une fois démarrée : un process qui a démarré après lui n'est
// pas elle, c'est un pid réutilisé. La marge couvre la seconde entière de `ps`.
const MARGIN_MS = 5000;

// Le pid de la station qu'une app fermée pour sa mise à jour a laissée en route — rien sans marque, quand
// le process dit n'est plus là, ou quand ce n'est pas la station (pid réutilisé, ou âge illisible : on ne
// reprend pas ce qu'on pourrait tuer à tort). La marque se lève : une reprise ne se refait pas.
export function resumeTheSurviving(root: string, isAlive: (pid: number) => boolean = alive, starts: (pid: number) => number | undefined = startsA): number | undefined {
  if (!existsSync(join(root, SURVIVES))) return undefined;
  rmSync(join(root, SURVIVES), { force: true });
  try {
    const { pid, depuis: since } = JSON.parse(readFileSync(join(root, EN_SERVICE), "utf8")) as { pid?: unknown; depuis?: unknown };
    if (typeof pid !== "number" || !Number.isInteger(pid) || pid <= 0 || pid === process.pid || !isAlive(pid)) return undefined;
    const written = typeof since === "string" ? Date.parse(since) : NaN;
    const gone = starts(pid);
    return Number.isFinite(written) && gone !== undefined && gone <= written + MARGIN_MS ? pid : undefined;
  } catch {
    // Pas de `en-service` lisible : la station n'a pas démarré jusqu'au bout, rien à reprendre.
    return undefined;
  }
}

// Arrête la station reprise : SIGTERM, puis SIGKILL passé `gardeMs`. Rend quand le process n'est plus là.
export async function stopTheSurviving(pid: number, guardMs: number, isAlive: (pid: number) => boolean = alive): Promise<void> {
  try {
    process.kill(pid, "SIGTERM");
  } catch {
    return;
  }
  const end = Date.now() + guardMs;
  while (isAlive(pid)) {
    if (Date.now() >= end) {
      try {
        process.kill(pid, "SIGKILL");
      } catch {
        // Déjà partie.
      }
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
}
