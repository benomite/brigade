// L'alerte d'urgence : quand toute la cuisine attend le chef, le runtime le
// dit une fois, puis un rappel si rien n'a bougé au bout de `RAPPEL_D_URGENCE_MS`,
// et ainsi de suite — jamais à chaque calcul (une alerte inchangée ne revient
// pas toutes les 5 minutes). L'émission est un fait du journal : ce qui a été
// dit se relit app fermée, et un redémarrage du runtime ne le redit pas.
import { direAttente, nommerAttente } from "./attend.ts";
import { CAUSES_D_URGENCE, lireEtat } from "./etat.ts";
import type { Journal } from "./journal.ts";
import { alerteEnCours } from "./projections/urgence.ts";
import type { Runtime } from "./runtime.ts";
import { cleDUrgence, type Urgence } from "./urgence.ts";

// L'espacement des rappels d'une urgence qui ne bouge pas.
export const RAPPEL_D_URGENCE_MS = 2 * 3_600_000;

// Une ligne, qui nomme ce qui bloque et dit que toute la cuisine est à l'arrêt.
export function libelleDUrgence(urgence: Urgence): string {
  const [{ attente }] = urgence.causes;
  const nom = nommerAttente(attente);
  const cause = attente.quoi === "merge" ? `ton merge de ${nom}` : `ta décision : ${nom} (${CAUSES_D_URGENCE[attente.quoi]})`;
  return `brigade : toute la cuisine attend ${cause}`.replace(/\s+/g, " ");
}

// Une passe : écrit au journal l'alerte due, s'il y en a une. Rend ce qu'elle a
// écrit, `null` quand rien n'était dû.
export function annoncerUrgence(journal: Journal, maintenant: Date): "alerte" | "rappel" | "levee" | null {
  const etat = lireEtat(journal, maintenant);
  const { base } = journal;
  const courante = alerteEnCours(base);
  const urgence = etat.urgence;
  if (urgence === null) {
    if (courante === null || etat.projet === null) return null;
    journal.ajouter({ project: etat.projet, ticket: null, author: "runtime", type: "urgence.lifted", payload: { key: courante.key } });
    return "levee";
  }
  if (etat.projet === null) return null;
  const key = cleDUrgence(urgence);
  const rappel = courante !== null && courante.key === key;
  if (rappel && maintenant.getTime() - new Date(courante.derniereLe).getTime() < RAPPEL_D_URGENCE_MS) return null;
  const [premiere] = urgence.causes;
  journal.ajouter({
    project: etat.projet,
    ticket: null,
    author: "runtime",
    type: "urgence.alerted",
    payload: {
      key,
      label: libelleDUrgence(urgence),
      decision: nommerAttente(premiere.attente),
      ticket: premiere.attente.ticket,
      cause: CAUSES_D_URGENCE[premiere.attente.quoi],
      geste: direAttente(premiere.attente),
      since: urgence.depuis,
      retenus: urgence.retenus,
      reminder: rappel,
    },
  });
  return rappel ? "rappel" : "alerte";
}

// Branche l'alerte au runtime : une passe d'emblée, puis à chaque réveil.
export function brancherAlerteUrgence<R extends Runtime>(runtime: R, options: { maintenant?: () => Date } = {}): R {
  const maintenant = options.maintenant ?? (() => new Date());
  const passer = () => {
    try {
      annoncerUrgence(runtime.journal, maintenant());
    } catch (erreur) {
      console.error(`brigade : alerte d'urgence non évaluée — ${erreur instanceof Error ? erreur.message : String(erreur)}`);
    }
  };
  passer();
  runtime.surReveil(passer);
  return runtime;
}
