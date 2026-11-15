// La comparaison des captures avant et après d'un écran (#3617) : les zones
// changées, le bruit écarté, et les images que la carte montre.
import assert from "node:assert/strict";
import { test } from "node:test";
import { deflateSync } from "node:zlib";
import { agrandir, entourer, zonesChangees, type Zone } from "../../src/validation-design/comparaison.ts";

// La marge gardée autour d'une zone, et le trait rouge qui l'entoure.
const MARGE = 6;
const ROUGE = [229, 29, 72, 255];
const EPAISSEUR = 4;
import { ecrirePng, lirePng, PngIllisible } from "../../src/validation-design/png.ts";
import { copie, ecrire, LARGEUR, page, pixel, poser, remplacer } from "./pages.ts";

// La page d'accueil de #3602 en petit : un titre, des paragraphes, et une
// ligne de petit texte gris en bas.
function accueil() {
  const image = page(360);
  ecrire(image, 40, 30, "Brigade — the kitchen that serves its tickets", 0x22);
  for (let ligne = 0; ligne < 12; ligne += 1) ecrire(image, 40, 80 + ligne * 16, "Lorem ipsum dolor sit amet, consectetur adipiscing elit, sed do eiusmod tempor", 0x33);
  ecrire(image, 40, 320, "Last served: 2 days ago, by station A");
  return image;
}

const contient = (zone: Zone, x: number, y: number, largeur: number, hauteur: number) => zone.x <= x && zone.y <= y && zone.x + zone.largeur >= x + largeur && zone.y + zone.hauteur >= y + hauteur;

test("one line of small grey text that differs on a 1280 px wide page is one changed area, around that line and its margin only", () => {
  const avant = accueil();
  const apres = copie(avant);
  const largeur = remplacer(apres, 40, 320, "Last served: 3 hours ago, by station B");
  assert.equal(apres.largeur, LARGEUR);
  const zones = zonesChangees(avant, apres);
  assert.equal(zones.length, 1, JSON.stringify(zones));
  const [zone] = zones as [Zone];
  // Elle tient ce qui a changé sur la ligne, dans sa marge, et rien d'autre.
  assert.ok(zone.y >= 320 - MARGE && zone.y + zone.hauteur <= 327 + MARGE, JSON.stringify(zone));
  assert.ok(zone.x >= 40 - MARGE && zone.x + zone.largeur <= 40 + largeur + MARGE, JSON.stringify(zone));
  assert.ok(zone.largeur < 250 && zone.hauteur < 30, JSON.stringify(zone));
});

test("identical captures have no changed area", () => {
  assert.deepEqual(zonesChangees(accueil(), accueil()), []);
});

test("anti-aliasing noise — every text pixel a little lighter or darker, and isolated pixels further apart — is no changed area", () => {
  const avant = accueil();
  const apres = copie(avant);
  let rang = 0;
  for (let y = 0; y < apres.hauteur; y += 1) {
    for (let x = 0; x < apres.largeur; x += 1) {
      const [r = 255] = pixel(apres, x, y);
      // Les bords lissés autrement : jusqu'à 40 de plus ou de moins sur chaque pixel de texte et à côté de lui.
      if (r < 255 || (x > 0 && (pixel(apres, x - 1, y)[0] ?? 255) < 255)) {
        const ecart = (rang++ % 81) - 40;
        const v = Math.min(255, Math.max(0, r + ecart));
        poser(apres, x, y, [v, v, v]);
      }
    }
  }
  // Et quelques pixels isolés bien plus loin de leur valeur, épars sur la page.
  for (let y = 10; y < apres.hauteur; y += 40) for (let x = 20; x < apres.largeur; x += 60) poser(apres, x, y, [150, 150, 150]);
  assert.deepEqual(zonesChangees(avant, apres), []);
});

test("several separate changes are several areas, in reading order; changed pixels close to each other are one area", () => {
  const avant = accueil();
  const apres = copie(avant);
  // Deux changements à l'opposé l'un de l'autre.
  ecrire(apres, 1000, 30, "NEW");
  ecrire(apres, 40, 340, "Footer");
  // Deux mots changés à quelques pixels l'un de l'autre : une seule zone.
  ecrire(apres, 900, 200, "ab");
  ecrire(apres, 900, 212, "cd");
  ecrire(apres, 920, 200, "ef");
  const zones = zonesChangees(avant, apres);
  assert.equal(zones.length, 3, JSON.stringify(zones));
  const [haut, milieu, bas] = zones as [Zone, Zone, Zone];
  assert.ok(contient(haut, 1000, 30, 18, 7), JSON.stringify(haut));
  assert.ok(contient(milieu, 900, 200, 32, 19), JSON.stringify(milieu));
  assert.ok(contient(bas, 40, 340, 36, 7), JSON.stringify(bas));
});

test("captures of different heights: what only the taller one has is changed", () => {
  const avant = accueil();
  const apres = page(400);
  apres.pixels.set(avant.pixels);
  const zones = zonesChangees(avant, apres);
  assert.equal(zones.length, 1);
  assert.ok(contient(zones[0] as Zone, 0, 360, LARGEUR, 40), JSON.stringify(zones));
});

test("the after capture shows each area outlined in red all around it, and nothing else changed", () => {
  const apres = accueil();
  const zone = { x: 34, y: 314, largeur: 210, hauteur: 19 };
  const entouree = entourer(apres, [zone]);
  assert.equal(entouree.largeur, apres.largeur);
  assert.equal(entouree.hauteur, apres.hauteur);
  const rouge = ROUGE;
  for (const [x, y] of [[zone.x - 1, zone.y + 5], [zone.x + zone.largeur, zone.y + 5], [zone.x + 50, zone.y - EPAISSEUR], [zone.x + 50, zone.y + zone.hauteur + EPAISSEUR - 1]] as const) assert.deepEqual(pixel(entouree, x, y), rouge, `${x},${y}`);
  // Le dedans de la zone et le reste de la page sont ceux de la capture.
  assert.deepEqual(pixel(entouree, zone.x + 6, zone.y + 6), pixel(apres, zone.x + 6, zone.y + 6));
  assert.deepEqual(pixel(entouree, 600, 30), pixel(apres, 600, 30));
  // La capture lue n'est pas touchée.
  assert.deepEqual(pixel(apres, zone.x - 1, zone.y + 5), [255, 255, 255, 255]);
});

test("an area is cropped and enlarged, before on the left and after on the right, at least twice its size", () => {
  const avant = accueil();
  const apres = copie(avant);
  remplacer(apres, 40, 320, "Last served: 3 hours ago");
  const [zone] = zonesChangees(avant, apres) as [Zone];
  const image = agrandir(avant, apres, zone);
  const fois = image.hauteur / zone.hauteur;
  assert.ok(Number.isInteger(fois) && fois >= 2 && fois <= 4, String(fois));
  const large = zone.largeur * fois;
  assert.ok(image.largeur > 2 * large);
  // Chaque pixel agrandi est celui de sa capture, à sa place.
  for (const [x, y] of [[0, 0], [5, 3], [zone.largeur - 1, zone.hauteur - 1], [Math.floor(zone.largeur / 2), Math.floor(zone.hauteur / 2)]] as const) {
    assert.deepEqual(pixel(image, x * fois, y * fois), pixel(avant, zone.x + x, zone.y + y));
    assert.deepEqual(pixel(image, image.largeur - large + x * fois, y * fois), pixel(apres, zone.x + x, zone.y + y));
  }
  // Avant et après diffèrent au milieu de la zone, sur la ligne changée.
  const ligne = (MARGE + 3) * fois * image.largeur * 4;
  assert.notDeepEqual([...image.pixels.subarray(ligne, ligne + large * 4)], [...image.pixels.subarray(ligne + (image.largeur - large) * 4, ligne + image.largeur * 4)]);
});

// Un PNG écrit à la main : `couleur` 2 (RGB) ou 3 (palette), 8 bits.
function pngALaMain(couleur: 2 | 3, lignes: number[][], palette?: number[]): Buffer {
  const morceau = (type: string, contenu: Buffer) => {
    const tete = Buffer.alloc(8);
    tete.writeUInt32BE(contenu.length);
    tete.write(type, 4, "latin1");
    return Buffer.concat([tete, contenu, Buffer.alloc(4)]);
  };
  const entete = Buffer.alloc(13);
  entete.writeUInt32BE(couleur === 2 ? lignes[0]!.length / 3 : lignes[0]!.length, 0);
  entete.writeUInt32BE(lignes.length, 4);
  entete.set([8, couleur, 0, 0, 0], 8);
  // La seconde ligne filtrée « Up » : la lecture défait le filtre.
  const brut = Buffer.from(lignes.flatMap((ligne, y) => (y === 0 ? [0, ...ligne] : [2, ...ligne.map((v, i) => (v - lignes[y - 1]![i]!) & 0xff)])));
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), morceau("IHDR", entete), ...(palette === undefined ? [] : [morceau("PLTE", Buffer.from(palette))]), morceau("IDAT", deflateSync(brut)), morceau("IEND", Buffer.alloc(0))]);
}

test("a PNG written is read back pixel for pixel; RGB and palette PNGs are read as RGBA; what is not a readable PNG says why", () => {
  const image = accueil();
  const relue = lirePng(ecrirePng(image));
  assert.equal(relue.largeur, image.largeur);
  assert.equal(relue.hauteur, image.hauteur);
  assert.deepEqual(Buffer.from(relue.pixels), Buffer.from(image.pixels));

  const rgb = lirePng(pngALaMain(2, [[255, 0, 0, 0, 255, 0], [10, 20, 30, 40, 50, 60]]));
  assert.deepEqual([...rgb.pixels], [255, 0, 0, 255, 0, 255, 0, 255, 10, 20, 30, 255, 40, 50, 60, 255]);
  const indexee = lirePng(pngALaMain(3, [[1, 0]], [0, 0, 0, 9, 8, 7]));
  assert.deepEqual([...indexee.pixels], [9, 8, 7, 255, 0, 0, 0, 255]);

  assert.throws(() => lirePng(Buffer.from("not an image")), PngIllisible);
  assert.throws(() => lirePng(ecrirePng(image).subarray(0, 60)), PngIllisible);
});
