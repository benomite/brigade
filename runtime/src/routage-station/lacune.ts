// Ce que la station n'a pas pu pour un ticket (#3870) : une ligne, écrite dans le
// répertoire de la station (`<BRIGADE_STATION_DIR>/lacunes/<projet>.json`), que les
// faits du projet lisent pour la carte de la station dans l'onglet Stations. Elle
// s'efface quand la station livre un ticket. Illisible, elle ne dit rien : la carte
// n'invente pas de manque.
import { existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const fichier = (racine: string, projet: string) => join(racine, "lacunes", `${projet.replace(/[^A-Za-z0-9._-]/g, "_")}.json`);

// Écrit la ligne, ou l'efface si elle est nulle. Lève si le fichier ne s'écrit pas.
export function noterLaLacune(racine: string, projet: string, station: string, ligne: string | null): void {
  const chemin = fichier(racine, projet);
  if (ligne === null) {
    rmSync(chemin, { force: true });
    return;
  }
  mkdirSync(join(racine, "lacunes"), { recursive: true });
  const neuf = `${chemin}.${process.pid}.tmp`;
  writeFileSync(neuf, `${JSON.stringify({ station, lacks: ligne })}\n`);
  renameSync(neuf, chemin);
}

// La ligne que `station` a dite, ou null : rien d'écrit, ou un fichier qui ne se lit pas.
export function lacuneDeLaStation(racine: string | undefined, projet: string | undefined, station: string): string | null {
  if (racine === undefined || projet === undefined) return null;
  const chemin = fichier(racine, projet);
  if (!existsSync(chemin)) return null;
  try {
    const lu: unknown = JSON.parse(readFileSync(chemin, "utf8"));
    const { station: nom, lacks } = lu as { station?: unknown; lacks?: unknown };
    return nom === station && typeof lacks === "string" && lacks !== "" ? lacks : null;
  } catch {
    return null;
  }
}
