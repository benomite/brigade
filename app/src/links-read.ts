// Les adresses que le process principal a rendues à la vue pour un ticket, seules que `ouvrirLien` ouvre : celles de ses
// captures qui ne se lisent pas.
export class LinksRead {
  private readonly captures = new Map<string, Set<string>>();
  capture(key: string, link: string): void {
    const already = this.captures.get(key) ?? new Set<string>();
    already.add(link);
    this.captures.set(key, already);
  }
  connait(key: string, url: string): boolean {
    return this.captures.get(key)?.has(url) ?? false;
  }
}
