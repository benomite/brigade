// Le reporter qui juge la durée de chaque test (#2129) : il tourne dans le process du lanceur, voit passer tous
// les fichiers, et met le code de sortie à 1 avec la liste des tests de plus de 2 s qu'aucune exception n'excuse.
// Branché par le script `test` de package.json, à côté du reporter `spec` qui garde la sortie habituelle.
import { EXCEPTIONS } from "./exceptions.ts";
import { chemin, fichiersDuTitre, jugerLesDurees, LIMITE_MS, racineDuRuntime, sourcesDesTests, type Mesure } from "./regle.ts";

export default async function* reporteur(source: AsyncIterable<{ type: string; data: any }>): AsyncGenerator<string> {
  const mesures: { test: string; ms: number }[] = [];
  const fichiersJoues = new Set<string>();
  for await (const { type, data } of source) {
    if (type !== "test:pass" && type !== "test:fail") continue;
    const { file, name, details, nesting } = data;
    if (typeof name !== "string" || typeof details?.duration_ms !== "number" || details.type === "suite") continue;
    // Le test de tête de chaque fichier porte son chemin pour nom : il dit quels fichiers ont tourné.
    if (nesting === 0 && typeof file === "string" && file.replaceAll("\\", "/").endsWith(`/${name.replaceAll("\\", "/")}`)) fichiersJoues.add(chemin(racineDuRuntime, file));
    else mesures.push({ test: name, ms: details.duration_ms });
  }
  // Seuls les titres qui comptent sont cherchés dans les sources : ceux de plus de 2 s et ceux de la liste.
  const sources = sourcesDesTests();
  const listes = new Set(EXCEPTIONS.flatMap((e) => ("test" in e ? [e.test] : [])));
  const pertinentes: Mesure[] = mesures
    .filter((m) => m.ms > LIMITE_MS || listes.has(m.test))
    .map((m) => ({ ...m, fichiers: fichiersDuTitre(m.test, sources) }));
  const fautes = jugerLesDurees(pertinentes, EXCEPTIONS, fichiersJoues, (fichier, titre) => fichiersDuTitre(titre, sources).includes(fichier));
  if (fautes.length === 0) return;
  process.exitCode = 1;
  yield ["", "✖ garde de durée (#2129) : aucun test ne dure plus de 2 s", ...fautes.map((f) => `  - ${f}`), ""].join("\n");
}
