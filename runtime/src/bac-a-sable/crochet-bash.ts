// Le crochet PreToolUse de l'outil Bash du cook du bac à sable : lit sur
// l'entrée standard l'appel que `claude` s'apprête à faire, et autorise la
// commande si `estUneVerification` l'accepte. Sinon il ne dit rien : `dontAsk`
// décide comme sans crochet.
import { estUneVerification } from "./verification.ts";

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
  if (typeof commande !== "string" || !estUneVerification(commande)) return;
  process.stdout.write(JSON.stringify({ hookSpecificOutput: { hookEventName: "PreToolUse", permissionDecision: "allow", permissionDecisionReason: "commande de vérification du projet" } }));
});
