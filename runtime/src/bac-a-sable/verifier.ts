// La vérification du bac à sable d'une cuisine locale, jouée sur le Mac du
// chef — par son app, avant d'y faire cuire un projet :
//   node runtime/src/bac-a-sable/verifier.ts
// Elle dit `ok` (code 0) si le bac à sable de Claude Code est utilisable pour
// les cuisines de la station de cette machine (`BRIGADE_STATION_DIR`), et
// sinon, en une phrase, ce qui manque (code 1) ; 2, elle est mal appelée. Le
// `claude` éprouvé est celui que la station lance (`BRIGADE_CLAUDE_BIN`,
// sinon `claude`) ; les caches du projet, ceux de `BRIGADE_SANDBOX_CACHES`.
//
//   node runtime/src/bac-a-sable/verifier.ts --settings <répertoire> [<hôte>…]
// Rend les réglages qu'un `claude` lancé dans ce répertoire reçoit — la liste
// réseau du projet étant ces hôtes —, de quoi éprouver le bac à sable à la
// main (docs/runtime/station-distante.md).
import { homedir } from "node:os";
import { isAbsolute, join, resolve } from "node:path";
import { enProcess, Sortie, type Appel } from "../appel.ts";
import { reglesDuProjet } from "../reseau.ts";
import { ETATS } from "../station/configuration.ts";
import { configurer } from "./configuration.ts";
import { sondesDeLaMachine, type Sondes } from "./detection.ts";
import { lireCaches, verifier } from "./local.ts";

const USAGE = "usage : node runtime/src/bac-a-sable/verifier.ts [--settings <répertoire> [<hôte>…]]";

// `sondes`, `home` : ce qu'un test règle de la machine.
export function principal({ args, env, dire, redire }: Appel, sondes?: Sondes, home: string | undefined = env.HOME ?? homedir()): void {
  const mal = (pourquoi: string): never => {
    redire(`brigade : ${pourquoi} — ${USAGE}`);
    throw new Sortie(2);
  };
  const caches = lireCaches(env);
  if (args[0] === "--settings") {
    const [, ou, ...hotes] = args;
    if (ou === undefined || !isAbsolute(ou)) mal("le répertoire se donne en chemin absolu");
    if (home === undefined) mal("HOME n'est pas défini");
    dire(JSON.stringify(configurer({ worktree: ou as string, caches, hotes: reglesDuProjet(hotes), home: home as string }).reglages));
    return;
  }
  if (args.length > 0) mal(`« ${args[0]} » n'est pas une option`);
  const station = env.BRIGADE_STATION_DIR;
  if (!station) mal("BRIGADE_STATION_DIR n'est pas défini : la vérification éprouve les lieux de la station de cette machine");
  const verification = verifier(sondes ?? sondesDeLaMachine(env.BRIGADE_CLAUDE_BIN || "claude"), { home, worktrees: join(resolve(station as string), ETATS), caches });
  dire(verification.ok ? "ok" : verification.raison);
  if (!verification.ok) throw new Sortie(1);
}

if (import.meta.main) await enProcess((appel) => principal(appel));
