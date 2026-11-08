// La dérive de la fiabilité des cooks d'un projet (#987), telle que `status` la signale : la part livrée du
// premier coup sous son seuil, ou les tokens perdus au-delà du leur. L'app n'en calcule rien : elle relit les
// lignes `drift` que la box écrit. (La lecture de `measures` et la page de fiabilité de l'onglet Cooks sont
// parties avec lui, #2921.)

// --- La dérive, dans `status` ---------------------------------------------------------

// Ce que la file dit d'une fiabilité qui a dérivé : ses lignes `drift` (runtime/src/etat.ts) — la part
// livrée du premier coup sous son seuil, ou les tokens perdus au-delà du leur —, sans le geste qui les
// suit. Les autres seuils franchis (tests, dépôt, ticket le plus cher) ne sont pas la fiabilité des cooks.
export function deriveDe(status: string): string[] {
  return [...status.matchAll(/^drift {6}(.*)$/gm)].flatMap(([, ligne = ""]) => {
    const dite = ligne.replace(/ — `[^`]*`$/, "");
    if (/delivered on the first try/.test(dite)) return [dite];
    return dite.split(" · ").filter((jauge) => /^tokens lost over the last/.test(jauge));
  });
}
