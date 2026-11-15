// L'image de l'icône de l'état de la cuisine (#3269), la même pour celle de l'app (main.ts) et celle de fond (#3631) :
// le dessin de la barre des menus, et sous Windows le nombre de questions qui attendent peint dessus.
import { join } from "node:path";
import { nativeImage, type NativeImage } from "electron";
import { avecPastille } from "../barre-de-menus.ts";

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
