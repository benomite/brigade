// Une mise à jour de l'app ne coupe ni la station ni ses cooks (#3632). Installer l'app, c'est la
// fermer : la station de l'ordinateur, que l'app tient par son entrée (poste/enveloppe.ts), s'arrêterait
// avec elle, et ses cooks avec. Pour une mise à jour, l'app pose donc `survit-a-l-app` dans le
// répertoire de la station avant de fermer : l'entrée fermée ne l'arrête plus, la station continue
// seule. L'app rouverte, sur la nouvelle version, la reprend au lieu d'en lancer une seconde
// (poste/station.ts) : elle lit son pid dans `en-service`, que la station écrit d'elle-même.
//
// Une station reprise n'a plus d'entrée à fermer : l'app l'arrête par un SIGTERM sur son pid
// (`arreterLaSurvivante`), ce que l'entrée fermée lui donnait.
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
  } catch (erreur) {
    return (erreur as NodeJS.ErrnoException).code === "EPERM";
  }
};

// Le pid de la station qu'une app fermée pour sa mise à jour a laissée en route — rien sans marque, ou
// quand le process dit n'est plus là. La marque se lève : une reprise ne se refait pas.
export function reprendreLaSurvivante(racine: string, estVivant: (pid: number) => boolean = vivant): number | undefined {
  if (!existsSync(join(racine, SURVIT))) return undefined;
  rmSync(join(racine, SURVIT), { force: true });
  try {
    const { pid } = JSON.parse(readFileSync(join(racine, EN_SERVICE), "utf8")) as { pid?: unknown };
    return typeof pid === "number" && Number.isInteger(pid) && pid > 0 && pid !== process.pid && estVivant(pid) ? pid : undefined;
  } catch {
    // Pas de `en-service` lisible : la station n'a pas démarré jusqu'au bout, rien à reprendre.
    return undefined;
  }
}

// Arrête la station reprise : SIGTERM, puis SIGKILL passé `gardeMs`. Rend quand le process n'est plus là.
export async function arreterLaSurvivante(pid: number, gardeMs: number, estVivant: (pid: number) => boolean = vivant): Promise<void> {
  try {
    process.kill(pid, "SIGTERM");
  } catch {
    return;
  }
  const fin = Date.now() + gardeMs;
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
