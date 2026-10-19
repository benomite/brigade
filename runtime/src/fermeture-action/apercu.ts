// The preview of a writing pass, before the chef says yes: what it costs, what
// the closer will do, where the request stands, and what a request made now
// would become. Read from the log alone, as the station already knows it — the
// observation is not replayed, and nothing is written: neither a request nor a
// refusal.
import type { Base } from "../base.ts";
import type { ReglagesDeFermeture } from "../events/closing.ts";
import { CANDIDATS_MAX } from "../closing/candidates.ts";
import { DEMANDEE, demandeEnAttente, passeEnCours, refus, reglagesEnVigueur, type Refus } from "../closing/condition.ts";
import { direDemandeEn, direRefusEn, direReglagesEn, pluriel } from "../closing/say.ts";
import { decider } from "./demande.ts";

// What a pass costs: the closer's calibration — the chef's quota — and the caps
// that stop it. Null without a calibration: there is no writing pass to pay.
export type Cout = { model: string; effort: string; maxTokens: number; maxRemovedLines: number; startsBelowCooks: number; text: string };

// Where the request stands. `waiting`: requested, not left — `holds`, what holds
// it back at the reading, null if it leaves at the runtime's next wake-up.
// `running`: the pass has left, under its run.
export type EtatDeLaDemande =
  | { state: "none" }
  | { state: "waiting"; since: string; stalledAt: string | null; holds: Refus | null; text: string }
  | { state: "running"; run: string };

// What a request made now would become. `leaves`: within the second; `waits`:
// requested, until `reason` lets go; `already-requested`: nothing is requested
// again; `refused`: nothing is requested, `reason` says what is missing;
// `impossible`: nothing would start it.
export type SiDemandee = { outcome: "leaves" | "waits" | "already-requested" | "refused" | "impossible"; reason: Refus | null; text: string };

export type Apercu = { configured: boolean; cost: Cout | null; does: string[]; request: EtatDeLaDemande; ifRequested: SiDemandee };

function cout(reglages: ReglagesDeFermeture | null): Cout | null {
  if (!reglages?.calibration) return null;
  const { calibration, tokens, removedLines, cooksBelow } = reglages;
  return { model: calibration.model, effort: calibration.effort, maxTokens: tokens, maxRemovedLines: removedLines, startsBelowCooks: cooksBelow, text: direReglagesEn(reglages) };
}

// What the closer will do, sentence by sentence (docs/runtime/fermeture.md, « La fermeture qui écrit »).
function fera(reglages: ReglagesDeFermeture | null): string[] {
  const plafonds = reglages
    ? `it stops at its caps — ${reglages.tokens.toLocaleString("en-US")} tokens, ${pluriel(reglages.removedLines, "line")} removed — like any cook at idleness, duration and turns, and at the chef's “stop”: stopped, it delivers nothing`
    : "it stops at its caps, and at the chef's “stop”: stopped, it delivers nothing";
  return [
    `it fetches the integration branch and replays the observation: the duplicate code blocks and dead exports it spots are its candidates, ${CANDIDATS_MAX} at most`,
    "it leaves alone what a cook in flight or a ticket in pass holds, and no cook starts on what it holds while it tidies up",
    "it removes what it is sure of, on its own branch, and says why it left each candidate it did not remove",
    "it merges nothing and never pushes onto the integration branch: it opens one PR, handed to the pass, which judges and merges it like any delivery",
    plafonds,
  ];
}

function etat(base: Base, reglages: ReglagesDeFermeture | null): EtatDeLaDemande {
  const waiting = demandeEnAttente(base);
  if (waiting !== null) {
    const holds = refus(base, reglages, false);
    return { state: "waiting", since: waiting.since, stalledAt: waiting.sansIssue, holds, text: direDemandeEn(waiting, holds) };
  }
  const run = passeEnCours(base);
  return run === null || run === DEMANDEE ? { state: "none" } : { state: "running", run };
}

function siDemandee(base: Base): SiDemandee {
  const decision = decider(base);
  switch (decision.issue) {
    case "impossible":
      return { outcome: "impossible", reason: null, text: decision.motif };
    case "deja":
      return { outcome: "already-requested", reason: decision.retenue, text: `already requested, nothing would be requested again — ${direDemandeEn(decision.demande, decision.retenue)}` };
    case "refusee":
      return { outcome: "refused", reason: decision.refus, text: `a request would be refused, nothing would start — ${direRefusEn(decision.refus)}` };
    case "demandee": {
      const { retenue, condition } = decision;
      if (retenue) return { outcome: "waits", reason: retenue, text: `a request would wait — ${direRefusEn(retenue)}; it would leave on its own, once, as soon as nothing holds it back` };
      const { enVol, seuil, rail } = condition;
      return { outcome: "leaves", reason: null, text: `a request would leave within the second — start condition met: ${pluriel(enVol, "cook")} in flight for a threshold of ${seuil}${rail === 0 ? ", rail empty" : ""}` };
    }
  }
}

export function apercevoir(base: Base): Apercu {
  const reglages = reglagesEnVigueur(base);
  const prix = cout(reglages);
  return { configured: prix !== null, cost: prix, does: fera(reglages), request: etat(base, reglages), ifRequested: siDemandee(base) };
}
