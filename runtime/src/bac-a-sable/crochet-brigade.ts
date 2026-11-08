// Le crochet PermissionRequest du cook d'un ticket de setup (#2888) : lit sur
// l'entrée standard l'écriture que `claude` s'apprête à demander, et
// l'autorise si c'est Write ou Edit d'un fichier sous `.claude/brigade/` du
// worktree qu'il reçoit en argument (encodé, `encodeURIComponent`). Sinon il ne
// répond rien : sans réponse, `claude -p` refuse, comme en `dontAsk`.
//
// Pourquoi un crochet et pas une règle : `claude` (2.1.300) tient tout chemin
// sous un `.claude/` (hors `skills`, `agents`, `commands`, `worktrees`) pour un
// fichier sensible ; il le demande avant de lire les règles `allow` de
// `--settings`, et `dontAsk` refuse toute demande — ni règle ni crochet
// PreToolUse n'y ouvrent l'écriture. Hors `dontAsk`, la demande passe par ce
// crochet.
//
// Le chemin est comparé lien résolu : un `.claude/brigade` qu'un lien ferait
// mener ailleurs n'ouvre rien. Seul, sans le runtime : `cloison.ts`, qui sait
// résoudre un chemin, charge le journal à chaque écriture du cook.
import { existsSync, realpathSync } from "node:fs";
import { basename, dirname, isAbsolute, join, relative, resolve } from "node:path";

// Le chemin sans ses liens — jusqu'où il existe : un fichier pas encore écrit
// se compare quand même à son dossier.
const reel = (chemin: string): string => {
  const absolu = resolve(chemin);
  if (existsSync(absolu)) return realpathSync(absolu);
  const parent = dirname(absolu);
  return parent === absolu ? absolu : join(reel(parent), basename(absolu));
};

// Vrai si `fichier` est un fichier sous `.claude/brigade/` de `worktree`,
// liens résolus — le dossier lui-même n'en est pas un.
function ouvertAuSetup(worktree: string, outil: unknown, fichier: unknown): boolean {
  if ((outil !== "Write" && outil !== "Edit") || typeof fichier !== "string" || !isAbsolute(fichier) || !isAbsolute(worktree)) return false;
  const vers = relative(join(reel(worktree), ".claude", "brigade"), reel(fichier));
  return vers !== "" && !vers.startsWith("..") && !isAbsolute(vers);
}

// Un argument illisible n'ouvre rien.
let worktree = "";
try {
  worktree = decodeURIComponent(process.argv[2] ?? "");
} catch {
  // Rien d'ouvert.
}
let entree = "";
process.stdin.setEncoding("utf8");
process.stdin.on("data", (morceau) => (entree += morceau));
process.stdin.on("end", () => {
  let appel: { tool_name?: unknown; tool_input?: { file_path?: unknown } } | null;
  try {
    appel = JSON.parse(entree) as typeof appel;
  } catch {
    return;
  }
  if (!ouvertAuSetup(worktree, appel?.tool_name, appel?.tool_input?.file_path)) return;
  process.stdout.write(JSON.stringify({ hookSpecificOutput: { hookEventName: "PermissionRequest", decision: { behavior: "allow" } } }));
});
