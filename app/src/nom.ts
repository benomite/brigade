// Le nom d'un projet n'est pas qu'une étiquette : c'est celui que la box donne à son
// instance (`brigade@<nom>.service`), et celui que ses gestes reçoivent. L'écran d'ajout
// le refuse donc comme la box le refuserait, et avant de l'appeler : la même règle,
// dite à la saisie avec sa raison.

// La règle de la box : `NOM_DE_PROJET` (runtime/src/runtime.ts), et la longueur que son
// geste d'installation admet (runtime/src/installateur.ts). Le test les compare.
const FORME = /^[a-z0-9][a-z0-9-]*$/;
const LONGUEUR_MAX = 63;
export const FORME_ATTENDUE = `minuscules, chiffres et tirets, sans tiret en tête, ${LONGUEUR_MAX} caractères au plus (\`boutique\`, \`ma-cuisine-2\`)`;

// La raison, si la box refuse ce nom ; rien sinon, et rien d'un champ vide — qui, lui, manque.
export function refusDeForme(nom: string): string | undefined {
  const saisi = nom.trim();
  if (saisi === "" || (FORME.test(saisi) && saisi.length <= LONGUEUR_MAX)) return undefined;
  const mauvais = [...new Set([...saisi].filter((c) => !/[a-z0-9-]/.test(c)).map((c) => (c === " " ? "espace" : `« ${c} »`)))].join(", ");
  const pourquoi = mauvais !== "" ? `il contient ${mauvais}` : saisi.startsWith("-") ? "il commence par un tiret" : `il fait ${saisi.length} caractères`;
  return `La box refuse ce nom — ${pourquoi}. Attendu : ${FORME_ATTENDUE}.`;
}
