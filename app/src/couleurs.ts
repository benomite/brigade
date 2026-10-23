// Les couleurs d'un projet : celle de son onglet, dans la barre, et celle de son accent, dans son
// espace — pour qu'un projet se reconnaisse d'un coup d'œil, sans lire son nom. Tirées pour lui
// quand il entre dans le fichier des projets, écrites dans ce fichier, et réglables depuis l'app.
// Elles ne touchent jamais aux couleurs d'état de la peau (vert, jaune, rouge, bleu, gris) : une
// alerte se lit pareil dans tous les projets. La palette s'en tient loin, et une couleur libre qui
// s'en approche se le voit dire.
//
// La palette vit ici, et non dans vue/jetons.css : une couleur de projet est une donnée du fichier
// des projets, que le chef peut écrire à la main (`#rrggbb`) — la peau ne fait que la poser.
//
// Ce qui se ressemble se mesure (ticket 1106) : l'écart ΔE CIEDE2000 entre deux couleurs telles
// qu'affichées sur le fond de l'app (`--fond`). Elles sont opaques : affichées, elles restent
// elles-mêmes, et l'écart se prend sur leur valeur.

export const ROLES = ["onglet", "accent"] as const;
export type Role = (typeof ROLES)[number];
// Ce que le fichier dit d'un projet : chacune peut manquer — elle est alors tirée (config.ts).
export type Couleurs = { [R in Role]?: string };

// Les couleurs d'état de la peau, telles que vue/jetons.css les écrit, et le nom qu'un avertissement leur donne.
export const ETATS: readonly { nom: string; valeur: string }[] = [
  { nom: "green", valeur: "#6cc28a" },
  { nom: "yellow", valeur: "#e9c46a" },
  { nom: "red", valeur: "#ee6b5b" },
  { nom: "blue", valeur: "#7fb2f0" },
  { nom: "gray", valeur: "#7a808a" },
];

// Deux teintes de la palette sont au moins à cet écart l'une de l'autre, et de chaque couleur d'état.
export const DISTINCTES = 15;
// Une couleur libre plus près que ça d'une couleur d'état, ou de celle d'un autre projet, se le voit dire.
export const PROCHES = 10;

// Seize teintes, sur trois clartés — foncées, moyennes, pâles —, toutes lisibles sur le fond sombre
// de la peau et sous le texte foncé d'une case choisie (contraste d'au moins 4,5). Chacune est à
// DISTINCTES au moins de chaque autre et de chaque couleur d'état (test/couleurs.test.ts le mesure).
// Rangées par teinte, en tour de roue ; la première est l'accent de la maquette.
export const PALETTE: readonly { nom: string; valeur: string }[] = [
  { nom: "orange", valeur: "#f2994a" },
  { nom: "rust", valeur: "#ad7142" },
  { nom: "peach", valeur: "#ffcfb2" },
  { nom: "raspberry", valeur: "#dd527c" },
  { nom: "pink", valeur: "#f28cbf" },
  { nom: "blush", valeur: "#ffd0dc" },
  { nom: "plum", valeur: "#c060b7" },
  { nom: "purple", valeur: "#a98cf2" },
  { nom: "lavender", valeur: "#cdd5ff" },
  { nom: "cobalt", valeur: "#4579eb" },
  { nom: "teal", valeur: "#008d97" },
  { nom: "turquoise", valeur: "#25c0c5" },
  { nom: "ice", valeur: "#bbeef6" },
  { nom: "mint", valeur: "#dbf6cf" },
  { nom: "lime", valeur: "#a1c952" },
  { nom: "olive", valeur: "#8f8f3c" },
];

// Un projet a ses deux couleurs : aucune n'est à tirer.
export const entieres = (couleurs: Couleurs | undefined): boolean => ROLES.every((role) => couleurs?.[role] !== undefined);

// Une couleur s'écrit `#rrggbb` : c'est la forme que l'app écrit, et la seule qu'elle lise.
const ECRITE = /^#[0-9a-f]{6}$/i;
export const estCouleur = (valeur: unknown): valeur is string => typeof valeur === "string" && ECRITE.test(valeur);

// L'écart ΔE CIEDE2000 entre deux couleurs `#rrggbb` (Sharma, Wu et Dalal, 2005), de sRGB en
// CIELAB sous l'illuminant D65 : 0 pour la même ; au-delà de 10, deux couleurs ne se confondent plus.
export function ecart(une: string, autre: string): number {
  return ecartLab(lab(une), lab(autre));
}

// Une couleur `#rrggbb` en CIELAB (D65).
export function lab(couleur: string): [number, number, number] {
  const [r, v, b] = [1, 3, 5].map((rang) => {
    const canal = Number.parseInt(couleur.slice(rang, rang + 2), 16) / 255;
    return canal <= 0.04045 ? canal / 12.92 : ((canal + 0.055) / 1.055) ** 2.4;
  }) as [number, number, number];
  const f = (t: number) => (t > 216 / 24389 ? Math.cbrt(t) : ((24389 / 27) * t + 16) / 116);
  const x = f((0.4124564 * r + 0.3575761 * v + 0.1804375 * b) / 0.95047);
  const y = f(0.2126729 * r + 0.7151522 * v + 0.072175 * b);
  const z = f((0.0193339 * r + 0.119192 * v + 0.9503041 * b) / 1.08883);
  return [116 * y - 16, 500 * (x - y), 200 * (y - z)];
}

const DEGRE = Math.PI / 180;
// La formule elle-même, sur deux couleurs CIELAB, avec kL = kC = kH = 1.
export function ecartLab([l1, a1, b1]: readonly number[], [l2, a2, b2]: readonly number[]): number {
  const [L1 = 0, A1 = 0, B1 = 0, L2 = 0, A2 = 0, B2 = 0] = [l1, a1, b1, l2, a2, b2];
  const septieme = (c: number) => Math.sqrt(c ** 7 / (c ** 7 + 25 ** 7));
  const g = 0.5 * (1 - septieme((Math.hypot(A1, B1) + Math.hypot(A2, B2)) / 2));
  const [a1p, a2p] = [(1 + g) * A1, (1 + g) * A2];
  const [c1, c2] = [Math.hypot(a1p, B1), Math.hypot(a2p, B2)];
  const teinte = (a: number, b: number) => (a === 0 && b === 0 ? 0 : (Math.atan2(b, a) / DEGRE + 360) % 360);
  const [h1, h2] = [teinte(a1p, B1), teinte(a2p, B2)];
  const nulle = c1 * c2 === 0;
  const dh = nulle ? 0 : h2 - h1 > 180 ? h2 - h1 - 360 : h2 - h1 < -180 ? h2 - h1 + 360 : h2 - h1;
  const dL = L2 - L1;
  const dC = c2 - c1;
  const dH = 2 * Math.sqrt(c1 * c2) * Math.sin((dh * DEGRE) / 2);
  const lm = (L1 + L2) / 2;
  const cm = (c1 + c2) / 2;
  const hm = nulle ? h1 + h2 : Math.abs(h1 - h2) <= 180 ? (h1 + h2) / 2 : h1 + h2 < 360 ? (h1 + h2 + 360) / 2 : (h1 + h2 - 360) / 2;
  const t = 1 - 0.17 * Math.cos((hm - 30) * DEGRE) + 0.24 * Math.cos(2 * hm * DEGRE) + 0.32 * Math.cos((3 * hm + 6) * DEGRE) - 0.2 * Math.cos((4 * hm - 63) * DEGRE);
  const sL = 1 + (0.015 * (lm - 50) ** 2) / Math.sqrt(20 + (lm - 50) ** 2);
  const sC = 1 + 0.045 * cm;
  const sH = 1 + 0.015 * cm * t;
  const rT = -Math.sin(2 * 30 * Math.exp(-(((hm - 275) / 25) ** 2)) * DEGRE) * 2 * septieme(cm);
  return Math.sqrt((dL / sL) ** 2 + (dC / sC) ** 2 + (dH / sH) ** 2 + rT * (dC / sC) * (dH / sH));
}

// Une couleur de la palette, pour un projet qui n'en a pas : de préférence une qu'aucun autre
// projet ne porte, dans aucun rôle ; toutes prises, l'une des moins portées. `prises` : celles des
// autres projets.
export function tirer(prises: readonly (string | undefined)[], hasard: () => number = Math.random): string {
  const portees = (valeur: string) => prises.filter((prise) => prise?.toLowerCase() === valeur).length;
  const moins = Math.min(...PALETTE.map(({ valeur }) => portees(valeur)));
  const libres = PALETTE.filter(({ valeur }) => portees(valeur) === moins);
  return (libres[Math.min(libres.length - 1, Math.floor(hasard() * libres.length))] ?? PALETTE[0]!).valeur;
}

// Ce que le fichier dit des couleurs d'un projet — ou pourquoi il ne se lit pas.
export function couleursLues(lu: unknown): Couleurs | string | undefined {
  if (lu === undefined) return undefined;
  if (typeof lu !== "object" || lu === null || Array.isArray(lu)) return `“couleurs” must be an object — { "onglet": "#rrggbb", "accent": "#rrggbb" }`;
  const lues: Couleurs = {};
  for (const role of ROLES) {
    const valeur = (lu as Record<string, unknown>)[role];
    if (valeur === undefined) continue;
    if (!estCouleur(valeur)) return `“couleurs”: “${role}” must be a color written \`#rrggbb\` — “${String(valeur)}” is not one`;
    lues[role] = valeur.toLowerCase();
  }
  return Object.keys(lues).length === 0 ? undefined : lues;
}

// Ce que la vue demande — un rôle, et une couleur de la palette par son nom ou une couleur libre
// écrite `#rrggbb` — ou pourquoi rien n'est changé.
export function choix(role: unknown, couleur: unknown): { role: Role; valeur: string } | { refus: string } {
  if (!ROLES.includes(role as Role)) return { refus: `“${String(role)}” is not a project color: ${ROLES.join(" or ")}` };
  if (estCouleur(couleur)) return { role: role as Role, valeur: couleur.toLowerCase() };
  const choisie = PALETTE.find(({ nom }) => nom === couleur);
  if (choisie === undefined) return { refus: `“${String(couleur)}” is neither in the palette (${PALETTE.map(({ nom }) => nom).join(", ")}) nor a color written \`#rrggbb\`` };
  return { role: role as Role, valeur: choisie.valeur };
}

const NOMS_DES_ROLES: Record<Role, string> = { onglet: "tab", accent: "accent" };

// Ce qu'une couleur libre d'un projet a de trop proche, rôle par rôle, en une ligne : la couleur
// d'état ou celle d'un autre projet la plus proche, à moins de PROCHES. Une teinte de la palette
// n'en dit rien — elle est loin des couleurs d'état, et la partager est un choix. La couleur reste :
// la ligne le dit, elle ne retire rien.
export function proches(projet: { nom: string; couleurs?: Couleurs }, projets: readonly { nom: string; couleurs?: Couleurs }[]): Partial<Record<Role, string>> | undefined {
  const voisines = [
    ...ETATS.map(({ nom, valeur }) => ({ dit: `${nom}, a state color`, valeur })),
    ...projets.filter(({ nom }) => nom !== projet.nom).flatMap(({ nom, couleurs }) => ROLES.flatMap((role) => (couleurs?.[role] === undefined ? [] : [{ dit: `the ${NOMS_DES_ROLES[role]} of ${nom}`, valeur: couleurs[role] }]))),
  ];
  const dits: Partial<Record<Role, string>> = {};
  for (const role of ROLES) {
    const valeur = projet.couleurs?.[role];
    if (valeur === undefined || PALETTE.some((teinte) => teinte.valeur === valeur)) continue;
    const plus = voisines.map((voisine) => ({ ...voisine, ecart: ecart(valeur, voisine.valeur) })).sort((une, autre) => une.ecart - autre.ecart)[0];
    if (plus !== undefined && plus.ecart < PROCHES) dits[role] = `close to ${plus.dit} — kept anyway`;
  }
  return Object.keys(dits).length === 0 ? undefined : dits;
}
