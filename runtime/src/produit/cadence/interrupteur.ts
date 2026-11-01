// The product role's switch: one gesture turns it off, the same one turns it
// back on.
//
//   BRIGADE_STATE_DIR=<state directory> node runtime/src/produit/cadence/interrupteur.ts           the role's line
//   BRIGADE_STATE_DIR=<state directory> node runtime/src/produit/cadence/interrupteur.ts off       the kitchen no longer wakes the role
//   BRIGADE_STATE_DIR=<state directory> node runtime/src/produit/cadence/interrupteur.ts on        it wakes it again when the rail empties
//
// The command writes to the project's log; the running runtime reads it at its
// next tick, with no restart. Off, no run starts — one in flight finishes, and
// files what it proposed. The project switch (`switch`) holds the role too:
// off, nothing runs, whatever this one says.
import { existsSync } from "node:fs";
import { enProcess, Sortie, type Appel } from "../../appel.ts";
import { cheminJournal, ouvrirJournal, type Journal } from "../../journal.ts";
import { direCadence, etatDeLaCadence } from "./etat.ts";

const USAGE = "usage: BRIGADE_STATE_DIR=<state directory> node runtime/src/produit/cadence/interrupteur.ts [on | off]";
const AUTEUR = "chef";

export class CadenceRefusee extends Error {}

// Writes the chef's command if it changes something, and says where the role
// stands.
export function commanderCadence(journal: Journal, commande: "on" | "off", maintenant: Date, auteur = AUTEUR): string {
  const { base } = journal;
  return base.transaction(() => {
    const projet = base.lire<{ project: string }>("SELECT project FROM events ORDER BY seq DESC LIMIT 1")[0]?.project;
    if (!projet) throw new CadenceRefusee("empty log: the runtime has never started on this state directory");
    const etat = etatDeLaCadence(base, maintenant);
    if (commande === "on") {
      if (etat.on) return `product role already on${etat.since === null ? "" : ` since ${etat.since}`}`;
      journal.ajouter({ project: projet, ticket: null, author: auteur, type: "product.switched-on", payload: {} });
      return "product role on: the kitchen wakes it when the rail empties, within its daily cap";
    }
    if (!etat.on) return `nothing to switch off: the product role is off since ${etat.since}`;
    journal.ajouter({ project: projet, ticket: null, author: auteur, type: "product.switched-off", payload: {} });
    return "product role off: the kitchen no longer wakes it — a run in flight finishes; `on` resumes it";
  });
}

export function principal({ args, env, dire, redire }: Appel): void {
  function echouer(code: number, message: string): never {
    redire(`brigade : ${message}`);
    throw new Sortie(code);
  }
  const repertoireEtat = env.BRIGADE_STATE_DIR;
  if (!repertoireEtat) echouer(2, `BRIGADE_STATE_DIR is not set\n${USAGE}`);
  const [commande] = args;
  const montre = args.length === 0;
  if (!montre && (args.length !== 1 || (commande !== "on" && commande !== "off"))) echouer(2, USAGE);
  // A command opens the log for writing: without this check, it would create
  // one where there is none.
  if (!existsSync(cheminJournal(repertoireEtat))) echouer(1, `no log in ${repertoireEtat}`);
  const maintenant = new Date();
  const journal = ouvrirJournal(repertoireEtat, { lectureSeule: montre });
  try {
    if (montre) dire(`product    ${direCadence(etatDeLaCadence(journal.base, maintenant))}`);
    else dire(`brigade : ${commanderCadence(journal, commande as "on" | "off", maintenant)}`);
  } catch (erreur) {
    if (erreur instanceof CadenceRefusee) echouer(1, erreur.message);
    throw erreur;
  } finally {
    journal.fermer();
  }
}

if (import.meta.main) await enProcess(principal);
