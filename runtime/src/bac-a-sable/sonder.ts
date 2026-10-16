// La sonde du bac à sable, jouée sur le poste d'une station distante — le Mac
// du chef —, par son app, avant qu'elle s'annonce ou réclame :
//   node runtime/src/bac-a-sable/sonder.ts <worktrees> [<cache>…]
// `worktrees` : le répertoire où le poste pose les worktrees des cooks de ce
// projet ; `cache` : un cache du projet où un cook écrit aussi. Chemins
// absolus.
//
// Elle rend, sur une ligne, l'objet JSON que la station passe à la box tel
// quel (`pull <station> claim --sandbox <json>`) : disponible, avec la version
// de `claude` et les lieux du poste ; indisponible, avec la raison. Code 0
// dans les deux cas — un bac à sable absent est un constat, pas une panne ; 2,
// la sonde est mal appelée. Le `claude` sondé est celui que la station lance
// (`BRIGADE_CLAUDE_BIN`, sinon `claude`).
import { homedir } from "node:os";
import { isAbsolute } from "node:path";
import { enProcess, Sortie, type Appel } from "../appel.ts";
import { detecter, sondesDeLaMachine, type Sondes } from "./detection.ts";
import { pourLaBox } from "./ordinaires.ts";

const USAGE = "usage : node runtime/src/bac-a-sable/sonder.ts <worktrees> [<cache>…] — des chemins absolus";

// `sondes`, `home` : ce qu'un test règle de la machine.
export function principal({ args, env, dire, redire }: Appel, sondes?: Sondes, home: string = homedir()): void {
  const [worktrees, ...caches] = args;
  if (worktrees === undefined || ![worktrees, ...caches].every((chemin) => isAbsolute(chemin))) {
    redire(`brigade : ${USAGE}`);
    throw new Sortie(2);
  }
  const detection = detecter(sondes ?? sondesDeLaMachine(env.BRIGADE_CLAUDE_BIN || "claude"));
  dire(JSON.stringify(pourLaBox(detection, { home, worktrees, caches })));
}

if (import.meta.main) await enProcess((appel) => principal(appel));
