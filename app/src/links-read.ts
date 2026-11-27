// Les adresses que le process principal a rendues à la vue pour un ticket, seules que `ouvrirLien` ouvre : celles de sa
// discussion (remplacées à chaque lecture de l'issue) et celles de ses captures qui ne se lisent pas (gardées à part, pour
// qu'une lecture de la discussion ne les efface pas).
export class LinksRead {
  private readonly discussions = new Map<string, readonly string[]>();
  private readonly captures = new Map<string, Set<string>>();
  discussion(key: string, links: readonly string[]): void {
    this.discussions.set(key, links);
  }
  capture(key: string, link: string): void {
    const already = this.captures.get(key) ?? new Set<string>();
    already.add(link);
    this.captures.set(key, already);
  }
  connait(key: string, url: string): boolean {
    return (this.discussions.get(key) ?? []).includes(url) || (this.captures.get(key)?.has(url) ?? false);
  }
}
