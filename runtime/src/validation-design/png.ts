// Lire et écrire un PNG, sans dépendance (#3617) : la comparaison des captures
// avant et après d'une livraison design les lit pixel par pixel, et écrit les
// images qu'elle montre sur la carte du chef.
//
// - Lus : 8 ou 16 bits par canal, gris, gris et alpha, RGB, RGBA, ou palette
//   (avec sa transparence `tRNS`), non entrelacés — ce que rend une capture
//   d'écran d'un navigateur. Tout autre PNG lève `PngIllisible`, qui dit
//   pourquoi.
// - Écrits : RGBA 8 bits.
import { crc32, deflateSync, inflateSync } from "node:zlib";

// Une image en RGBA 8 bits, ligne après ligne.
export type Image = { largeur: number; hauteur: number; pixels: Uint8Array };

export class PngIllisible extends Error {}

const SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
// Les canaux d'un pixel, par type de couleur.
const CANAUX: Record<number, number> = { 0: 1, 2: 3, 3: 1, 4: 2, 6: 4 };

export function imageVide(largeur: number, hauteur: number): Image {
  return { largeur, hauteur, pixels: new Uint8Array(largeur * hauteur * 4) };
}

export function lirePng(octets: Uint8Array): Image {
  const tampon = Buffer.from(octets.buffer, octets.byteOffset, octets.byteLength);
  if (tampon.length < SIGNATURE.length || !tampon.subarray(0, SIGNATURE.length).equals(SIGNATURE)) throw new PngIllisible("not a PNG file");
  let largeur = 0;
  let hauteur = 0;
  let profondeur = 0;
  let couleur = -1;
  let palette: Buffer | null = null;
  let transparence: Buffer | null = null;
  const donnees: Buffer[] = [];
  for (let position = SIGNATURE.length; position + 8 <= tampon.length; ) {
    const longueur = tampon.readUInt32BE(position);
    const type = tampon.toString("latin1", position + 4, position + 8);
    const contenu = tampon.subarray(position + 8, position + 8 + longueur);
    if (contenu.length !== longueur) throw new PngIllisible(`truncated ${type} chunk`);
    if (type === "IHDR") {
      largeur = contenu.readUInt32BE(0);
      hauteur = contenu.readUInt32BE(4);
      profondeur = contenu[8] ?? 0;
      couleur = contenu[9] ?? -1;
      if ((contenu[12] ?? 0) !== 0) throw new PngIllisible("interlaced PNGs are not read");
    } else if (type === "PLTE") palette = contenu;
    else if (type === "tRNS") transparence = contenu;
    else if (type === "IDAT") donnees.push(contenu);
    else if (type === "IEND") break;
    position += 12 + longueur;
  }
  const canaux = CANAUX[couleur];
  if (largeur === 0 || hauteur === 0 || canaux === undefined) throw new PngIllisible("no readable image header");
  if (profondeur !== 8 && profondeur !== 16) throw new PngIllisible(`${profondeur}-bit PNGs are not read`);
  if (couleur === 3 && (profondeur !== 8 || palette === null)) throw new PngIllisible("palette PNG without its palette");
  const octetsParCanal = profondeur / 8;
  const parPixel = canaux * octetsParCanal;
  const parLigne = largeur * parPixel;
  let brut: Buffer;
  try {
    brut = inflateSync(Buffer.concat(donnees));
  } catch (erreur) {
    throw new PngIllisible(`its image data does not inflate: ${erreur instanceof Error ? erreur.message : String(erreur)}`);
  }
  if (brut.length < hauteur * (parLigne + 1)) throw new PngIllisible("its image data is shorter than its size");
  const lignes = defiltrer(brut, hauteur, parLigne, parPixel);
  const image = imageVide(largeur, hauteur);
  const sortie = image.pixels;
  // Seul l'octet de poids fort d'un canal de 16 bits compte.
  const canal = (debut: number, rang: number) => lignes[debut + rang * octetsParCanal] ?? 0;
  for (let pixel = 0; pixel < largeur * hauteur; pixel += 1) {
    const debut = Math.floor(pixel / largeur) * parLigne + (pixel % largeur) * parPixel;
    const o = pixel * 4;
    if (couleur === 3) {
      const indice = canal(debut, 0);
      sortie[o] = palette?.[indice * 3] ?? 0;
      sortie[o + 1] = palette?.[indice * 3 + 1] ?? 0;
      sortie[o + 2] = palette?.[indice * 3 + 2] ?? 0;
      sortie[o + 3] = transparence?.[indice] ?? 255;
    } else if (couleur === 0 || couleur === 4) {
      const gris = canal(debut, 0);
      sortie[o] = gris;
      sortie[o + 1] = gris;
      sortie[o + 2] = gris;
      sortie[o + 3] = couleur === 4 ? canal(debut, 1) : 255;
    } else {
      sortie[o] = canal(debut, 0);
      sortie[o + 1] = canal(debut, 1);
      sortie[o + 2] = canal(debut, 2);
      sortie[o + 3] = couleur === 6 ? canal(debut, 3) : 255;
    }
  }
  return image;
}

function paeth(a: number, b: number, c: number): number {
  const p = a + b - c;
  const pa = Math.abs(p - a);
  const pb = Math.abs(p - b);
  const pc = Math.abs(p - c);
  return pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
}

function defiltrer(brut: Buffer, hauteur: number, parLigne: number, parPixel: number): Uint8Array {
  const lignes = new Uint8Array(hauteur * parLigne);
  for (let y = 0; y < hauteur; y += 1) {
    const filtre = brut[y * (parLigne + 1)];
    const entree = y * (parLigne + 1) + 1;
    const sortie = y * parLigne;
    for (let i = 0; i < parLigne; i += 1) {
      const octet = brut[entree + i] ?? 0;
      const gauche = i >= parPixel ? (lignes[sortie + i - parPixel] ?? 0) : 0;
      const haut = y > 0 ? (lignes[sortie - parLigne + i] ?? 0) : 0;
      const coin = y > 0 && i >= parPixel ? (lignes[sortie - parLigne + i - parPixel] ?? 0) : 0;
      let valeur: number;
      if (filtre === 0) valeur = octet;
      else if (filtre === 1) valeur = octet + gauche;
      else if (filtre === 2) valeur = octet + haut;
      else if (filtre === 3) valeur = octet + Math.floor((gauche + haut) / 2);
      else if (filtre === 4) valeur = octet + paeth(gauche, haut, coin);
      else throw new PngIllisible(`unknown row filter ${filtre}`);
      lignes[sortie + i] = valeur & 0xff;
    }
  }
  return lignes;
}

function morceau(type: string, contenu: Buffer): Buffer {
  const tete = Buffer.alloc(8);
  tete.writeUInt32BE(contenu.length, 0);
  tete.write(type, 4, "latin1");
  const somme = Buffer.alloc(4);
  somme.writeUInt32BE(crc32(Buffer.concat([tete.subarray(4), contenu])) >>> 0, 0);
  return Buffer.concat([tete, contenu, somme]);
}

export function ecrirePng({ largeur, hauteur, pixels }: Image): Buffer {
  const entete = Buffer.alloc(13);
  entete.writeUInt32BE(largeur, 0);
  entete.writeUInt32BE(hauteur, 4);
  entete.set([8, 6, 0, 0, 0], 8);
  // Chaque ligne filtrée par « Sub » : les aplats d'une capture s'y compressent bien.
  const parLigne = largeur * 4;
  const brut = Buffer.alloc(hauteur * (parLigne + 1));
  for (let y = 0; y < hauteur; y += 1) {
    const sortie = y * (parLigne + 1);
    brut[sortie] = 1;
    for (let i = 0; i < parLigne; i += 1) {
      const gauche = i >= 4 ? (pixels[y * parLigne + i - 4] ?? 0) : 0;
      brut[sortie + 1 + i] = ((pixels[y * parLigne + i] ?? 0) - gauche) & 0xff;
    }
  }
  return Buffer.concat([SIGNATURE, morceau("IHDR", entete), morceau("IDAT", deflateSync(brut)), morceau("IEND", Buffer.alloc(0))]);
}
