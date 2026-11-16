// La classe de chaque critère d'acceptation (#3740, épique #3739) : à la
// qualification, le manager classe chaque critère `testable` — un comportement
// que l'utilisateur observe, qui reçoit un test gelé — ou `not-testable` — rien
// d'écrit avant la livraison ne le juge —, et nomme pour ce dernier la preuve
// que la livraison doit à la place (une capture, le diff, un cas d'évaluation,
// une valeur mesurée…).
//
// Le contrat de la fiche, partagé avec la pass : chaque critère porte `class`,
// et un critère `not-testable` une `proof` non vide. Un ticket sans critère
// testable saute l'étape des tests, et sa fiche dit pourquoi ; les mutations ne
// se jouent que sur un ticket qui a des tests gelés.

export type ClasseDeCritere = { criterion: string; class: "testable" } | { criterion: string; class: "not-testable"; proof: string };

// Les classes que le manager a rendues, lues d'une valeur JSON : un tableau
// d'objets `{criterion, class, proof?}`. Ce qui ne s'y conforme pas le dit,
// sans classe inventée — un critère sans classe lisible n'est ni testé ni
// dispensé de l'être.
export function lireLesClasses(valeur: unknown): { classes: ClasseDeCritere[] } | { illisible: string } {
  if (!Array.isArray(valeur) || valeur.length === 0) return { illisible: "the classes of the criteria are not a non-empty list" };
  const classes: ClasseDeCritere[] = [];
  for (const [rang, entree] of valeur.entries()) {
    const ou = `criterion ${rang + 1}`;
    if (typeof entree !== "object" || entree === null) return { illisible: `${ou} is not an object` };
    const { criterion, class: classe, proof } = entree as Record<string, unknown>;
    if (typeof criterion !== "string" || criterion.trim() === "") return { illisible: `${ou} has no text` };
    if (classe === "testable") classes.push({ criterion, class: "testable" });
    else if (classe === "not-testable") {
      if (typeof proof !== "string" || proof.trim() === "") return { illisible: `${ou} is not testable and names no proof` };
      classes.push({ criterion, class: "not-testable", proof: proof.trim() });
    } else return { illisible: `${ou} has no class 'testable' or 'not-testable'` };
  }
  return { classes };
}

// L'étape des tests ne part que pour un ticket qui a au moins un critère testable.
export const aDesCriteresTestables = (classes: readonly ClasseDeCritere[]): boolean => classes.some((c) => c.class === "testable");

// Les mutations ne se jouent que contre des tests gelés.
export const doitMuter = (testsGeles: number): boolean => testsGeles > 0;

// La ligne de la fiche d'un ticket sans critère testable : pourquoi l'étape des
// tests est sautée, et par quelles preuves, chacune une fois, dans leur ordre.
export function ligneSansCritereTestable(classes: readonly ClasseDeCritere[]): string | null {
  if (classes.length === 0 || aDesCriteresTestables(classes)) return null;
  const preuves = [...new Set(classes.flatMap((c) => (c.class === "not-testable" ? [c.proof] : [])))];
  return `no testable criterion: proof by ${preuves.join(" / ")}`;
}

// Les lignes de la fiche : chaque critère, sa classe et, s'il n'est pas
// testable, sa preuve ; puis, sans critère testable, la ligne qui le dit.
export function lignesDeLaFiche(classes: readonly ClasseDeCritere[]): string[] {
  const lignes = classes.map((c) => (c.class === "testable" ? `- ${c.criterion} — testable` : `- ${c.criterion} — not testable, proof: ${c.proof}`));
  const sans = ligneSansCritereTestable(classes);
  return sans === null ? lignes : [...lignes, "", sans];
}
