// What the chef's gestures on the writing pass became, in words: what
// `closing write` and `closing cancel` print, and the `text` the app shows
// beside the JSON (`action.ts`). The same sentence in both places.
import { geste } from "../geste.ts";
import { ANNULER, direDemandeEn, direRefusEn, direReglagesEn } from "../closing/say.ts";
import type { Decision, Retrait } from "./demande.ts";

const SUITE = "          ";

export function direDecision(decision: Decision): string {
  switch (decision.issue) {
    case "impossible":
      return decision.motif;
    case "deja":
      return `already requested, nothing is requested again — ${direDemandeEn(decision.demande, decision.retenue)}`;
    case "refusee":
      return `closing pass refused, nothing is started — ${direRefusEn(decision.refus)}`;
    case "demandee":
      break;
  }
  const { reglages, retenue, condition } = decision;
  const plafonds = `${SUITE}${direReglagesEn(reglages)}`;
  const neMergeRien = `${SUITE}it merges nothing: what it removes arrives through a PR, with what it left for lack of certainty`;
  if (retenue) {
    return [
      `closing pass requested — it waits: ${direRefusEn(retenue)}`,
      plafonds,
      `${SUITE}the runtime starts it on its own, once, as soon as nothing holds it back — nothing to watch, nothing to restart; it reads in the \`awaiting\` block of \`${geste(`status`)}\`, where it is called out as having no way out if it still waits in two hours`,
      `${SUITE}to withdraw it before it leaves: \`${ANNULER}\``,
      neMergeRien,
    ].join("\n");
  }
  const { enVol, seuil, rail } = condition;
  return [
    `closing pass requested — start condition met: ${enVol} cook${enVol > 1 ? "s" : ""} in flight for a threshold of ${seuil}${rail === 0 ? ", rail empty" : ""}`,
    plafonds,
    `${SUITE}the runtime starts it within the second, and rereads the condition at that moment; follow it with \`${geste(`log`)}\`, “stop” halts it (\`${geste(`guardrails stop`)}\`)`,
    neMergeRien,
  ].join("\n");
}

export function direRetrait(retrait: Retrait): string {
  switch (retrait.issue) {
    case "partie":
      return `closing run ${retrait.run} has left: it cannot be recalled — “stop” halts it (\`${geste(`guardrails stop`)}\`), and nothing is delivered`;
    case "aucune":
      return "no closing pass is requested: nothing to cancel";
    case "retiree":
      return `closing pass request of ${retrait.since} withdrawn: nothing has left, and nothing will leave without another request`;
  }
}
