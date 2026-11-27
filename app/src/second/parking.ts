// La commande de parking du second (#4262) : parquer et déparquer un ticket sur son issue, sur tout dépôt GitHub, sans
// commande ni shell de la box, par les deux mêmes fonctions que les boutons de l'app (action-of-parking.ts) et le jeton du
// `gh` de ce poste. Le second la lance sous la forme que son début de session lui donne :
//   node parking.ts park <owner>/<repo>#<n> --who <who> --what <what> --until <YYYY-MM-DD>
//   node parking.ts unpark <owner>/<repo>#<n>
// Le crochet de son début de session la joue aussi (`context <depot>`, hook-of-parking.ts) : il en rend la forme
// exacte, et sort toujours en 0 — il ne bloque jamais la session.
import { clientOfThePriority, sendByFetch } from "../priority.ts";
import { clientGitHub, byFetch } from "../board/client.ts";
import { tokenOfGh } from "../board/token-gh.ts";
import { EVENT } from "./hook-of-the-file.ts";
import { context, principal } from "./action-of-parking.ts";

if (import.meta.main) {
  const args = process.argv.slice(2);
  if (args[0] === "context") {
    try {
      process.stdout.write(`${JSON.stringify({ hookSpecificOutput: { hookEventName: EVENT, additionalContext: context(args[1] ?? "", process.execPath, import.meta.filename) } })}\n`);
    } catch {}
    process.exit(0);
  }
  const token = tokenOfGh({ gh: process.env.BRIGADE_GH_BIN || "gh", delaiMs: 10_000 });
  const client = clientOfThePriority({ jeton: token, appeler: clientGitHub({ jeton: token, envoyer: byFetch() }), envoyer: sendByFetch() });
  process.exitCode = await principal(args, { client, aujourdhui: new Date(), dire: (line) => console.log(line), redire: (line) => console.error(line) });
}
