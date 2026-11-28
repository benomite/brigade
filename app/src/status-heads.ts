// Les lignes de tête de `status` — celles d'avant sa première ligne vide —, que l'accueil lit pour dire ce qui retient un projet.
// Une ligne de tête : son titre, sa valeur, et les lignes qui la précisent (le titre complété d'espaces jusqu'à onze caractères).
type Head = { titre: string; valeur: string; suite: string[] };
const LINE_OF_HEAD = /^(\S+) +(\S.*)$/;
const SUITE_OF_HEAD = /^ {11}(\S.*)$/;

export const KITCHEN = ["cuisine", "kitchen"];
export const CONNECTION = ["connexion", "connection"];

export function headsOf(status: string): Head[] {
  const heads: Head[] = [];
  for (const line of status.split("\n")) {
    if (line.trim() === "") break;
    const [, title, value] = LINE_OF_HEAD.exec(line) ?? [];
    const [, suite] = SUITE_OF_HEAD.exec(line) ?? [];
    if (title !== undefined && value !== undefined) heads.push({ titre: title, valeur: value, suite: [] });
    else if (suite !== undefined) heads.at(-1)?.suite.push(suite);
  }
  return heads;
}
