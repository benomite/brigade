// Décline les trois SVG de docs/logo/ en icônes de l'app : le .icns du Mac, le .ico de Windows et
// les mipmaps d'Android (icône d'origine, ronde, avant-plan adaptatif). Les sorties sont commitées ;
// on ne rejoue ce script que si le dessin change.
//
//   npm i --prefix <dossier vide> @resvg/resvg-js
//   node app/packaging/icones.ts <dossier vide>
import { mkdirSync, writeFileSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { join } from "node:path";

const ici = import.meta.dirname;
const logo = join(ici, "..", "..", "docs", "logo");
const dossierResvg = process.argv[2];
if (!dossierResvg) {
  console.error("usage: node app/packaging/icones.ts <folder where @resvg/resvg-js is installed>");
  process.exit(1);
}
const { Resvg } = createRequire(join(dossierResvg, "x.js"))("@resvg/resvg-js");

const icone = readFileSync(join(logo, "brigade-icone.svg"), "utf8");
const png = (svg: string, taille: number): Buffer => Buffer.from(new Resvg(svg, { fitTo: { mode: "width", value: taille } }).render().asPng());

// Le glyphe seul (blanc), tel que l'icône le porte.
const glyphe = icone.match(/<g transform="translate\(-3\.5 0\)">.*?<\/g>(?=<\/g>)/)![0];
const degrade = icone.match(/<defs>.*<\/defs>/)![0];
// Avant-plan adaptatif d'Android : 108 dp, le glyphe centré dans la zone sûre (66 dp).
const avantPlan = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 108 108"><g transform="translate(54 54) translate(-32 -32)">${glyphe}</g></svg>`;
// Icône ronde : le fond de l'icône en disque, le glyphe à la même échelle.
const ronde = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">${degrade}<circle cx="32" cy="32" r="32" fill="url(#p)"/><g transform="translate(5.5 6.4) scale(.8)">${glyphe}</g></svg>`;

// --- Mac : un .icns, des PNG rangés par type.
const types: Record<string, number> = { ic07: 128, ic08: 256, ic09: 512, ic10: 1024, ic11: 32, ic12: 64, ic13: 256, ic14: 512 };
const morceaux = Object.entries(types).map(([type, taille]) => {
  const donnees = png(icone, taille);
  const tete = Buffer.alloc(8);
  tete.write(type, 0, "ascii");
  tete.writeUInt32BE(8 + donnees.length, 4);
  return Buffer.concat([tete, donnees]);
});
const corps = Buffer.concat(morceaux);
const teteIcns = Buffer.alloc(8);
teteIcns.write("icns", 0, "ascii");
teteIcns.writeUInt32BE(8 + corps.length, 4);
const sortie = join(ici, "icones");
mkdirSync(sortie, { recursive: true });
writeFileSync(join(sortie, "Brigade.icns"), Buffer.concat([teteIcns, corps]));

// --- Windows : un .ico de PNG (16 à 256).
const tailles = [16, 24, 32, 48, 64, 128, 256];
const images = tailles.map((t) => png(icone, t));
const tete = Buffer.alloc(6);
tete.writeUInt16LE(1, 2);
tete.writeUInt16LE(tailles.length, 4);
let decalage = 6 + 16 * tailles.length;
const entrees = tailles.map((t, i) => {
  const e = Buffer.alloc(16);
  e.writeUInt8(t === 256 ? 0 : t, 0);
  e.writeUInt8(t === 256 ? 0 : t, 1);
  e.writeUInt16LE(1, 4);
  e.writeUInt16LE(32, 6);
  e.writeUInt32LE(images[i].length, 8);
  e.writeUInt32LE(decalage, 12);
  decalage += images[i].length;
  return e;
});
writeFileSync(join(sortie, "Brigade.ico"), Buffer.concat([tete, ...entrees, ...images]));
writeFileSync(join(sortie, "Brigade-1024.png"), png(icone, 1024));

// --- Android : mipmaps par densité.
const res = join(ici, "..", "android", "natif", "app", "src", "main", "res");
const densites: Record<string, number> = { mdpi: 1, hdpi: 1.5, xhdpi: 2, xxhdpi: 3, xxxhdpi: 4 };
for (const [d, f] of Object.entries(densites)) {
  const dossier = join(res, `mipmap-${d}`);
  writeFileSync(join(dossier, "ic_launcher.png"), png(icone, 48 * f));
  writeFileSync(join(dossier, "ic_launcher_round.png"), png(ronde, 48 * f));
  writeFileSync(join(dossier, "ic_launcher_foreground.png"), png(avantPlan, 108 * f));
}
