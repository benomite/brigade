// Les couleurs d'un projet : celle de son onglet, dans la barre, et celle de son accent, dans son
// espace — pour qu'un projet se reconnaisse d'un coup d'œil, sans lire son nom. Tirées pour lui
// quand il entre dans le fichier des projets, écrites dans ce fichier, et réglables depuis l'app.
// Elles ne touchent jamais aux couleurs d'état de la peau (vert, jaune, rouge, bleu, gris) : une
// alerte se lit pareil dans tous les projets. La palette les évite, et ne contient aucune d'elles.
//
// La palette vit ici, et non dans vue/jetons.css : une couleur de projet est une donnée du fichier
// des projets, que le chef peut écrire à la main (`#rrggbb`) — la peau ne fait que la poser.

export const ROLES = ["onglet", "accent"] as const;
export type Role = (typeof ROLES)[number];
// Ce que le fichier dit d'un projet : chacune peut manquer — elle est alors tirée (config.ts).
export type Couleurs = { [R in Role]?: string };

// Sept teintes claires, lisibles sur le fond sombre de la peau et sous le texte foncé d'une case
// choisie, loin des tons d'état — ni vert, ni jaune, ni rouge, ni bleu, ni gris. La première est l'accent de la maquette.
export const PALETTE: readonly { nom: string; valeur: string }[] = [
  { nom: "orange", valeur: "#f2994a" },
  { nom: "purple", valeur: "#a98cf2" },
  { nom: "turquoise", valeur: "#4fc7b5" },
  { nom: "pink", valeur: "#f28cbf" },
  { nom: "sand", valeur: "#d9b98a" },
  { nom: "indigo", valeur: "#8a84f0" },
  { nom: "orchid", valeur: "#d77ee0" },
];

// Un projet a ses deux couleurs : aucune n'est à tirer.
export const entieres = (couleurs: Couleurs | undefined): boolean => ROLES.every((role) => couleurs?.[role] !== undefined);

// Une couleur s'écrit `#rrggbb` : c'est la forme que l'app écrit, et la seule qu'elle lise.
const ECRITE = /^#[0-9a-f]{6}$/i;
export const estCouleur = (valeur: unknown): valeur is string => typeof valeur === "string" && ECRITE.test(valeur);

// Une couleur de la palette, pour un rôle : de préférence une qu'aucun autre projet ne porte dans
// ce rôle ; toutes prises, l'une des moins portées. `prises` : celles des autres projets.
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

// Ce que la vue demande — un rôle et une couleur de la palette, par son nom — ou pourquoi rien
// n'est changé. La vue ne propose que la palette : rien d'autre n'est écrit depuis elle.
export function choix(role: unknown, nom: unknown): { role: Role; valeur: string } | { refus: string } {
  if (!ROLES.includes(role as Role)) return { refus: `“${String(role)}” is not a project color: ${ROLES.join(" or ")}` };
  const choisie = PALETTE.find((couleur) => couleur.nom === nom);
  if (choisie === undefined) return { refus: `“${String(nom)}” is not in the palette: ${PALETTE.map((couleur) => couleur.nom).join(", ")}` };
  return { role: role as Role, valeur: choisie.valeur };
}
