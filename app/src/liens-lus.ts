// Les adresses que le process principal a rendues à la vue pour un ticket, seules que `ouvrirLien` ouvre : celles de sa
// discussion (remplacées à chaque lecture de l'issue) et celles de ses captures qui ne se lisent pas (gardées à part, pour
// qu'une lecture de la discussion ne les efface pas).
export class LiensLus {
  private readonly discussions = new Map<string, readonly string[]>();
  private readonly captures = new Map<string, Set<string>>();
  discussion(cle: string, liens: readonly string[]): void {
    this.discussions.set(cle, liens);
  }
  capture(cle: string, lien: string): void {
    const deja = this.captures.get(cle) ?? new Set<string>();
    deja.add(lien);
    this.captures.set(cle, deja);
  }
  connait(cle: string, url: string): boolean {
    return (this.discussions.get(cle) ?? []).includes(url) || (this.captures.get(cle)?.has(url) ?? false);
  }
}
