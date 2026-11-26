// L'icône du Dock, posée à la main sous `npm start`. Le .dmg, dont l'exécutable s'appelle `Brigade`, est empaqueté pour Electron : son icône est celle de
// son bundle (CFBundleIconFile), rien n'est posé à la main. Une icône absente ne doit jamais empêcher la fenêtre de s'ouvrir.
import { existsSync } from "node:fs";

export function poserLIconeDuDock(chemin: string, poser: (chemin: string) => void, existe: (chemin: string) => boolean = existsSync): boolean {
  if (!existe(chemin)) return false;
  try {
    poser(chemin);
    return true;
  } catch {
    return false;
  }
}
