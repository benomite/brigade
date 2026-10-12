// Le code sur lequel un runtime tourne. `node` le lit une fois, à son
// démarrage : mettre l'installation à jour ne change rien au process qui
// tourne. Le runtime laisse donc l'empreinte de son code dans son répertoire
// d'état en démarrant, et `installation` — un autre process — la compare à
// celle du code installé. Aucune horloge, aucun `git` : deux contenus.
import { createHash } from "node:crypto";
import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, relative } from "node:path";

// Ce que `node` exécute : ce répertoire, et rien d'autre de l'installation.
export const SOURCES = import.meta.dirname;
const TEMOIN = "code-en-service";

// L'empreinte de `sources` : chaque fichier, par son chemin et son contenu.
export function empreinteDuCode(sources = SOURCES): string {
  const fichiers = readdirSync(sources, { recursive: true, withFileTypes: true })
    .filter((entree) => entree.isFile())
    .map((entree) => join(entree.parentPath, entree.name))
    .sort();
  const empreinte = createHash("sha256");
  for (const fichier of fichiers) empreinte.update(`${relative(sources, fichier)}\0`).update(readFileSync(fichier)).update("\0");
  return empreinte.digest("hex");
}

// À appeler au démarrage du runtime, verrou tenu : le code noté est le sien.
export function noterCodeEnService(repertoireEtat: string): void {
  writeFileSync(join(repertoireEtat, TEMOIN), `${empreinteDuCode()}\n`);
}

// L'empreinte laissée par le dernier démarrage, ou null s'il n'en a pas laissé.
export function lireCodeEnService(repertoireEtat: string): string | null {
  try {
    return readFileSync(join(repertoireEtat, TEMOIN), "utf8").trim() || null;
  } catch {
    return null;
  }
}
