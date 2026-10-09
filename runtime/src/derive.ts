// La dérive, branchée sur le runtime : les seuils du chef entrent au journal,
// et une mesure qui en franchit un y est signalée — une fois, sans qu'on le
// demande. Mécanique, pas jugement : rien n'est arrêté ni rangé.
import type { Fait } from "./evenements.ts";
import type { Seuils } from "./evenements/derive.ts";
import { direJauge, franchis, SANS_SEUIL } from "./mesures.ts";
import { lire } from "./plafonds.ts";
import { livraisonsMergees, seuilsEnVigueur, signalements } from "./projections/mesures.ts";
import type { Runtime } from "./runtime.ts";

const AUTEUR = "runtime";

// Un seuil non déclaré ne signale rien : aucun n'a de défaut. Mal écrit, c'est
// un refus de démarrer — un seuil ne se désarme pas par une faute de frappe.
export function lireSeuils(env: NodeJS.ProcessEnv): Seuils {
  const seuil = (variable: string, entier = false) => {
    const brut = env[variable];
    if (brut === undefined || brut === "") return null;
    return lire(env, variable, 0, entier ? "un entier supérieur à zéro" : "un nombre supérieur à zéro", (valeur) => valeur > 0 && Number.isFinite(valeur) && (!entier || Number.isSafeInteger(valeur)));
  };
  return {
    tests: seuil("BRIGADE_DRIFT_TESTS", true),
    testsSeconds: seuil("BRIGADE_DRIFT_TESTS_SECONDS"),
    gatesSeconds: seuil("BRIGADE_DRIFT_GATES_SECONDS"),
    contextKb: seuil("BRIGADE_DRIFT_CONTEXT_KB"),
    repoMb: seuil("BRIGADE_DRIFT_REPO_MB"),
    merges: seuil("BRIGADE_DRIFT_MERGES", true),
    growthPercent: seuil("BRIGADE_DRIFT_GROWTH_PERCENT"),
  };
}

// Écrit les seuils au journal s'ils ont changé, puis regarde à chaque merge si
// une mesure vient d'en franchir un. `avertir` : par défaut, la sortie d'erreur
// du runtime.
export function brancherDerive(runtime: Runtime, seuils: Seuils, avertir: (message: string) => void = (message) => console.error(message)): void {
  const { journal, projet } = runtime;
  const { base } = journal;
  const noter = (fait: Fait) => journal.ajouter({ project: projet, ticket: null, author: AUTEUR, ...fait });

  base.transaction(() => {
    // Un projet qui n'a jamais déclaré de seuil n'a rien à écrire.
    if (JSON.stringify(seuilsEnVigueur(base) ?? SANS_SEUIL) !== JSON.stringify(seuils)) noter({ type: "drift.configured", payload: { limits: seuils } });
  });

  // Le dernier merge regardé : sans merge nouveau, aucune mesure n'a bougé.
  let regarde: number | null = null;
  const regarder = () => {
    try {
      const dernier = base.lire<{ seq: number | null }>("SELECT max(seq) AS seq FROM measured_merges")[0]?.seq ?? 0;
      if (dernier === regarde) return;
      base.transaction(() => {
        const courants = franchis(livraisonsMergees(base), seuils);
        const signales = signalements(base);
        for (const franchi of courants) {
          if (signales.includes(franchi.measure)) continue;
          noter({ type: "drift.crossed", payload: franchi });
          avertir(`brigade : dérive du projet « ${projet} » — ${direJauge(franchi)} — voir : npm --prefix runtime run mesures`);
        }
        for (const measure of signales) {
          if (!courants.some((franchi) => franchi.measure === measure)) noter({ type: "drift.cleared", payload: { measure } });
        }
      });
      regarde = dernier;
    } catch (erreur) {
      // Un relevé qui échoue n'arrête pas la cuisine : il sera repris au réveil suivant.
      avertir(`brigade : dérive non relevée — ${erreur instanceof Error ? erreur.message : String(erreur)}`);
    }
  };
  regarder();
  runtime.surReveil(regarder);
}
