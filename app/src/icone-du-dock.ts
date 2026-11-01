// L'icône du Dock, posée à la main sous `npm start`. Le .dmg ne livre pas le dossier `packaging/` :
// `app.isPackaged` y est faux (l'exécutable s'appelle `Electron`, le code n'est pas en asar), et
// une icône absente ne doit jamais empêcher la fenêtre de s'ouvrir.
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
