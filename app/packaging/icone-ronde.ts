// Le fond de l'icône ronde d'Android, tiré de l'icône maître : tout ce qui précède le glyphe
// (`<g transform="translate(5.5…`), dont les rx sont relevés de 17 : le carré arrondi devient un disque.
export function fondRond(icone: string): string {
  const fond = /^<svg[^>]*>(.*?)<g transform="translate\(5\.5/.exec(icone)?.[1];
  if (fond === undefined) throw new Error("icône maître illisible : le glyphe `translate(5.5` est introuvable");
  return fond.replace(/rx="([\d.]+)"/g, (_, r) => `rx="${Number(r) + 17}"`);
}

// L'icône ronde d'Android : le fond en disque, le glyphe à l'échelle de l'icône maître.
export function iconeRonde(icone: string, glyphe: string): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">${fondRond(icone)}<g transform="translate(5.5 6.4) scale(.8)">${glyphe}</g></svg>`;
}
