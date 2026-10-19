// The chef's two gestures on the writing pass — request it, withdraw the
// request — decided in one place, for whoever makes them: the typed command
// (`closing write`, `closing cancel`) says the outcome in words, the app reads
// it in JSON (`action.ts`). The preview asks the same question without
// writing: what a request would become if it were made now.
//
// `decider` only reads. `demander` decides and writes what it decided in the
// same transaction: a cook that leaves between the two would be seen by the
// runtime, which rereads the condition anyway.
import type { Base } from "../base.ts";
import type { ReglagesDeFermeture } from "../events/closing.ts";
import type { Journal } from "../journal.ts";
import { sessionEnCours } from "../projections/sessions.ts";
import { demandeEnAttente, faitAttendre, mesurerCondition, passeEnCours, refus, reglagesEnVigueur, type Condition, type Demande, type Refus } from "../closing/condition.ts";

const AUTEUR = "chef";

// What a request becomes.
//   `impossible`  nothing would start it, or nothing can be written: no fact is written
//   `deja`        one is already waiting: nothing is requested again, it keeps its time
//   `refusee`     what does not pass on its own — `closing.refused` is written, no request
//   `demandee`    `closing.requested` is written; `retenue`: what makes it wait, null if it leaves within the second
export type Decision =
  | { issue: "impossible"; motif: string }
  | { issue: "deja"; demande: Demande; retenue: Refus | null }
  | { issue: "refusee"; refus: Refus }
  | { issue: "demandee"; reglages: ReglagesDeFermeture; retenue: Refus | null; condition: Condition };

const projetDuJournal = (base: Base) => base.lire<{ project: string }>("SELECT project FROM events ORDER BY seq DESC LIMIT 1")[0]?.project;

// What a request made now would become — read from the log alone, nothing written.
export function decider(base: Base): Decision {
  if (!projetDuJournal(base)) return { issue: "impossible", motif: "empty log: the runtime has never started on this state directory" };
  // Nobody would launch the pass: requesting it would be letting it leave
  // later, with the chef not there.
  if (!sessionEnCours(base)) return { issue: "impossible", motif: "no runtime is running on this project: the closing pass is not requested — nothing would start it" };
  const reglages = reglagesEnVigueur(base);
  // One request at a time: asked again, it keeps its time.
  const waiting = demandeEnAttente(base);
  if (waiting !== null) return { issue: "deja", demande: waiting, retenue: refus(base, reglages, false) };
  // None is waiting: the one `passeEnCours` sees is already tidying.
  const retenue = refus(base, reglages, passeEnCours(base) !== null);
  if ((retenue && !faitAttendre(retenue)) || !reglages) return { issue: "refusee", refus: retenue ?? { reason: "unconfigured", observed: null, limit: null, detail: null } };
  return { issue: "demandee", reglages, retenue, condition: mesurerCondition(base, reglages.cooksBelow) };
}

// The chef's request: decided, and written.
export function demander(log: Journal): Decision {
  return log.base.transaction(() => {
    const decision = decider(log.base);
    const projet = projetDuJournal(log.base);
    if (decision.issue === "refusee" && projet) log.ajouter({ project: projet, ticket: null, author: AUTEUR, type: "closing.refused", payload: decision.refus });
    if (decision.issue === "demandee" && projet) log.ajouter({ project: projet, ticket: null, author: AUTEUR, type: "closing.requested", payload: {} });
    return decision;
  });
}

// What withdrawing the request becomes.
//   `aucune`   none is requested: nothing to withdraw
//   `partie`   the pass has left (`run`): it cannot be recalled
//   `retiree`  `closing.cancelled` is written; `since`: the instant it had been requested
export type Retrait = { issue: "aucune" } | { issue: "partie"; run: string } | { issue: "retiree"; since: string };

// The chef withdraws the waiting request, before it leaves. The runtime
// rereads the request in the transaction that starts the pass: withdrawn while
// it was fetching the base, it does not leave.
export function annuler(log: Journal): Retrait {
  return log.base.transaction(() => {
    const { base } = log;
    const waiting = demandeEnAttente(base);
    if (waiting === null) {
      const partie = passeEnCours(base);
      return partie === null ? { issue: "aucune" } : { issue: "partie", run: partie };
    }
    log.ajouter({ project: projetDuJournal(base) ?? "?", ticket: null, author: AUTEUR, type: "closing.cancelled", payload: {} });
    return { issue: "retiree", since: waiting.since };
  });
}
