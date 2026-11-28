// Les adresses que le process principal a rendues à la vue pour un ticket, seules que `ouvrirLien` ouvre : celles de sa
// discussion (remplacées à chaque lecture de l'issue).
export class LinksRead {
  private readonly discussions = new Map<string, readonly string[]>();
  discussion(key: string, links: readonly string[]): void {
    this.discussions.set(key, links);
  }
  connait(key: string, url: string): boolean {
    return (this.discussions.get(key) ?? []).includes(url);
  }
}
