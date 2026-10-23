// Le crochet PreToolUse de l'outil Bash du cook du bac à sable : lit sur
// l'entrée standard l'appel que `claude` s'apprête à faire, et autorise la
// commande si `estUneVerification` l'accepte. Sinon il n'autorise rien : `dontAsk`
// décide comme sans crochet (il lit déjà sans demander `ls`, `git status`…, que
// le crochet ne doit pas refuser). Mais le refus de `dontAsk` est un message fixe
// qui ne dit pas quoi faire : le crochet y joint `CONSIGNE_DE_REFUS`, en contexte
// de l'appel pour toute commande refusée, et comme raison d'un refus posé par lui
// quand la commande vise les tests ou les linters sans être acceptée.
import { CONSIGNE_DE_REFUS } from "./configuration.ts";
import { estUneVerification, viseUneVerification } from "./verification.ts";

let entree = "";
process.stdin.setEncoding("utf8");
process.stdin.on("data", (morceau) => (entree += morceau));
process.stdin.on("end", () => {
  let commande: unknown;
  try {
    commande = (JSON.parse(entree) as { tool_input?: { command?: unknown } }).tool_input?.command;
  } catch {
    return;
  }
  if (typeof commande !== "string") return;
  const sortie = (decision: object) => process.stdout.write(JSON.stringify({ hookSpecificOutput: { hookEventName: "PreToolUse", ...decision } }));
  if (estUneVerification(commande)) sortie({ permissionDecision: "allow", permissionDecisionReason: "commande de vérification du projet" });
  else if (viseUneVerification(commande)) sortie({ permissionDecision: "deny", permissionDecisionReason: CONSIGNE_DE_REFUS, additionalContext: CONSIGNE_DE_REFUS });
  else sortie({ additionalContext: CONSIGNE_DE_REFUS });
});
