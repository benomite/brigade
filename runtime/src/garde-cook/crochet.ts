// Le crochet PreToolUse de la garde d'un cook (#3506) : lit sur l'entrée
// standard l'appel d'outil que `claude` s'apprête à faire, le juge
// (`garde.ts`), et le refuse, raison dite, s'il sort du ticket du cook. Ce
// qui passe ne reçoit aucune réponse : `claude` le traite comme sans crochet,
// et le cook, parti sans demande de permission, n'en reçoit aucune.
//
// Ce que le crochet ne sait pas lire — sa garde en argument, l'appel sur
// l'entrée — est refusé : une garde qui ne sait pas juger ne laisse rien
// passer.
import { jugerAppel, type Appel, type Garde } from "./garde.ts";

const refuser = (raison: string) => process.stdout.write(JSON.stringify({ hookSpecificOutput: { hookEventName: "PreToolUse", permissionDecision: "deny", permissionDecisionReason: raison } }));

function lireGarde(brut: string | undefined): Garde | null {
  try {
    const garde = JSON.parse(decodeURIComponent(brut ?? "")) as Partial<Garde> | null;
    const { worktree, temporaires, ticket, depot, branche } = garde ?? {};
    if (typeof worktree !== "string" || !Array.isArray(temporaires) || !temporaires.every((t) => typeof t === "string") || typeof ticket !== "number" || typeof depot !== "string" || typeof branche !== "string") return null;
    return { worktree, temporaires, ticket, depot, branche };
  } catch {
    return null;
  }
}

const garde = lireGarde(process.argv[2]);
let entree = "";
process.stdin.setEncoding("utf8");
process.stdin.on("data", (morceau) => (entree += morceau));
process.stdin.on("end", () => {
  if (garde === null) return refuser("garde du cook — la garde n'a pas pu lire ce qu'elle garde (son argument est illisible) : l'appel est refusé. Dis-le dans ton compte-rendu.");
  let appel: Appel;
  try {
    appel = JSON.parse(entree) as Appel;
    if (typeof appel !== "object" || appel === null) throw new Error("pas un objet");
  } catch {
    return refuser("garde du cook — la garde n'a pas pu lire cet appel d'outil : il est refusé.");
  }
  let raison: string | null;
  try {
    raison = jugerAppel(garde, appel, process.env);
  } catch (erreur) {
    raison = `garde du cook — la garde n'a pas pu juger cet appel (${erreur instanceof Error ? erreur.message : String(erreur)}) : il est refusé.`;
  }
  if (raison !== null) refuser(raison);
});
