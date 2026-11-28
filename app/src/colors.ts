// Les couleurs d'un projet : celle de son onglet, dans la barre, et celle de son accent, dans son
// espace — pour qu'un projet se reconnaisse d'un coup d'œil, sans lire son nom. Tirées pour lui
// quand il entre dans le fichier des projets, écrites dans ce fichier, et réglables depuis l'app.
// Elles ne touchent jamais aux couleurs d'état de la peau (vert, jaune, rouge, bleu, gris) : une
// alerte se lit pareil dans tous les projets. La palette s'en tient loin, et une couleur libre qui
// s'en approche se le voit dire.
//
// La palette vit ici, et non dans vue/tokens.css : une couleur de projet est une donnée du fichier
// des projets, que le chef peut écrire à la main (`#rrggbb`) — la peau ne fait que la poser.
//
// Ce qui se ressemble se mesure (ticket 1106) : l'écart ΔE CIEDE2000 entre deux couleurs telles
// qu'affichées sur le fond de l'app (`--fond`). Elles sont opaques : affichées, elles restent
// elles-mêmes, et l'écart se prend sur leur valeur.

export const ROLES = ["onglet", "accent"] as const;
export type Role = (typeof ROLES)[number];
// Ce que le fichier dit d'un projet : chacune peut manquer — elle est alors tirée (config.ts).
export type Colors = { [R in Role]?: string };

// Les couleurs d'état de la peau, telles que vue/tokens.css les écrit, et le nom qu'un avertissement leur donne.
export const STATES: readonly { nom: string; valeur: string }[] = [
  { nom: "green", valeur: "#6cc28a" },
  { nom: "yellow", valeur: "#e9c46a" },
  { nom: "red", valeur: "#ee6b5b" },
  { nom: "blue", valeur: "#7fb2f0" },
  { nom: "gray", valeur: "#7a808a" },
];

// Une couleur libre plus près que ça d'une couleur d'état, ou de celle d'un autre projet, se le voit dire.
export const CLOSE = 10;

// Seize teintes, sur trois clartés — foncées, moyennes, pâles —, toutes lisibles sur le fond sombre
// de la peau et sous le texte foncé d'une case choisie (contraste d'au moins 4,5). Chacune est à
// DISTINCTES au moins de chaque autre et de chaque couleur d'état (test/colors.test.ts le mesure).
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
export const whole = (colors: Colors | undefined): boolean => ROLES.every((role) => colors?.[role] !== undefined);

// Une couleur s'écrit `#rrggbb` : c'est la forme que l'app écrit, et la seule qu'elle lise.
const WRITTEN = /^#[0-9a-f]{6}$/i;
export const isColor = (value: unknown): value is string => typeof value === "string" && WRITTEN.test(value);

// L'écart ΔE CIEDE2000 entre deux couleurs `#rrggbb` (Sharma, Wu et Dalal, 2005), de sRGB en
// CIELAB sous l'illuminant D65 : 0 pour la même ; au-delà de 10, deux couleurs ne se confondent plus.
export function gap(one: string, other: string): number {
  return gapLab(lab(one), lab(other));
}

// Une couleur `#rrggbb` en CIELAB (D65).
export function lab(color: string): [number, number, number] {
  const [r, v, b] = [1, 3, 5].map((rank) => {
    const channel = Number.parseInt(color.slice(rank, rank + 2), 16) / 255;
    return channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
  }) as [number, number, number];
  const f = (t: number) => (t > 216 / 24389 ? Math.cbrt(t) : ((24389 / 27) * t + 16) / 116);
  const x = f((0.4124564 * r + 0.3575761 * v + 0.1804375 * b) / 0.95047);
  const y = f(0.2126729 * r + 0.7151522 * v + 0.072175 * b);
  const z = f((0.0193339 * r + 0.119192 * v + 0.9503041 * b) / 1.08883);
  return [116 * y - 16, 500 * (x - y), 200 * (y - z)];
}

const DEGREE = Math.PI / 180;
// La formule elle-même, sur deux couleurs CIELAB, avec kL = kC = kH = 1.
export function gapLab([l1, a1, b1]: readonly number[], [l2, a2, b2]: readonly number[]): number {
  const [L1 = 0, A1 = 0, B1 = 0, L2 = 0, A2 = 0, B2 = 0] = [l1, a1, b1, l2, a2, b2];
  const seventh = (c: number) => Math.sqrt(c ** 7 / (c ** 7 + 25 ** 7));
  const g = 0.5 * (1 - seventh((Math.hypot(A1, B1) + Math.hypot(A2, B2)) / 2));
  const [a1p, a2p] = [(1 + g) * A1, (1 + g) * A2];
  const [c1, c2] = [Math.hypot(a1p, B1), Math.hypot(a2p, B2)];
  const tint = (a: number, b: number) => (a === 0 && b === 0 ? 0 : (Math.atan2(b, a) / DEGREE + 360) % 360);
  const [h1, h2] = [tint(a1p, B1), tint(a2p, B2)];
  const none = c1 * c2 === 0;
  const dh = none ? 0 : h2 - h1 > 180 ? h2 - h1 - 360 : h2 - h1 < -180 ? h2 - h1 + 360 : h2 - h1;
  const ofThe = L2 - L1;
  const ofC = c2 - c1;
  const ofH = 2 * Math.sqrt(c1 * c2) * Math.sin((dh * DEGREE) / 2);
  const lm = (L1 + L2) / 2;
  const cm = (c1 + c2) / 2;
  const hm = none ? h1 + h2 : Math.abs(h1 - h2) <= 180 ? (h1 + h2) / 2 : h1 + h2 < 360 ? (h1 + h2 + 360) / 2 : (h1 + h2 - 360) / 2;
  const t = 1 - 0.17 * Math.cos((hm - 30) * DEGREE) + 0.24 * Math.cos(2 * hm * DEGREE) + 0.32 * Math.cos((3 * hm + 6) * DEGREE) - 0.2 * Math.cos((4 * hm - 63) * DEGREE);
  const sThe = 1 + (0.015 * (lm - 50) ** 2) / Math.sqrt(20 + (lm - 50) ** 2);
  const sC = 1 + 0.045 * cm;
  const sH = 1 + 0.015 * cm * t;
  const rT = -Math.sin(2 * 30 * Math.exp(-(((hm - 275) / 25) ** 2)) * DEGREE) * 2 * seventh(cm);
  return Math.sqrt((ofThe / sThe) ** 2 + (ofC / sC) ** 2 + (ofH / sH) ** 2 + rT * (ofC / sC) * (ofH / sH));
}

// Une couleur de la palette, pour un projet qui n'en a pas : de préférence une qu'aucun autre
// projet ne porte, dans aucun rôle ; toutes prises, l'une des moins portées. `prises` : celles des
// autres projets.
export function draw(taken: readonly (string | undefined)[], chance: () => number = Math.random): string {
  const scopes = (value: string) => taken.filter((taking) => taking?.toLowerCase() === value).length;
  const less = Math.min(...PALETTE.map(({ valeur: value }) => scopes(value)));
  const free = PALETTE.filter(({ valeur: value }) => scopes(value) === less);
  return (free[Math.min(free.length - 1, Math.floor(chance() * free.length))] ?? PALETTE[0]!).valeur;
}

// Ce que le fichier dit des couleurs d'un projet — ou pourquoi il ne se lit pas.
export function colorsRead(readOne: unknown): Colors | string | undefined {
  if (readOne === undefined) return undefined;
  if (typeof readOne !== "object" || readOne === null || Array.isArray(readOne)) return `“couleurs” must be an object — { "onglet": "#rrggbb", "accent": "#rrggbb" }`;
  const readEntries: Colors = {};
  for (const role of ROLES) {
    const value = (readOne as Record<string, unknown>)[role];
    if (value === undefined) continue;
    if (!isColor(value)) return `“couleurs”: “${role}” must be a color written \`#rrggbb\` — “${String(value)}” is not one`;
    readEntries[role] = value.toLowerCase();
  }
  return Object.keys(readEntries).length === 0 ? undefined : readEntries;
}

// Ce que la vue demande — un rôle, et une couleur de la palette par son nom ou une couleur libre
// écrite `#rrggbb` — ou pourquoi rien n'est changé.
export function choice(role: unknown, color: unknown): { role: Role; valeur: string } | { refus: string } {
  if (!ROLES.includes(role as Role)) return { refus: `“${String(role)}” is not a project color: ${ROLES.join(" or ")}` };
  if (isColor(color)) return { role: role as Role, valeur: color.toLowerCase() };
  const chosenOne = PALETTE.find(({ nom: name }) => name === color);
  if (chosenOne === undefined) return { refus: `“${String(color)}” is neither in the palette (${PALETTE.map(({ nom: name }) => name).join(", ")}) nor a color written \`#rrggbb\`` };
  return { role: role as Role, valeur: chosenOne.valeur };
}

const NAMES_OF_ROLES: Record<Role, string> = { onglet: "tab", accent: "accent" };

// Ce qu'une couleur libre d'un projet a de trop proche, rôle par rôle, en une ligne : la couleur
// d'état ou celle d'un autre projet la plus proche, à moins de PROCHES. Une teinte de la palette
// n'en dit rien — elle est loin des couleurs d'état, et la partager est un choix. La couleur reste :
// la ligne le dit, elle ne retire rien.
export function close(project: { nom: string; couleurs?: Colors }, projects: readonly { nom: string; couleurs?: Colors }[]): Partial<Record<Role, string>> | undefined {
  const neighbors = [
    ...STATES.map(({ nom: name, valeur: value }) => ({ dit: `${name}, a state color`, valeur: value })),
    ...projects.filter(({ nom: name }) => name !== project.nom).flatMap(({ nom: name, couleurs: colors }) => ROLES.flatMap((role) => (colors?.[role] === undefined ? [] : [{ dit: `the ${NAMES_OF_ROLES[role]} of ${name}`, valeur: colors[role] }]))),
  ];
  const saidOnes: Partial<Record<Role, string>> = {};
  for (const role of ROLES) {
    const value = project.couleurs?.[role];
    if (value === undefined || PALETTE.some((tint) => tint.valeur === value)) continue;
    const more = neighbors.map((voisine) => ({ ...voisine, ecart: gap(value, voisine.valeur) })).sort((one, other) => one.ecart - other.ecart)[0];
    if (more !== undefined && more.ecart < CLOSE) saidOnes[role] = `close to ${more.dit} — kept anyway`;
  }
  return Object.keys(saidOnes).length === 0 ? undefined : saidOnes;
}
