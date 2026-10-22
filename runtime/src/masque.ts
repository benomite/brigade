// Le masque des secrets d'un cook : chaque valeur remplacée par son nom, dans
// tout ce qu'il dit. Seul dans son module, sans rien importer : le relais d'un
// cook (`relais.ts`) l'applique, et un process lancé pour chaque cook ne doit
// pas charger le reste du runtime pour dix lignes.

// Ce que le masque fait d'un texte : `masquer` remplace chaque valeur par
// `[secret:<nom>]` ; `fuites` nomme les secrets dont une valeur y paraît.
export type Masque = { masquer: (texte: string) => string; fuites: (texte: string) => string[] };

export function masque(env: Record<string, string>): Masque {
  // Chaque valeur, et la forme qu'elle prend dans un flux JSON. La plus longue
  // d'abord : une valeur qui en contient une autre est masquée entière.
  const formes = Object.entries(env)
    .flatMap(([nom, valeur]) => [...new Set([valeur, JSON.stringify(valeur).slice(1, -1)])].map((forme) => ({ nom, forme })))
    .sort((a, b) => b.forme.length - a.forme.length);
  return {
    masquer: (texte) => formes.reduce((reste, { nom, forme }) => reste.replaceAll(forme, `[secret:${nom}]`), texte),
    fuites: (texte) => Object.keys(env).filter((nom) => formes.some((forme) => forme.nom === nom && texte.includes(forme.forme))),
  };
}

// Le masque seul : celui que le relais applique à ce que le cook dit, sans
// relire le fichier de la machine.
export const masqueDesSecrets = (env: Record<string, string>): ((texte: string) => string) => masque(env).masquer;

