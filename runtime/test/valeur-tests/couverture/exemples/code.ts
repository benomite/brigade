// Le code des suites d'exemple de `couverture.test.ts`. Ses numéros de ligne
// sont ceux qu'attend le test : n'y ajoute rien qu'à la fin.
export function f(x: number): number {
  return x + 1;
}
export function g(x: number): number {
  return x * 2;
}
export function signe(x: number): string {
  if (x > 0) {
    return "positif";
  }
  return "négatif";
}
export function h(): string {
  return "h";
}
export function k(): string {
  return "k";
}
export function parent(): string {
  return "parent";
}
export function enfant(): string {
  return "enfant";
}
