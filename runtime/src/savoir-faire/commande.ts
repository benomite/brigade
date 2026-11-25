// La commande `know-how` de la box (#4241) : le passage par lequel l'app lit le
// savoir-faire du projet, en réécrit une entrée ou en retire une (`savoir-faire.ts`).
//
//   know-how                      les entrées, en JSON : {"entries":[{id, text, ticket}]}
//   know-how edit <id> <text…>    {"ok":true,"entry":<l'entrée réécrite>}
//   know-how remove <id>          {"ok":true}
//
// Un changement refusé répond `{"ok":false,"message":<la ligne du refus>}` avec le
// code de sortie 1 — rien n'est alors écrit. Un journal qui ne s'ouvre pas se dit
// sur la sortie d'erreur, en 1. Un usage qui ne se lit pas sort avec le code 2.
import { Sortie, type Appel } from "../appel.ts";
import { ouvrirJournal, type Journal } from "../journal.ts";
import { ChangementRefuse, lireLeSavoirFaire, modifierUneEntree, retirerUneEntree } from "./savoir-faire.ts";

const USAGE = "usage: BRIGADE_STATE_DIR=<state directory> BRIGADE_PROJECT=<project> npm --prefix runtime run know-how -- [edit <id> <text…> | remove <id>]";

const uneLigne = (erreur: unknown) => (erreur instanceof Error ? erreur.message : String(erreur)).split("\n")[0] ?? "";

export function principal({ args, env, dire, redire }: Appel): void {
  function echouer(code: number, message: string): never {
    redire(`brigade: ${message}`);
    throw new Sortie(code);
  }
  const repertoireEtat = env.BRIGADE_STATE_DIR;
  if (!repertoireEtat) echouer(2, `BRIGADE_STATE_DIR is not set\n${USAGE}`);
  const projet = env.BRIGADE_PROJECT;
  if (!projet) echouer(2, `BRIGADE_PROJECT is not set\n${USAGE}`);
  const [geste, id, ...mots] = args;
  const lisible = geste === undefined || (geste === "edit" && id !== undefined && mots.length > 0) || (geste === "remove" && id !== undefined && mots.length === 0);
  if (!lisible) echouer(2, `“${args.join(" ")}” is not a know-how command\n${USAGE}`);

  let journal: Journal;
  try {
    journal = ouvrirJournal(repertoireEtat, { lectureSeule: geste === undefined });
  } catch (erreur) {
    echouer(1, `the know-how is not read — ${uneLigne(erreur)}`);
  }
  try {
    if (geste === undefined) return dire(JSON.stringify({ entries: lireLeSavoirFaire(journal, projet) }));
    if (geste === "remove") {
      retirerUneEntree(journal, projet, id ?? "");
      return dire(JSON.stringify({ ok: true }));
    }
    dire(JSON.stringify({ ok: true, entry: modifierUneEntree(journal, projet, id ?? "", mots.join(" ")) }));
  } catch (erreur) {
    if (!(erreur instanceof ChangementRefuse)) throw erreur;
    dire(JSON.stringify({ ok: false, message: erreur.message }));
    throw new Sortie(1);
  } finally {
    journal.fermer();
  }
}
