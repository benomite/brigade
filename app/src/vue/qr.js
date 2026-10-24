// @ts-check
// Un QR, dessiné ici, dans la vue : ce que la station rend à porter (`brigade://pair?code=…&url=…`, le format de
// `runtime/src/telephone/appairage.ts`, `contenuDuQr`) devient une image, sans aucun service de dehors — rien ne part
// de l'app pour le dessiner. Le texte n'est pas relu : il est porté tel quel, octet par octet.
//
// C'est le QR « modèle 2 » de la norme (ISO/IEC 18004) dans sa forme la plus simple : le mode octets, la correction
// d'erreurs de niveau M (15 % du code se perd sans que la lecture échoue), et la plus petite version qui tient le
// texte, de 1 (21 × 21 modules) à 20 (97 × 97) — un QR d'appairage tient en version 5 ou 6. Le masque est celui qui
// pénalise le moins la lecture, comme la norme le demande.
//
// Ce module ne touche pas `document` : il rend une matrice de modules, ou une image SVG en adresse `data:`, que la
// vue pose dans un `<img>` (la page n'accepte d'images que celles-là).

// Par version, au niveau M : les codewords de correction de chaque bloc, puis les blocs — combien, de combien de
// codewords de données (les blocs du second groupe en ont un de plus).
/** @type {readonly (readonly [number, number, number, number, number])[]} */
const BLOCS_M = [
  [10, 1, 16, 0, 0],
  [16, 1, 28, 0, 0],
  [26, 1, 44, 0, 0],
  [18, 2, 32, 0, 0],
  [24, 2, 43, 0, 0],
  [16, 4, 27, 0, 0],
  [18, 4, 31, 0, 0],
  [22, 2, 38, 2, 39],
  [22, 3, 36, 2, 37],
  [26, 4, 43, 1, 44],
  [30, 1, 50, 4, 51],
  [22, 6, 36, 2, 37],
  [22, 8, 37, 1, 38],
  [24, 4, 40, 5, 41],
  [24, 5, 41, 5, 42],
  [28, 7, 45, 3, 46],
  [28, 10, 46, 1, 47],
  [26, 9, 43, 4, 44],
  [26, 3, 44, 11, 45],
  [26, 3, 41, 13, 42],
];
export const VERSION_MAX = BLOCS_M.length;

// Les bits du niveau M dans l'information de format.
const NIVEAU_M = 0b00;

/** @param {number} version */
const cote = (version) => 17 + 4 * version;

// Les modules qui portent des données, dans une version : tout, moins les motifs fixes — repères, alignements,
// rythme, format et version. Chaque version en a autant que ses codewords, plus quelques bits de reste.
/** @param {number} version */
export function modulesDeDonnees(version) {
  let n = (16 * version + 128) * version + 64;
  if (version >= 2) {
    const alignements = Math.floor(version / 7) + 2;
    n -= (25 * alignements - 10) * alignements - 55;
    if (version >= 7) n -= 36;
  }
  return n;
}

/** @param {number} version */
export function blocsDe(version) {
  const ligne = BLOCS_M[version - 1];
  if (ligne === undefined) throw new RangeError(`no QR version ${version}`);
  const [correction, premiers, donneesDesPremiers, seconds, donneesDesSeconds] = ligne;
  return { correction, premiers, donneesDesPremiers, seconds, donneesDesSeconds, donnees: premiers * donneesDesPremiers + seconds * donneesDesSeconds };
}

// --- Le corps de Galois à 256 éléments, et Reed-Solomon ------------------------------------------------------------

/** @param {number} x @param {number} y */
function multiplier(x, y) {
  let z = 0;
  for (let i = 7; i >= 0; i--) {
    z = (z << 1) ^ ((z >>> 7) * 0x11d);
    z ^= ((y >>> i) & 1) * x;
  }
  return z & 0xff;
}

// Le polynôme générateur de degré `degre` : le produit des (x − αⁱ), coefficients du plus haut au plus bas, le
// premier (1) omis.
/** @param {number} degre */
function generateur(degre) {
  const coefficients = new Array(degre).fill(0);
  coefficients[degre - 1] = 1;
  let racine = 1;
  for (let i = 0; i < degre; i++) {
    for (let j = 0; j < degre; j++) {
      coefficients[j] = multiplier(coefficients[j], racine);
      if (j + 1 < degre) coefficients[j] ^= coefficients[j + 1];
    }
    racine = multiplier(racine, 0x02);
  }
  return coefficients;
}

// Les codewords de correction d'un bloc de données : le reste de sa division par le générateur.
/** @param {readonly number[]} donnees @param {number} degre */
export function correctionDe(donnees, degre) {
  const diviseur = generateur(degre);
  const reste = new Array(degre).fill(0);
  for (const octet of donnees) {
    const facteur = octet ^ reste.shift();
    reste.push(0);
    for (let i = 0; i < degre; i++) reste[i] ^= multiplier(diviseur[i], facteur);
  }
  return reste;
}

// --- Les données : le texte en octets, puis les codewords entrelacés -------------------------------------------------

/** @param {string} texte */
function octetsDe(texte) {
  return [...new TextEncoder().encode(texte)];
}

// La plus petite version qui tient ces octets au niveau M ; aucune au-delà de la vingtième.
/** @param {number} longueur */
export function versionPour(longueur) {
  for (let version = 1; version <= VERSION_MAX; version++) {
    const bits = 4 + (version < 10 ? 8 : 16) + 8 * longueur;
    if (bits <= blocsDe(version).donnees * 8) return version;
  }
  throw new RangeError(`${longueur} bytes do not fit in a QR code of version ${VERSION_MAX}`);
}

// Les codewords de données : l'indicateur du mode octets, la longueur, les octets, la fin et le remplissage.
/** @param {readonly number[]} octets @param {number} version */
export function codewordsDeDonnees(octets, version) {
  /** @type {number[]} */
  const bits = [];
  /** @param {number} valeur @param {number} longueur */
  const ecrire = (valeur, longueur) => {
    for (let i = longueur - 1; i >= 0; i--) bits.push((valeur >>> i) & 1);
  };
  const capacite = blocsDe(version).donnees * 8;
  ecrire(0b0100, 4);
  ecrire(octets.length, version < 10 ? 8 : 16);
  for (const octet of octets) ecrire(octet, 8);
  ecrire(0, Math.min(4, capacite - bits.length));
  ecrire(0, (8 - (bits.length % 8)) % 8);
  for (let remplissage = 0xec; bits.length < capacite; remplissage ^= 0xec ^ 0x11) ecrire(remplissage, 8);
  /** @type {number[]} */
  const codewords = [];
  for (let i = 0; i < bits.length; i += 8) codewords.push(bits.slice(i, i + 8).reduce((octet, bit) => (octet << 1) | bit, 0));
  return codewords;
}

// Tous les codewords, dans l'ordre où ils se posent : les blocs de données entrelacés, puis leurs corrections.
/** @param {readonly number[]} donnees @param {number} version */
export function codewordsEntrelaces(donnees, version) {
  const { correction, premiers, donneesDesPremiers, seconds, donneesDesSeconds } = blocsDe(version);
  /** @type {number[][]} */
  const blocs = [];
  let debut = 0;
  for (let i = 0; i < premiers + seconds; i++) {
    const longueur = i < premiers ? donneesDesPremiers : donneesDesSeconds;
    blocs.push(donnees.slice(debut, debut + longueur));
    debut += longueur;
  }
  const corrections = blocs.map((bloc) => correctionDe(bloc, correction));
  /** @type {number[]} */
  const rendus = [];
  const plusLong = Math.max(donneesDesPremiers, donneesDesSeconds);
  for (let i = 0; i < plusLong; i++) for (const bloc of blocs) if (i < bloc.length) rendus.push(/** @type {number} */ (bloc[i]));
  for (let i = 0; i < correction; i++) for (const bloc of corrections) rendus.push(/** @type {number} */ (bloc[i]));
  return rendus;
}

// --- La matrice ------------------------------------------------------------------------------------------------------

// Les centres des motifs d'alignement, sur chaque axe.
/** @param {number} version */
export function alignementsDe(version) {
  if (version === 1) return [];
  const nombre = Math.floor(version / 7) + 2;
  const pas = Math.floor((version * 8 + nombre * 3 + 5) / (nombre * 4 - 4)) * 2;
  const centres = [6];
  for (let position = cote(version) - 7; centres.length < nombre; position -= pas) centres.splice(1, 0, position);
  return centres;
}

// Les quinze bits de format : le niveau et le masque, leur code BCH, et le masque fixe de la norme.
/** @param {number} masque */
export function bitsDeFormat(masque) {
  const donnees = (NIVEAU_M << 3) | masque;
  let reste = donnees;
  for (let i = 0; i < 10; i++) reste = (reste << 1) ^ ((reste >>> 9) * 0x537);
  return ((donnees << 10) | reste) ^ 0x5412;
}

// Les dix-huit bits de version, à partir de la septième.
/** @param {number} version */
export function bitsDeVersion(version) {
  let reste = version;
  for (let i = 0; i < 12; i++) reste = (reste << 1) ^ ((reste >>> 11) * 0x1f25);
  return (version << 12) | reste;
}

/** @type {readonly ((x: number, y: number) => boolean)[]} */
const MASQUES = [
  (x, y) => (x + y) % 2 === 0,
  (_x, y) => y % 2 === 0,
  (x) => x % 3 === 0,
  (x, y) => (x + y) % 3 === 0,
  (x, y) => (Math.floor(x / 3) + Math.floor(y / 2)) % 2 === 0,
  (x, y) => ((x * y) % 2) + ((x * y) % 3) === 0,
  (x, y) => (((x * y) % 2) + ((x * y) % 3)) % 2 === 0,
  (x, y) => (((x + y) % 2) + ((x * y) % 3)) % 2 === 0,
];

/** @param {number} version */
function grille(version) {
  const n = cote(version);
  const modules = Array.from({ length: n }, () => new Array(n).fill(false));
  const fixes = Array.from({ length: n }, () => new Array(n).fill(false));
  /** @param {number} x @param {number} y @param {boolean} sombre */
  const poser = (x, y, sombre) => {
    /** @type {boolean[]} */ (modules[y])[x] = sombre;
    /** @type {boolean[]} */ (fixes[y])[x] = true;
  };
  // Le rythme, une ligne et une colonne qui alternent.
  for (let i = 0; i < n; i++) {
    poser(6, i, i % 2 === 0);
    poser(i, 6, i % 2 === 0);
  }
  // Les trois repères, entourés de leur bande claire.
  for (const [cx, cy] of [
    [3, 3],
    [n - 4, 3],
    [3, n - 4],
  ]) {
    for (let dy = -4; dy <= 4; dy++)
      for (let dx = -4; dx <= 4; dx++) {
        const x = /** @type {number} */ (cx) + dx;
        const y = /** @type {number} */ (cy) + dy;
        const distance = Math.max(Math.abs(dx), Math.abs(dy));
        if (x >= 0 && x < n && y >= 0 && y < n) poser(x, y, distance !== 2 && distance !== 4);
      }
  }
  // Les alignements, sauf là où ils couvriraient un repère.
  const centres = alignementsDe(version);
  for (const [i, cx] of centres.entries())
    for (const [j, cy] of centres.entries()) {
      const surUnRepere = (i === 0 && j === 0) || (i === 0 && j === centres.length - 1) || (i === centres.length - 1 && j === 0);
      if (surUnRepere) continue;
      for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) poser(cx + dx, cy + dy, Math.max(Math.abs(dx), Math.abs(dy)) !== 1);
    }
  // La place du format (posé plus tard, avec son masque), et celle de la version.
  poserLeFormat(modules, fixes, 0);
  if (version >= 7) {
    const bits = bitsDeVersion(version);
    for (let i = 0; i < 18; i++) {
      const sombre = ((bits >>> i) & 1) === 1;
      const a = n - 11 + (i % 3);
      const b = Math.floor(i / 3);
      poser(a, b, sombre);
      poser(b, a, sombre);
    }
  }
  return { n, modules, fixes };
}

/** @param {boolean[][]} modules @param {boolean[][]} fixes @param {number} masque */
function poserLeFormat(modules, fixes, masque) {
  const n = modules.length;
  const bits = bitsDeFormat(masque);
  /** @param {number} x @param {number} y @param {number} rang */
  const poser = (x, y, rang) => {
    /** @type {boolean[]} */ (modules[y])[x] = ((bits >>> rang) & 1) === 1;
    /** @type {boolean[]} */ (fixes[y])[x] = true;
  };
  for (let i = 0; i <= 5; i++) poser(8, i, i);
  poser(8, 7, 6);
  poser(8, 8, 7);
  poser(7, 8, 8);
  for (let i = 9; i < 15; i++) poser(14 - i, 8, i);
  for (let i = 0; i < 8; i++) poser(n - 1 - i, 8, i);
  for (let i = 8; i < 15; i++) poser(8, n - 15 + i, i);
  // Le module sombre, toujours.
  /** @type {boolean[]} */ (modules[n - 8])[8] = true;
  /** @type {boolean[]} */ (fixes[n - 8])[8] = true;
}

// Les codewords posés en zigzag, deux colonnes à la fois, de bas en haut puis de haut en bas, en sautant le rythme.
/** @param {boolean[][]} modules @param {boolean[][]} fixes @param {readonly number[]} codewords */
function poserLesCodewords(modules, fixes, codewords) {
  const n = modules.length;
  let i = 0;
  for (let droite = n - 1; droite >= 1; droite -= 2) {
    if (droite === 6) droite = 5;
    for (let pas = 0; pas < n; pas++)
      for (let j = 0; j < 2; j++) {
        const x = droite - j;
        const montant = ((droite + 1) & 2) === 0;
        const y = montant ? n - 1 - pas : pas;
        if (/** @type {boolean[]} */ (fixes[y])[x] || i >= codewords.length * 8) continue;
        /** @type {boolean[]} */ (modules[y])[x] = ((/** @type {number} */ (codewords[i >>> 3]) >>> (7 - (i & 7))) & 1) === 1;
        i++;
      }
  }
}

/** @param {boolean[][]} modules @param {boolean[][]} fixes @param {number} masque */
function masquer(modules, fixes, masque) {
  const regle = /** @type {(x: number, y: number) => boolean} */ (MASQUES[masque]);
  return modules.map((ligne, y) => ligne.map((sombre, x) => (/** @type {boolean[]} */ (fixes[y])[x] ? sombre : sombre !== regle(x, y))));
}

// La pénalité d'une matrice masquée : les quatre règles de la norme — longues suites, carrés, motifs qui ressemblent
// à un repère, déséquilibre entre sombre et clair. Le masque retenu est celui qui en a le moins.
/** @param {boolean[][]} modules */
export function penalite(modules) {
  const n = modules.length;
  let total = 0;
  /** @param {(i: number, j: number) => boolean} lire */
  const suites = (lire) => {
    for (let i = 0; i < n; i++) {
      let longueur = 1;
      for (let j = 1; j <= n; j++) {
        if (j < n && lire(i, j) === lire(i, j - 1)) longueur++;
        else {
          if (longueur >= 5) total += longueur - 2;
          longueur = 1;
        }
      }
      for (let j = 0; j + 11 <= n; j++) {
        const motif = Array.from({ length: 11 }, (_, k) => (lire(i, j + k) ? 1 : 0)).join("");
        if (motif === "10111010000" || motif === "00001011101") total += 40;
      }
    }
  };
  suites((y, x) => /** @type {boolean} */ (/** @type {boolean[]} */ (modules[y])[x]));
  suites((x, y) => /** @type {boolean} */ (/** @type {boolean[]} */ (modules[y])[x]));
  for (let y = 0; y + 1 < n; y++)
    for (let x = 0; x + 1 < n; x++) {
      const a = /** @type {boolean[]} */ (modules[y])[x];
      if (a === /** @type {boolean[]} */ (modules[y])[x + 1] && a === /** @type {boolean[]} */ (modules[y + 1])[x] && a === /** @type {boolean[]} */ (modules[y + 1])[x + 1]) total += 3;
    }
  const sombres = modules.reduce((somme, ligne) => somme + ligne.filter(Boolean).length, 0);
  total += Math.floor(Math.abs(sombres * 20 - n * n * 10) / (n * n)) * 10;
  return total;
}

// La matrice d'un texte : `true` pour un module sombre, ligne par ligne, sans la marge claire autour.
/** @param {string} texte */
export function matriceDuQr(texte) {
  const octets = octetsDe(texte);
  const version = versionPour(octets.length);
  const { modules, fixes } = grille(version);
  poserLesCodewords(modules, fixes, codewordsEntrelaces(codewordsDeDonnees(octets, version), version));
  /** @type {boolean[][] | undefined} */
  let retenue;
  let moindre = Infinity;
  for (let masque = 0; masque < MASQUES.length; masque++) {
    const essai = masquer(modules, fixes, masque);
    poserLeFormat(essai, fixes.map((ligne) => [...ligne]), masque);
    const cout = penalite(essai);
    if (cout < moindre) {
      moindre = cout;
      retenue = essai;
    }
  }
  return /** @type {boolean[][]} */ (retenue);
}

// L'image d'un QR : un SVG d'un seul tracé, sa marge de quatre modules autour, en adresse `data:` — et son côté, en
// modules, marge comprise, que la vue multiplie par un nombre entier de pixels : chaque module y a la même taille. Il
// n'écrit aucune couleur — les couleurs ne s'écrivent que dans jetons.css : ses modules sont du noir que SVG donne à
// tout tracé, et le reste est transparent ; c'est la peau qui pose le fond clair dessous (vue.css, `.qr`).
/** @param {string} texte @returns {{ src: string, cote: number }} */
export function imageDuQr(texte) {
  const modules = matriceDuQr(texte);
  const marge = 4;
  const cote = modules.length + 2 * marge;
  const trace = modules.flatMap((ligne, y) => ligne.flatMap((sombre, x) => (sombre ? [`M${x + marge} ${y + marge}h1v1h-1z`] : []))).join("");
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${cote} ${cote}" shape-rendering="crispEdges"><path d="${trace}"/></svg>`;
  return { src: `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`, cote };
}
