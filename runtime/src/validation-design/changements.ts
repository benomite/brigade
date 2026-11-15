// Les lignes de changement d'une livraison design (#3617) : ce que le cook a
// changé à l'écran, une puce par changement, au format
//
//     ## Changes
//     - <place on the screen>: '<before>' -> '<after>'
//
// - Le cook les écrit dans son dernier message (`CONSIGNE_DES_CHANGEMENTS`,
//   dans la consigne des captures) ; la station les lit à la fin de sa
//   cuisson et les pose dans le corps de la PR, sous le même titre
//   (`avecChangements`) — à son ouverture, et à chaque livraison suivante sur
//   la PR encore ouverte.
// - La pass, quand elle pose la carte « Validate its screen », les relit dans
//   le corps de la PR et les montre au-dessus des captures, une ligne par
//   puce (`lignesDesChangements`). Pas de section `## Changes` : la carte se
//   pose quand même, sans lignes.

const TITRE_DES_CHANGEMENTS = "## Changes";
// Le titre des lignes sur la carte : un titre de niveau 3, comme ceux du brief
// que l'app lit, pour que « What was done » s'arrête avant elles.
const TITRE_SUR_LA_CARTE = "### Changes";

export const CONSIGNE_DES_CHANGEMENTS = `Écris aussi, dans ce dernier message, chaque changement visible sous un titre \`${TITRE_DES_CHANGEMENTS}\` seul sur sa ligne, une puce par changement, en anglais : \`- <place on the screen>: '<before>' -> '<after>'\` (par exemple \`- footer of the home page: 'v1.2' -> 'v1.3'\`). La station les recopie dans le corps de la PR, et la carte du chef les montre au-dessus des captures.`;

const estUnTitre = (ligne: string) => /^\s{0,3}#{1,6}(\s|$)/.test(ligne);
const estLeTitre = (ligne: string) => /^\s{0,3}##\s+Changes\s*#*\s*$/i.test(ligne);

// Les lignes de la section : de son titre au titre suivant, ou à la fin.
function section(texte: string): { debut: number; fin: number; lignes: string[] } | null {
  const lignes = texte.replace(/\r\n?/g, "\n").split("\n");
  const debut = lignes.findIndex(estLeTitre);
  if (debut === -1) return null;
  const suivant = lignes.findIndex((ligne, rang) => rang > debut && estUnTitre(ligne));
  return { debut, fin: suivant === -1 ? lignes.length : suivant, lignes };
}

// Les puces sous `## Changes`, une par changement, sans leur tiret ; nulles
// s'il n'y a pas de section, ou qu'elle n'en a aucune.
export function lireChangements(texte: string | null | undefined): string[] | null {
  const lue = texte === null || texte === undefined ? null : section(texte);
  if (lue === null) return null;
  const puces = lue.lignes
    .slice(lue.debut + 1, lue.fin)
    .flatMap((ligne) => {
      const puce = /^\s*[-*+]\s+(.*)$/.exec(ligne)?.[1];
      return puce === undefined ? [] : [puce.replace(/\s+/g, " ").trim()];
    })
    .filter((puce) => puce !== "");
  return puces.length === 0 ? null : puces;
}

// Le corps de la PR avec ces lignes sous `## Changes`, à la fin : la section
// qu'il portait déjà est remplacée — retirée, si `changements` est nul. Sans
// section ni lignes, le corps reste tel quel.
export function avecChangements(corps: string, changements: readonly string[] | null): string {
  const lue = section(corps);
  if (lue === null && (changements === null || changements.length === 0)) return corps;
  const sans = lue === null ? corps.replace(/\r\n?/g, "\n") : [...lue.lignes.slice(0, lue.debut), ...lue.lignes.slice(lue.fin)].join("\n");
  const base = sans.replace(/\s+$/, "");
  if (changements === null || changements.length === 0) return base;
  return [base, "", TITRE_DES_CHANGEMENTS, "", ...changements.map((ligne) => `- ${ligne}`)].join("\n");
}

// Ce que la carte montre des lignes, au-dessus des captures : rien sans elles.
export const lignesDesChangements = (changements: readonly string[] | null): string[] => (changements === null ? [] : [TITRE_SUR_LA_CARTE, "", ...changements.map((ligne) => `- ${ligne}`), ""]);
