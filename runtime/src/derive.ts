// La dérive, branchée sur le runtime : les seuils du chef entrent au journal.
// Mécanique, pas jugement : rien n'est arrêté ni rangé.
import type { Fait } from "./evenements.ts";
import type { Seuils } from "./events/drift.ts";
import { SANS_SEUIL } from "./mesures.ts";
import { lire } from "./plafonds.ts";
import { seuilsEnVigueur } from "./projections/measures.ts";
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

// Écrit les seuils au journal s'ils ont changé : `status` y lit le seuil du
// premier coup (`seuilsEnVigueur`). `seuils` : une fonction quand le chef peut
// les changer sans redémarrer (`decisions.ts`) — relus à chaque réveil, écrits
// au journal dès qu'ils changent. Le franchissement d'un seuil ne se regarde
// plus ici : le journal ne voit plus un merge depuis #2061, c'est la passe du
// closer qui le relève sur le clone (`closer-github-passe/derive-github.ts`,
// #2707). `avertir` : par défaut, la sortie d'erreur du runtime.
export function brancherDerive(runtime: Runtime, seuils: Seuils | (() => Seuils), avertir: (message: string) => void = (message) => console.error(message)): void {
  const { journal, projet } = runtime;
  const { base } = journal;
  const noter = (fait: Fait) => journal.ajouter({ project: projet, ticket: null, author: AUTEUR, ...fait });
  const relire = typeof seuils === "function" ? seuils : () => seuils;

  // Un projet qui n'a jamais déclaré de seuil n'a rien à écrire.
  const declarer = () => {
    try {
      const lus = relire();
      base.transaction(() => {
        if (JSON.stringify(seuilsEnVigueur(base) ?? SANS_SEUIL) !== JSON.stringify(lus)) noter({ type: "drift.configured", payload: { limits: lus } });
      });
    } catch (erreur) {
      // Des seuils qui ne s'écrivent pas n'arrêtent pas la cuisine : ils seront repris au réveil suivant.
      avertir(`brigade : seuils de dérive non écrits — ${erreur instanceof Error ? erreur.message : String(erreur)}`);
    }
  };
  declarer();
  runtime.surReveil(declarer);
}
