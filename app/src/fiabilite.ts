// La dérive de la fiabilité des cooks d'un projet (#987), telle que `status` la signale : les tokens perdus
// au-delà de leur seuil. L'app n'en calcule rien : elle relit les
// lignes `drift` que la box écrit. (La lecture de `measures` et la page de fiabilité de l'onglet Cooks sont
// parties avec lui, #2921.)

// --- La dérive, dans `status` ---------------------------------------------------------

// Ce que la file dit d'une fiabilité qui a dérivé : ses lignes `drift` (runtime/src/etat.ts) — les tokens
// perdus au-delà de leur seuil —, sans le geste qui les
// suit. Les autres seuils franchis (gates, ticket le plus cher) ne sont pas la fiabilité des cooks.
export function driftOf(status: string): string[] {
  return [...status.matchAll(/^drift {6}(.*)$/gm)].flatMap(([, line = ""]) => {
    const dite = line.replace(/ — `[^`]*`$/, "");
    return dite.split(" · ").filter((jauge) => /^tokens lost over the last/.test(jauge));
  });
}
