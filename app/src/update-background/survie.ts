// Une mise à jour de l'app ne coupe ni la station ni ses cooks (#3632). Installer l'app, c'est la
// fermer : la station de l'ordinateur, que l'app tient par son entrée (workstation/enveloppe.ts), s'arrêterait
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
const SURVIT = "survit-a-l-app";
// Ce que la station écrit d'elle-même quand elle a démarré (runtime/src/mise-a-jour/en-service.ts).
const EN_SERVICE = "en-service";

// L'entrée de la station est fermée : doit-elle continuer ? (l'enveloppe, `racine` : son répertoire)
export const doitSurvivre = (racine: string | undefined): boolean => racine !== undefined && racine !== "" && existsSync(join(racine, SURVIT));

export function laisserSurvivre(racine: string): void {
  writeFileSync(join(racine, SURVIT), `${new Date().toISOString()}\n`);
}

const vivant = (pid: number): boolean => {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return (error as NodeJS.ErrnoException).code === "EPERM";
  }
};

// Quand le process `pid` a démarré (ms), ou `undefined` si le système ne le dit pas (`ps`, sous Linux et macOS).
const demarreA = (pid: number): number | undefined => {
  try {
    const secondes = Number(execFileSync("ps", ["-o", "etimes=", "-p", String(pid)], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim());
    return Number.isFinite(secondes) ? Date.now() - secondes * 1000 : undefined;
  } catch {
    return undefined;
  }
};

// `en-service.depuis` est écrit par la station une fois démarrée : un process qui a démarré après lui n'est
// pas elle, c'est un pid réutilisé. La marge couvre la seconde entière de `ps`.
const MARGE_MS = 5000;

// Le pid de la station qu'une app fermée pour sa mise à jour a laissée en route — rien sans marque, quand
// le process dit n'est plus là, ou quand ce n'est pas la station (pid réutilisé, ou âge illisible : on ne
// reprend pas ce qu'on pourrait tuer à tort). La marque se lève : une reprise ne se refait pas.
export function reprendreLaSurvivante(racine: string, estVivant: (pid: number) => boolean = vivant, demarre: (pid: number) => number | undefined = demarreA): number | undefined {
  if (!existsSync(join(racine, SURVIT))) return undefined;
  rmSync(join(racine, SURVIT), { force: true });
  try {
    const { pid, depuis } = JSON.parse(readFileSync(join(racine, EN_SERVICE), "utf8")) as { pid?: unknown; depuis?: unknown };
    if (typeof pid !== "number" || !Number.isInteger(pid) || pid <= 0 || pid === process.pid || !estVivant(pid)) return undefined;
    const ecrit = typeof depuis === "string" ? Date.parse(depuis) : NaN;
    const parti = demarre(pid);
    return Number.isFinite(ecrit) && parti !== undefined && parti <= ecrit + MARGE_MS ? pid : undefined;
  } catch {
    // Pas de `en-service` lisible : la station n'a pas démarré jusqu'au bout, rien à reprendre.
    return undefined;
  }
}

// Arrête la station reprise : SIGTERM, puis SIGKILL passé `gardeMs`. Rend quand le process n'est plus là.
export async function arreterLaSurvivante(pid: number, guardMs: number, estVivant: (pid: number) => boolean = vivant): Promise<void> {
  try {
    process.kill(pid, "SIGTERM");
  } catch {
    return;
  }
  const fin = Date.now() + guardMs;
  while (estVivant(pid)) {
    if (Date.now() >= fin) {
      try {
        process.kill(pid, "SIGKILL");
      } catch {
        // Déjà partie.
      }
      return;
    }
    await new Promise((resoudre) => setTimeout(resoudre, 50));
  }
}
