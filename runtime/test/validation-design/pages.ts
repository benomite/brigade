// Des captures d'écran de synthèse pour les tests de la comparaison (#3617) :
// une page blanche de 1280 px de large, et des lignes de petit texte gris,
// chaque caractère un motif de 5 × 7 pixels tiré de son code.
import { imageVide, type Image } from "../../src/validation-design/png.ts";

export const LARGEUR = 1280;

export function page(hauteur: number): Image {
  const image = imageVide(LARGEUR, hauteur);
  image.pixels.fill(255);
  return image;
}

export const copie = (image: Image): Image => ({ largeur: image.largeur, hauteur: image.hauteur, pixels: new Uint8Array(image.pixels) });

export function poser(image: Image, x: number, y: number, rgb: readonly [number, number, number]): void {
  if (x < 0 || y < 0 || x >= image.largeur || y >= image.hauteur) return;
  image.pixels.set([...rgb, 255], (y * image.largeur + x) * 4);
}

export const pixel = (image: Image, x: number, y: number) => [...image.pixels.subarray((y * image.largeur + x) * 4, (y * image.largeur + x) * 4 + 4)];

// Une ligne de petit texte gris (#888 par défaut) à partir de (x, y) : 6 px par
// caractère, 7 px de haut. Rend sa largeur.
export function ecrire(image: Image, x: number, y: number, texte: string, gris = 0x88): number {
  [...texte].forEach((caractere, rang) => {
    const code = caractere.codePointAt(0) ?? 0;
    if (caractere === " ") return;
    for (let dy = 0; dy < 7; dy += 1) {
      for (let dx = 0; dx < 5; dx += 1) {
        // Un motif par caractère : les bits de son code, décalés par ligne.
        if (((code * (dy + 3) * 2654435761) >>> (dx + dy)) & 1) poser(image, x + rang * 6 + dx, y + dy, [gris, gris, gris]);
      }
      poser(image, x + rang * 6, y + dy, [gris, gris, gris]);
    }
  });
  return texte.length * 6;
}

// Remplace la ligne de texte à (x, y) : effacée sur toute la largeur de la page, puis réécrite.
export function remplacer(image: Image, x: number, y: number, texte: string, gris = 0x88): number {
  for (let dy = 0; dy < 7; dy += 1) for (let dx = x; dx < image.largeur; dx += 1) poser(image, dx, y + dy, [255, 255, 255]);
  return ecrire(image, x, y, texte, gris);
}
