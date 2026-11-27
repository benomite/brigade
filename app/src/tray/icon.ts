// L'image de l'icône de l'état de la cuisine (#3269), la même pour celle de l'app (main.ts) et celle de fond (#3631) :
// le dessin de la barre des menus, et sous Windows le nombre de questions qui attendent peint dessus.
import { readFileSync, rmSync } from "node:fs";
import { dirname, join } from "node:path";
import { Menu, nativeImage, Tray, type MenuItemConstructorOptions, type NativeImage } from "electron";
import { withPill } from "../menu-bar.ts";
import { pathConfiguration } from "../config.ts";
import { isOneMac } from "../platform.ts";
import { readTheCommand, sameProcess, takeThePlace } from "../tray-background/instance.ts";
import { ARGUMENT } from "../tray-background/system.ts";

export const ICON_OF_THE_BAR = join(import.meta.dirname, "..", "icons", "menu-bar.png");

// L'icône avec la pastille de `questions`, à chaque échelle qu'elle porte (16 px, et 32 px pour un écran à 200 %).
export function pilled(image: NativeImage, questions: number): NativeImage {
  if (questions <= 0) return image;
  const painted = nativeImage.createEmpty();
  for (const scaleFactor of image.getScaleFactors()) {
    const { width, height } = image.getSize(scaleFactor);
    const bitmap = image.toBitmap({ scaleFactor });
    if (width !== height || bitmap.length !== width * height * 4) continue;
    painted.addRepresentation({ scaleFactor, width, height, buffer: withPill(bitmap, width, questions) });
  }
  return painted.isEmpty() ? image : painted;
}

// Le seul `new Tray` de l'app (#4079) : l'app et l'icône de la station de fond sont deux process, et la barre des menus ne
// montre qu'une icône. Celui qui la pose tient un fichier de pid, à côté du fichier de configuration ; l'autre n'en pose pas
// tant que le premier vit, et la pose à sa lecture suivante s'il s'est arrêté. Le pid d'un process qui n'est plus est libre.
const lockOfTheIcon = () => join(dirname(pathConfiguration()), "icone.pid");

// Le pid rendu par le système à un autre process ne tient pas la place (#4071). L'app et l'icône de fond sont le même binaire,
// l'une sans argument, l'autre avec `--tray-fond` : on compare leurs lignes de commande sans cet argument.
const withoutTheArgumentOfBackground = (pid: number): string | undefined => readTheCommand(pid)?.replace(new RegExp(`\\s+${ARGUMENT}(?=\\s|$)`, "g"), "");

// La place de l'icône est tenue par un autre process : celui-ci n'en pose pas.
export class PlaceHeld extends Error {
  constructor(pid: number) {
    super(`another process (pid ${pid}) already holds the menu bar icon`);
  }
}

export type IconUnique = {
  // Ce que dit l'icône : sa ligne — « 0 cooking · 0 for you », avec l'état de la station (line.ts) — au survol, à côté de
  // l'icône sur un Mac, et le nombre de questions peint dessus ailleurs.
  ligne(image: NativeImage, infos: { infobulle: string; ligne: string; questions: number }): void;
  menu(entries: readonly MenuItemConstructorOptions[]): void;
  // Retirée, l'icône rend sa place — seulement si c'est ce process qui la tient.
  retirer(): void;
};

// L'icône posée ; `PlaceTenue` quand un autre process tient déjà la place. L'image doit se lire, sinon l'erreur le dit.
export function createTheIcon(image: NativeImage, platform: string): IconUnique {
  if (image.isEmpty()) throw new Error("its icon could not be read");
  const file = lockOfTheIcon();
  const holding = takeThePlace(file, process.pid, (pid) => sameProcess(pid, process.pid, withoutTheArgumentOfBackground));
  if (holding !== undefined) throw new PlaceHeld(holding);
  const icon = new Tray(image);
  // Sous Windows, le clic gauche n'ouvre pas le menu de lui-même : sur un Mac, si.
  if (!isOneMac(platform)) icon.on("click", () => icon.popUpContextMenu());
  return {
    ligne: (image, { infobulle, ligne: line, questions }) => {
      icon.setToolTip(`${infobulle} — ${line}`);
      if (isOneMac(platform)) icon.setTitle(` ${line}`);
      else icon.setImage(pilled(image, questions));
    },
    menu: (entries) => icon.setContextMenu(Menu.buildFromTemplate([...entries])),
    retirer: () => {
      icon.destroy();
      try {
        if (Number(readFileSync(file, "utf8").trim()) === process.pid) rmSync(file, { force: true });
      } catch {
        // Pas de fichier : la place est déjà libre.
      }
    },
  };
}

// Comme `creerLIcone`, mais une place tenue par un autre process n'est pas une erreur : rien n'est posé, et `undefined` le dit.
export function createIfFree(image: NativeImage, platform: string): IconUnique | undefined {
  try {
    return createTheIcon(image, platform);
  } catch (error) {
    if (error instanceof PlaceHeld) return undefined;
    throw error;
  }
}
