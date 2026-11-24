// L'image de l'icône de l'état de la cuisine (#3269), la même pour celle de l'app (main.ts) et celle de fond (#3631) :
// le dessin de la barre des menus, et sous Windows le nombre de questions qui attendent peint dessus.
import { readFileSync, rmSync } from "node:fs";
import { dirname, join } from "node:path";
import { Menu, nativeImage, Tray, type MenuItemConstructorOptions, type NativeImage } from "electron";
import { avecPastille } from "../barre-de-menus.ts";
import { cheminConfiguration } from "../config.ts";
import { estUnMac } from "../plateforme.ts";
import { lireLaCommande, memeProcess, prendreLaPlace } from "../tray-fond/instance.ts";
import { ARGUMENT } from "../tray-fond/systeme.ts";

export const ICONE_DE_LA_BARRE = join(import.meta.dirname, "..", "icones", "barre-de-menus.png");

// L'icône avec la pastille de `questions`, à chaque échelle qu'elle porte (16 px, et 32 px pour un écran à 200 %).
export function pastillee(image: NativeImage, questions: number): NativeImage {
  if (questions <= 0) return image;
  const peinte = nativeImage.createEmpty();
  for (const scaleFactor of image.getScaleFactors()) {
    const { width, height } = image.getSize(scaleFactor);
    const bitmap = image.toBitmap({ scaleFactor });
    if (width !== height || bitmap.length !== width * height * 4) continue;
    peinte.addRepresentation({ scaleFactor, width, height, buffer: avecPastille(bitmap, width, questions) });
  }
  return peinte.isEmpty() ? image : peinte;
}

// Le seul `new Tray` de l'app (#4079) : l'app et l'icône de la station de fond sont deux process, et la barre des menus ne
// montre qu'une icône. Celui qui la pose tient un fichier de pid, à côté du fichier de configuration ; l'autre n'en pose pas
// tant que le premier vit, et la pose à sa lecture suivante s'il s'est arrêté. Le pid d'un process qui n'est plus est libre.
const verrouDeLIcone = () => join(dirname(cheminConfiguration()), "icone.pid");

// Le pid rendu par le système à un autre process ne tient pas la place (#4071). L'app et l'icône de fond sont le même binaire,
// l'une sans argument, l'autre avec `--tray-fond` : on compare leurs lignes de commande sans cet argument.
const sansLArgumentDuFond = (pid: number): string | undefined => lireLaCommande(pid)?.replace(new RegExp(`\\s+${ARGUMENT}(?=\\s|$)`, "g"), "");

// La place de l'icône est tenue par un autre process : celui-ci n'en pose pas.
export class PlaceTenue extends Error {
  constructor(pid: number) {
    super(`another process (pid ${pid}) already holds the menu bar icon`);
  }
}

export type IconeUnique = {
  // Ce que dit l'icône : sa ligne — « 0 cooking · 0 for you », avec l'état de la station (ligne.ts) — au survol, à côté de
  // l'icône sur un Mac, et le nombre de questions peint dessus ailleurs.
  ligne(image: NativeImage, infos: { infobulle: string; ligne: string; questions: number }): void;
  menu(entrees: readonly MenuItemConstructorOptions[]): void;
  // Retirée, l'icône rend sa place — seulement si c'est ce process qui la tient.
  retirer(): void;
};

// L'icône posée ; `PlaceTenue` quand un autre process tient déjà la place. L'image doit se lire, sinon l'erreur le dit.
export function creerLIcone(image: NativeImage, plateforme: string): IconeUnique {
  if (image.isEmpty()) throw new Error("its icon could not be read");
  const fichier = verrouDeLIcone();
  const tenant = prendreLaPlace(fichier, process.pid, (pid) => memeProcess(pid, process.pid, sansLArgumentDuFond));
  if (tenant !== undefined) throw new PlaceTenue(tenant);
  const icone = new Tray(image);
  // Sous Windows, le clic gauche n'ouvre pas le menu de lui-même : sur un Mac, si.
  if (!estUnMac(plateforme)) icone.on("click", () => icone.popUpContextMenu());
  return {
    ligne: (image, { infobulle, ligne, questions }) => {
      icone.setToolTip(`${infobulle} — ${ligne}`);
      if (estUnMac(plateforme)) icone.setTitle(` ${ligne}`);
      else icone.setImage(pastillee(image, questions));
    },
    menu: (entrees) => icone.setContextMenu(Menu.buildFromTemplate([...entrees])),
    retirer: () => {
      icone.destroy();
      try {
        if (Number(readFileSync(fichier, "utf8").trim()) === process.pid) rmSync(fichier, { force: true });
      } catch {
        // Pas de fichier : la place est déjà libre.
      }
    },
  };
}
