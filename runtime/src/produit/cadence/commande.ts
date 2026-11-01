// The chef's gesture on the product role of a project, from its own process:
//   BRIGADE_STATE_DIR=<state directory> node runtime/src/produit/cadence/commande.ts            its line, as `status` says it
//   BRIGADE_STATE_DIR=<state directory> node runtime/src/produit/cadence/commande.ts off        the off switch: it no longer runs
//   BRIGADE_STATE_DIR=<state directory> node runtime/src/produit/cadence/commande.ts on         it runs when the rail empties (off until then)
//   BRIGADE_STATE_DIR=<state directory> node runtime/src/produit/cadence/commande.ts cap <N>    the issues it may file in a day (3 by default; 0 files nothing)
// The state directory is the project's: each project has its own switch and its
// own cap. A gesture is written to the project's state; the running runtime
// reads it at its next tick, without restarting. A run already in flight
// files nothing once the role is off.
//
// Exit codes: 0, done or said; 1, no log in that directory; 2, the command is
// badly written.
import { existsSync } from "node:fs";
import { enProcess, Sortie, type Appel } from "../../appel.ts";
import { cheminJournal, ouvrirJournal } from "../../journal.ts";
import { allumer, plafonner } from "./etat.ts";
import { direCadence } from "./statut.ts";

const USAGE = "usage: BRIGADE_STATE_DIR=<state directory> node runtime/src/produit/cadence/commande.ts [on | off | cap <N>]";

export function principal({ args, env, dire, redire }: Appel): void {
  function echouer(code: number, message: string): never {
    redire(`brigade : ${message}`);
    throw new Sortie(code);
  }
  const repertoireEtat = env.BRIGADE_STATE_DIR;
  if (!repertoireEtat) echouer(2, `BRIGADE_STATE_DIR is not set\n${USAGE}`);
  const [geste, valeur] = args;
  const montre = args.length === 0;
  const bascule = args.length === 1 && (geste === "on" || geste === "off");
  const plafond = args.length === 2 && geste === "cap" && /^(0|[1-9][0-9]{0,3})$/.test(valeur ?? "");
  if (!montre && !bascule && !plafond) echouer(2, USAGE);
  // A gesture opens the log for writing: without this check, it would create
  // one where there is none.
  if (!existsSync(cheminJournal(repertoireEtat))) echouer(1, `no log in ${repertoireEtat}`);

  const journal = ouvrirJournal(repertoireEtat, { lectureSeule: montre });
  try {
    if (bascule) allumer(journal.base, geste === "on");
    if (plafond) plafonner(journal.base, Number(valeur));
    dire(`brigade : ${direCadence(journal.base, new Date())}`);
  } finally {
    journal.fermer();
  }
}

if (import.meta.main) await enProcess(principal);
