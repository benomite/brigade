// La dérive, branchée sur le runtime : les seuils du chef entrent au journal,
// et une mesure qui en franchit un y est signalée — une fois, sans qu'on le
// demande. Mécanique, pas jugement : rien n'est arrêté ni rangé.
import type { Fait } from "./evenements.ts";
import { geste } from "./geste.ts";
import type { Seuils } from "./events/drift.ts";
import { direJauge, franchis, SANS_SEUIL } from "./mesures.ts";
import { lire } from "./plafonds.ts";
import { mergedDeliveries, seuilsEnVigueur, signalements } from "./projections/measures.ts";
import type { Runtime } from "./runtime.ts";

const AUTEUR = "runtime";

// Le seuil de durée des gates (`gates_s`, en secondes d'exécution — l'attente
// du tour n'y compte pas) quand le chef n'en déclare pas : juste au-dessus des
// 90 s que les gates tiennent sur une box au calme. C'est le seul seuil qui a
// un défaut — la durée des gates ne doit pas remonter sans bruit. Une valeur
// déclarée (`BRIGADE_DRIFT_GATES_SECONDS`) la remplace.
export const SEUIL_DUREE_GATES_PAR_DEFAUT = 100;

// Un seuil non déclaré ne signale rien : aucun n'a de défaut, sauf la durée des gates. Mal écrit, c'est
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
    gatesSeconds: seuil("BRIGADE_DRIFT_GATES_SECONDS") ?? SEUIL_DUREE_GATES_PAR_DEFAUT,
    contextKb: seuil("BRIGADE_DRIFT_CONTEXT_KB"),
    repoMb: seuil("BRIGADE_DRIFT_REPO_MB"),
    merges: seuil("BRIGADE_DRIFT_MERGES", true),
    growthPercent: seuil("BRIGADE_DRIFT_GROWTH_PERCENT"),
    ticketTokens: seuil("BRIGADE_DRIFT_TICKET_TOKENS", true),
    lostTokens: seuil("BRIGADE_DRIFT_LOST_TOKENS", true),
    firstTryPercent: seuil("BRIGADE_DRIFT_FIRST_TRY_PERCENT"),
    firstTryWindow: seuil("BRIGADE_DRIFT_FIRST_TRY_WINDOW", true),
  };
}

// Écrit les seuils au journal s'ils ont changé, puis regarde à chaque merge si
// une mesure vient d'en franchir un. `seuils` : une fonction quand le chef
// peut les changer sans redémarrer (`decisions.ts`) — relus à chaque réveil,
// écrits au journal dès qu'ils changent, et toutes les mesures regardées de
// nouveau à leur aune. `avertir` : par défaut, la sortie d'erreur du runtime.
export function brancherDerive(runtime: Runtime, seuils: Seuils | (() => Seuils), avertir: (message: string) => void = (message) => console.error(message)): void {
  const { journal, projet } = runtime;
  const { base } = journal;
  const noter = (fait: Fait) => journal.ajouter({ project: projet, ticket: null, author: AUTEUR, ...fait });
  const relire = typeof seuils === "function" ? seuils : () => seuils;

  // Un projet qui n'a jamais déclaré de seuil n'a rien à écrire.
  const declarer = (lus: Seuils) =>
    base.transaction(() => {
      if (JSON.stringify(seuilsEnVigueur(base) ?? SANS_SEUIL) !== JSON.stringify(lus)) noter({ type: "drift.configured", payload: { limits: lus } });
    });
  let enVigueur = relire();
  declarer(enVigueur);

  // Le dernier merge regardé : sans merge nouveau, aucune mesure n'a bougé.
  let regarde: number | null = null;
  const regarder = () => {
    try {
      // Des seuils changés regardent de nouveau ce qui est déjà mergé.
      const lus = relire();
      if (JSON.stringify(lus) !== JSON.stringify(enVigueur)) {
        declarer(lus);
        enVigueur = lus;
        regarde = null;
      }
      const dernier = base.lire<{ seq: number | null }>("SELECT max(seq) AS seq FROM measured_merges")[0]?.seq ?? 0;
      if (dernier === regarde) return;
      base.transaction(() => {
        const courants = franchis(mergedDeliveries(base), enVigueur);
        const signales = signalements(base);
        for (const franchi of courants) {
          if (signales.includes(franchi.measure)) continue;
          noter({ type: "drift.crossed", payload: franchi });
          avertir(`brigade : dérive du projet « ${projet} » — ${direJauge(franchi)} — voir : ${geste("measures")}`);
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
