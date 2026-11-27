// Le nom d'un projet n'est pas qu'une étiquette : c'est celui que la box donne à son
// instance (`brigade@<nom>.service`), et celui que ses gestes reçoivent. L'écran d'ajout
// le refuse donc comme la box le refuserait, et avant de l'appeler : la même règle,
// dite à la saisie avec sa raison.

// La règle de la box : `NOM_DE_PROJET` (runtime/src/runtime.ts), et la longueur que son
// geste d'installation admet (runtime/src/installateur.ts). Le test les compare.
const SHAPE = /^[a-z0-9][a-z0-9-]*$/;
const LENGTH_MAX = 63;
export const SHAPE_EXPECTED = `lowercase letters, digits and hyphens, no leading hyphen, ${LENGTH_MAX} characters at most (\`shop\`, \`my-kitchen-2\`)`;

// La raison, si la box refuse ce nom ; rien sinon, et rien d'un champ vide — qui, lui, manque.
export function refusalOfShape(name: string): string | undefined {
  const typed = name.trim();
  if (typed === "" || (SHAPE.test(typed) && typed.length <= LENGTH_MAX)) return undefined;
  const bad = [...new Set([...typed].filter((c) => !/[a-z0-9-]/.test(c)).map((c) => (c === " " ? "space" : `“${c}”`)))].join(", ");
  const why = bad !== "" ? `it contains ${bad}` : typed.startsWith("-") ? "it starts with a hyphen" : `it is ${typed.length} characters long`;
  return `The station refuses this name — ${why}. Expected: ${SHAPE_EXPECTED}.`;
}
