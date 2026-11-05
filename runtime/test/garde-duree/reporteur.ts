// Le reporter qui juge la durée de chaque test (#2129) : il tourne dans le process du lanceur, voit passer tous
// les fichiers, et met le code de sortie à 1 avec la liste des tests de plus de 2 s qu'aucune exception n'excuse.
// Branché par le script `test` de package.json, à côté du reporter `spec` qui garde la sortie habituelle.
import { dureeSansCharge, Releve } from "../../test-hang-guard/charge.ts";
import { EXCEPTIONS } from "./exceptions.ts";
import { execFileSync } from "node:child_process";
import { chemin, fichiersDuTitre, lignesChangees, LIMITE_MS, racineDuRuntime, sourcesDesTests, testTouche, verdict, type Mesure, type Mode } from "./regle.ts";

// Le mode vient de `BRIGADE_DUREE_MODE` (#2322) : `pr` avec `BRIGADE_DUREE_BASE` (le commit de base de la PR),
// `main`, ou rien (strict, comme les gates). Un mode `pr` dont le diff ne se lit pas retombe sur strict.
function modeDemande(sources: Map<string, string>): Mode {
  const mode = process.env.BRIGADE_DUREE_MODE;
  if (mode === "main") return { genre: "main" };
  if (mode !== "pr") return { genre: "strict" };
  try {
    const diff = execFileSync("git", ["diff", "-U0", "--relative", "--no-color", process.env.BRIGADE_DUREE_BASE ?? "HEAD^1", "HEAD", "--", "."], { cwd: racineDuRuntime, encoding: "utf8", maxBuffer: 1 << 28 });
    const changees = lignesChangees(diff);
    return { genre: "pr", touche: (m) => m.fichiers.length === 0 || m.fichiers.some((f) => testTouche(m.test, sources.get(f) ?? "", changees.get(f) ?? new Set())) };
  } catch {
    return { genre: "strict" };
  }
}

// `charge` donne le facteur de charge subi pendant les `ms` qui viennent de s'écouler ; sans lui, une sonde réelle tourne.
export async function* juge(source: AsyncIterable<{ type: string; data: any }>, charge?: { facteurSur(ms: number): number }): AsyncGenerator<string> {
  const mesures: { test: string; ms: number }[] = [];
  const fichiersJoues = new Set<string>();
  // Un test lent parce que la machine est saturée n'est pas lent (#2463) : la durée est jugée moins ce que la charge a pris.
  const releve = charge ? undefined : new Releve();
  releve?.demarre();
  const facteurSur = charge ? (ms: number) => charge.facteurSur(ms) : (ms: number) => releve!.facteurSur(ms);
  for await (const { type, data } of source) {
    if (type !== "test:pass" && type !== "test:fail") continue;
    const { file, name, details, nesting } = data;
    if (typeof name !== "string" || typeof details?.duration_ms !== "number" || details.type === "suite") continue;
    // Le test de tête de chaque fichier porte son chemin pour nom : il dit quels fichiers ont tourné.
    if (nesting === 0 && typeof file === "string" && file.replaceAll("\\", "/").endsWith(`/${name.replaceAll("\\", "/")}`)) fichiersJoues.add(chemin(racineDuRuntime, file));
    else mesures.push({ test: name, ms: dureeSansCharge(details.duration_ms, facteurSur(details.duration_ms)) });
  }
  releve?.arrete();
  // Seuls les titres qui comptent sont cherchés dans les sources : ceux de plus de 2 s et ceux de la liste.
  const sources = sourcesDesTests();
  const listes = new Set(EXCEPTIONS.flatMap((e) => ("test" in e ? [e.test] : [])));
  const pertinentes: Mesure[] = mesures
    .filter((m) => m.ms > LIMITE_MS || listes.has(m.test))
    .map((m) => ({ ...m, fichiers: fichiersDuTitre(m.test, sources) }));
  const mode = modeDemande(sources);
  const { echecs, rapport } = verdict(pertinentes, EXCEPTIONS, fichiersJoues, (fichier, titre) => fichiersDuTitre(titre, sources).includes(fichier), mode);
  const sortie: string[] = [];
  if (rapport.length > 0) sortie.push("", `ℹ garde de durée (#2129), mode ${mode.genre} : tests de plus de 2 s, signalés sans faire échouer`, ...rapport.map((f) => `  - ${f}`));
  if (echecs.length > 0) {
    process.exitCode = 1;
    sortie.push("", "✖ garde de durée (#2129) : aucun test ne dure plus de 2 s", ...echecs.map((f) => `  - ${f}`));
  }
  if (sortie.length > 0) yield [...sortie, ""].join("\n");
}

// Le lanceur appelle le reporter avec ses propres options en second argument : la sonde injectable passe par `juge`.
export default (source: AsyncIterable<{ type: string; data: any }>): AsyncGenerator<string> => juge(source);
