// La fin utile du journal d'un job de GitHub Actions, telle que `gh run view
// --log-failed` la montre : ce que le dossier du superviseur donne au manager
// (#3914) et ce que le renvoi d'une livraison rouge cite à son cook (#3806).
const LIGNES_MAX = 80;
export const SORTIE_MAX = 6_000;

const ANSI = /\x1b\[[0-9;]*[A-Za-z]/g;
const HORODATAGE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z ?/;

// La fin utile d'un journal de job : sans couleurs ni horodatage, coupée après
// sa dernière ligne `##[error]` (ce qui suit est le ménage du job), ses
// `LIGNES_MAX` dernières lignes, `plafond` caractères au plus — la fin gardée.
export function sortieDErreur(journal: string, plafond = SORTIE_MAX): string {
  const lignes = journal
    .split(/\r?\n/)
    .map((ligne) => ligne.replace(ANSI, "").replace(HORODATAGE, "").trimEnd())
    .filter((ligne) => !/^##\[(?:group|endgroup)\]/.test(ligne));
  const derniere = lignes.findLastIndex((ligne) => ligne.startsWith("##[error]"));
  const utiles = (derniere === -1 ? lignes : lignes.slice(0, derniere + 1)).slice(-LIGNES_MAX);
  while (utiles.length > 0 && utiles[0]?.trim() === "") utiles.shift();
  while (utiles.length > 0 && utiles.at(-1)?.trim() === "") utiles.pop();
  const texte = utiles.join("\n");
  if (texte.length <= plafond) return texte;
  const fin = texte.slice(texte.length - plafond);
  // Coupée à une ligne entière quand il y en a une.
  const saut = fin.indexOf("\n");
  return `…\n${saut === -1 || saut === fin.length - 1 ? fin : fin.slice(saut + 1)}`;
}
