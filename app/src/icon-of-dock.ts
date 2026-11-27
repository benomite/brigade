// L'icône du Dock, posée à la main sous `npm start`. Le .dmg, dont l'exécutable s'appelle `Brigade`, est empaqueté pour Electron : son icône est celle de
// son bundle (CFBundleIconFile), rien n'est posé à la main. Une icône absente ne doit jamais empêcher la fenêtre de s'ouvrir.
import { existsSync } from "node:fs";

export function setTheIconOfDock(path: string, set: (path: string) => void, exists: (path: string) => boolean = existsSync): boolean {
  if (!exists(path)) return false;
  try {
    set(path);
    return true;
  } catch {
    return false;
  }
}
