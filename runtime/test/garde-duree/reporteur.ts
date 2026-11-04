// Le reporter qui juge la durée de chaque test (#2129) : il tourne dans le process du lanceur, voit passer tous
// les fichiers, et met le code de sortie à 1 avec la liste des tests de plus de 2 s qu'aucune exception n'excuse.
// Branché par le script `test` de package.json, à côté du reporter `spec` qui garde la sortie habituelle.
import { EXCEPTIONS } from "./exceptions.ts";
import { chemin, fichiersDuTitre, jugerLesDurees, LIMITE_MS, racineDuRuntime, sourcesDesTests, type Mesure } from "./regle.ts";

export default async function* reporteur(source: AsyncIterable<{ type: string; data: any }>): AsyncGenerator<string> {
  // Seuls les titres qui comptent sont cherchés dans les sources : ceux de plus de 2 s et ceux de la liste.
  // Chacun l'est une fois, dès que son test a fini : le lanceur attend ses fichiers sans rien faire, et la
  // recherche ne s'ajoute pas, en série, à la fin de la suite (#2085).
  const sources = sourcesDesTests();
  const listes = new Set(EXCEPTIONS.flatMap((e) => ("test" in e ? [e.test] : [])));
  const trouves = new Map<string, string[]>();
  const fichiersDe = (titre: string): string[] => {
    let fichiers = trouves.get(titre);
    if (fichiers === undefined) {
      fichiers = fichiersDuTitre(titre, sources);
      trouves.set(titre, fichiers);
    }
    return fichiers;
  };
  const pertinentes: Mesure[] = [];
  const fichiersJoues = new Set<string>();
  for await (const { type, data } of source) {
    if (type !== "test:pass" && type !== "test:fail") continue;
    const { file, name, details, nesting } = data;
    if (typeof name !== "string" || typeof details?.duration_ms !== "number" || details.type === "suite") continue;
    // Le test de tête de chaque fichier porte son chemin pour nom : il dit quels fichiers ont tourné.
    if (nesting === 0 && typeof file === "string" && file.replaceAll("\\", "/").endsWith(`/${name.replaceAll("\\", "/")}`)) fichiersJoues.add(chemin(racineDuRuntime, file));
    else if (details.duration_ms > LIMITE_MS || listes.has(name)) pertinentes.push({ test: name, ms: details.duration_ms, fichiers: fichiersDe(name) });
  }
  const fautes = jugerLesDurees(pertinentes, EXCEPTIONS, fichiersJoues, (fichier, titre) => fichiersDe(titre).includes(fichier));
  if (fautes.length === 0) return;
  process.exitCode = 1;
  yield ["", "✖ garde de durée (#2129) : aucun test ne dure plus de 2 s", ...fautes.map((f) => `  - ${f}`), ""].join("\n");
}
