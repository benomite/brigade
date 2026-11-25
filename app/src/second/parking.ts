// La commande de parking du second (#4262) : parquer et déparquer un ticket sur son issue, sur tout dépôt GitHub, sans
// commande ni shell de la box, par les deux mêmes fonctions que les boutons de l'app (geste-de-parking.ts) et le jeton du
// `gh` de ce poste. Le second la lance sous la forme que son début de session lui donne :
//   node parking.ts park <owner>/<repo>#<n> --who <who> --what <what> --until <YYYY-MM-DD>
//   node parking.ts unpark <owner>/<repo>#<n>
// Le crochet de son début de session la joue aussi (`context <depot>`, crochet-du-parking.ts) : il en rend la forme
// exacte, et sort toujours en 0 — il ne bloque jamais la session.
import { clientDeLaPriorite, envoyerParFetch } from "../priorite.ts";
import { clientGitHub, parFetch } from "../tableau/client.ts";
import { jetonDeGh } from "../tableau/jeton-gh.ts";
import { EVENEMENT } from "./crochet-de-la-file.ts";
import { contexte, principal } from "./geste-de-parking.ts";

if (import.meta.main) {
  const args = process.argv.slice(2);
  if (args[0] === "context") {
    try {
      process.stdout.write(`${JSON.stringify({ hookSpecificOutput: { hookEventName: EVENEMENT, additionalContext: contexte(args[1] ?? "", process.execPath, import.meta.filename) } })}\n`);
    } catch {}
    process.exit(0);
  }
  const jeton = jetonDeGh({ gh: process.env.BRIGADE_GH_BIN || "gh", delaiMs: 10_000 });
  const client = clientDeLaPriorite({ jeton, appeler: clientGitHub({ jeton, envoyer: parFetch() }), envoyer: envoyerParFetch() });
  process.exitCode = await principal(args, { client, aujourdhui: new Date(), dire: (ligne) => console.log(ligne), redire: (ligne) => console.error(ligne) });
}
