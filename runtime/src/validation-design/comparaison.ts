// La comparaison des captures avant et après d'un écran (#3617) : deux pages
// entières presque identiques ne disent pas au chef ce qui a changé. Elle les
// compare pixel par pixel, trouve les zones changées et dessine ce que la
// carte « Validate its screen » montre : la capture après, les zones changées
// entourées, et chaque zone recadrée et agrandie, avant et après côte à côte.
//
// - Un pixel a changé quand l'un de ses canaux (RGBA) s'écarte de plus de
//   `SEUIL` d'une capture à l'autre : une ligne de petit texte gris sur fond
//   clair s'en écarte de bien plus, le lissage des bords d'un texte rendu
//   ailleurs de moins. Hors de l'une des deux captures — elles n'ont pas la
//   même taille —, il a changé.
// - Les pixels changés à moins de `ECART` les uns des autres font une seule
//   zone ; une zone de moins de `PIXELS_MIN` pixels changés est du bruit, et
//   n'en est pas une. Chaque zone garde `MARGE` pixels autour d'elle, et deux
//   zones qui se touchent alors n'en font qu'une.
// - Aucune zone : les captures ne montrent aucun changement visible.
import { imageVide, type Image } from "./png.ts";

export const SEUIL = 48;
export const PIXELS_MIN = 8;
export const ECART = 16;
export const MARGE = 6;
// Les cases où se comptent les pixels changés : `ECART` en vaut deux.
const CASE = 8;

// Une zone changée, en pixels, marge comprise.
export type Zone = { x: number; y: number; largeur: number; hauteur: number };

export function zonesChangees(avant: Image, apres: Image): Zone[] {
  const largeur = Math.max(avant.largeur, apres.largeur);
  const hauteur = Math.max(avant.hauteur, apres.hauteur);
  const colonnes = Math.ceil(largeur / CASE);
  const rangees = Math.ceil(hauteur / CASE);
  const cases = colonnes * rangees;
  const compte = new Int32Array(cases);
  const gauche = new Int32Array(cases).fill(largeur);
  const haut = new Int32Array(cases).fill(hauteur);
  const droite = new Int32Array(cases).fill(-1);
  const bas = new Int32Array(cases).fill(-1);
  for (let y = 0; y < hauteur; y += 1) {
    for (let x = 0; x < largeur; x += 1) {
      if (!pixelChange(avant, apres, x, y)) continue;
      const rang = Math.floor(y / CASE) * colonnes + Math.floor(x / CASE);
      compte[rang] = (compte[rang] ?? 0) + 1;
      gauche[rang] = Math.min(gauche[rang] ?? x, x);
      haut[rang] = Math.min(haut[rang] ?? y, y);
      droite[rang] = Math.max(droite[rang] ?? x, x);
      bas[rang] = Math.max(bas[rang] ?? y, y);
    }
  }
  // Les cases changées voisines à moins de `ECART`, de proche en proche.
  const portee = Math.ceil(ECART / CASE);
  const vue = new Uint8Array(cases);
  const zones: Zone[] = [];
  for (let depart = 0; depart < cases; depart += 1) {
    if ((compte[depart] ?? 0) === 0 || vue[depart] === 1) continue;
    vue[depart] = 1;
    const pile = [depart];
    let pixels = 0;
    let x0 = largeur;
    let y0 = hauteur;
    let x1 = -1;
    let y1 = -1;
    while (pile.length > 0) {
      const rang = pile.pop() ?? 0;
      pixels += compte[rang] ?? 0;
      x0 = Math.min(x0, gauche[rang] ?? x0);
      y0 = Math.min(y0, haut[rang] ?? y0);
      x1 = Math.max(x1, droite[rang] ?? x1);
      y1 = Math.max(y1, bas[rang] ?? y1);
      const colonne = rang % colonnes;
      const rangee = Math.floor(rang / colonnes);
      for (let dy = -portee; dy <= portee; dy += 1) {
        for (let dx = -portee; dx <= portee; dx += 1) {
          const c = colonne + dx;
          const r = rangee + dy;
          if (c < 0 || r < 0 || c >= colonnes || r >= rangees) continue;
          const voisine = r * colonnes + c;
          if ((compte[voisine] ?? 0) === 0 || vue[voisine] === 1) continue;
          vue[voisine] = 1;
          pile.push(voisine);
        }
      }
    }
    if (pixels < PIXELS_MIN) continue;
    zones.push(avecMarge({ x: x0, y: y0, largeur: x1 - x0 + 1, hauteur: y1 - y0 + 1 }, largeur, hauteur));
  }
  return fusionner(zones).sort((a, b) => a.y - b.y || a.x - b.x);
}

function pixelChange(avant: Image, apres: Image, x: number, y: number): boolean {
  if (x >= avant.largeur || y >= avant.hauteur || x >= apres.largeur || y >= apres.hauteur) return true;
  const a = (y * avant.largeur + x) * 4;
  const b = (y * apres.largeur + x) * 4;
  for (let canal = 0; canal < 4; canal += 1) {
    if (Math.abs((avant.pixels[a + canal] ?? 0) - (apres.pixels[b + canal] ?? 0)) > SEUIL) return true;
  }
  return false;
}

function avecMarge(zone: Zone, largeur: number, hauteur: number): Zone {
  const x = Math.max(0, zone.x - MARGE);
  const y = Math.max(0, zone.y - MARGE);
  return { x, y, largeur: Math.min(largeur, zone.x + zone.largeur + MARGE) - x, hauteur: Math.min(hauteur, zone.y + zone.hauteur + MARGE) - y };
}

const seTouchent = (a: Zone, b: Zone) => a.x <= b.x + b.largeur && b.x <= a.x + a.largeur && a.y <= b.y + b.hauteur && b.y <= a.y + a.hauteur;

// Deux zones qui se touchent, marge comprise, n'en font qu'une.
function fusionner(zones: Zone[]): Zone[] {
  const restantes = [...zones];
  for (let fusion = true; fusion; ) {
    fusion = false;
    for (let i = 0; i < restantes.length && !fusion; i += 1) {
      for (let j = i + 1; j < restantes.length && !fusion; j += 1) {
        const a = restantes[i] as Zone;
        const b = restantes[j] as Zone;
        if (!seTouchent(a, b)) continue;
        const x = Math.min(a.x, b.x);
        const y = Math.min(a.y, b.y);
        restantes.splice(j, 1);
        restantes[i] = { x, y, largeur: Math.max(a.x + a.largeur, b.x + b.largeur) - x, hauteur: Math.max(a.y + a.hauteur, b.y + b.hauteur) - y };
        fusion = true;
      }
    }
  }
  return restantes;
}

// ── Les images de la carte ──

// Le trait qui entoure une zone : rouge, et assez épais pour se voir sur une
// page entière réduite à la largeur de la carte.
export const TRAIT = { epaisseur: 4, couleur: [229, 29, 72, 255] } as const;

// La capture après, chaque zone entourée d'un trait tout autour d'elle.
export function entourer(apres: Image, zones: readonly Zone[]): Image {
  const image = { largeur: apres.largeur, hauteur: apres.hauteur, pixels: new Uint8Array(apres.pixels) };
  const peindre = (x: number, y: number) => {
    if (x < 0 || y < 0 || x >= image.largeur || y >= image.hauteur) return;
    image.pixels.set(TRAIT.couleur, (y * image.largeur + x) * 4);
  };
  for (const { x, y, largeur, hauteur } of zones) {
    for (let e = 1; e <= TRAIT.epaisseur; e += 1) {
      for (let i = x - e; i <= x + largeur - 1 + e; i += 1) {
        peindre(i, y - e);
        peindre(i, y + hauteur - 1 + e);
      }
      for (let j = y - e; j <= y + hauteur - 1 + e; j += 1) {
        peindre(x - e, j);
        peindre(x + largeur - 1 + e, j);
      }
    }
  }
  return image;
}

// L'agrandissement d'une zone : au moins deux fois, au plus quatre, vers
// `LARGEUR_AGRANDIE` pixels de large pour chacune des deux captures.
export const LARGEUR_AGRANDIE = 640;
export const agrandissement = (zone: Zone) => Math.min(4, Math.max(2, Math.floor(LARGEUR_AGRANDIE / zone.largeur)));

const SEPARATION = 16;
// Ce qui tient la place d'un pixel hors d'une capture plus petite que l'autre.
const HORS = [200, 200, 200, 255];

// La zone recadrée et agrandie : avant à gauche, après à droite, séparés d'un
// trait gris.
export function agrandir(avant: Image, apres: Image, zone: Zone): Image {
  const fois = agrandissement(zone);
  const large = zone.largeur * fois;
  const image = imageVide(large * 2 + SEPARATION, zone.hauteur * fois);
  image.pixels.fill(255);
  for (let y = 0; y < image.hauteur; y += 1) {
    for (let t = SEPARATION / 2 - 1; t <= SEPARATION / 2; t += 1) image.pixels.set([160, 160, 160, 255], (y * image.largeur + large + t) * 4);
  }
  for (const [source, depart] of [[avant, 0], [apres, large + SEPARATION]] as const) {
    for (let y = 0; y < image.hauteur; y += 1) {
      for (let x = 0; x < large; x += 1) {
        const sx = zone.x + Math.floor(x / fois);
        const sy = zone.y + Math.floor(y / fois);
        const dedans = sx < source.largeur && sy < source.hauteur;
        const o = (sy * source.largeur + sx) * 4;
        image.pixels.set(dedans ? source.pixels.subarray(o, o + 4) : HORS, (y * image.largeur + depart + x) * 4);
      }
    }
  }
  return image;
}
