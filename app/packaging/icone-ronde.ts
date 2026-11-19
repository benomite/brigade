// Le fond de l'icône ronde d'Android, tiré de l'icône maître : tout ce qui précède le glyphe
// (`<g transform="translate(5.5…`), dont les rx sont relevés de 17 : le carré arrondi devient un disque.
export function fondRond(icone: string): string {
  const fond = /^<svg[^>]*>(.*?)<g transform="translate\(5\.5/.exec(icone)?.[1];
  if (fond === undefined) throw new Error("icône maître illisible : le glyphe `translate(5.5` est introuvable");
  return fond.replace(/rx="([\d.]+)"/g, (_, r) => `rx="${Number(r) + 17}"`);
}
