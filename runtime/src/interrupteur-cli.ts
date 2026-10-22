// L'interrupteur du projet vu et commandé par le chef, depuis son propre process :
//   npm --prefix runtime run switch             l'interrupteur, et le grant `merge` qu'il tient
//   npm --prefix runtime run switch -- on       les tickets lancés sont pris, le manager juge et découpe, une livraison verte est mergée
//   npm --prefix runtime run switch -- off      rien de neuf n'est pris, jugé, découpé ni mergé — les cooks en cours finissent
// Ce que chaque position fait est dans `interrupteur.ts`. Une commande s'écrit
// dans le journal ; le runtime qui tourne la voit à son prochain réveil, une
// seconde au plus, sans redémarrage. Toute la sortie est en anglais ; l'app
// lit la même ligne dans `status` (app/src/alertes.ts).
import { existsSync } from "node:fs";
import { enProcess, Sortie, type Appel } from "./appel.ts";
import { dureeEn as duree } from "./etat.ts";
import { direGrant } from "./grant.ts";
import { commanderInterrupteur, direInterrupteur, InterrupteurRefuse } from "./interrupteur.ts";
import { cheminJournal, ouvrirJournal } from "./journal.ts";
import { journalPasRejoue } from "./journal-pas-rejoue.ts";
import { etatDuGrant } from "./projections/pass.ts";
import { etatDeLInterrupteur } from "./projections/switch.ts";

const USAGE = "usage: BRIGADE_STATE_DIR=<state directory> npm --prefix runtime run switch -- [on | off]";

export function principal({ args, env, dire, redire }: Appel): void {
  function echouer(code: number, message: string): never {
    redire(`brigade : ${message}`);
    throw new Sortie(code);
  }
  const ligne = (titre: string, valeur: string) => dire(`${titre.padEnd(11)}${valeur}`);

  const repertoireEtat = env.BRIGADE_STATE_DIR;
  if (!repertoireEtat) echouer(2, `BRIGADE_STATE_DIR is not set\n${USAGE}`);
  const [commande] = args;
  const montre = args.length === 0;
  if (!montre && (args.length !== 1 || (commande !== "on" && commande !== "off"))) echouer(2, USAGE);
  // Une commande ouvre le journal en écriture : sans ce contrôle, elle en
  // créerait un là où il n'y en a pas.
  if (!existsSync(cheminJournal(repertoireEtat))) echouer(1, `no log in ${repertoireEtat}`);

  const maintenant = new Date();
  const journal = ouvrirJournal(repertoireEtat, { lectureSeule: montre });
  try {
    if (montre) {
      ligne("switch", direInterrupteur(etatDeLInterrupteur(journal.base)));
      ligne("merge", `grant ${direGrant(etatDuGrant(journal.base, "merge", maintenant), maintenant, duree)}`);
    } else dire(`brigade : ${commanderInterrupteur(journal, commande as "on" | "off", maintenant)}`);
  } catch (erreur) {
    if (erreur instanceof InterrupteurRefuse) echouer(1, erreur.message);
    // En lecture seule, rien ne crée la table d'un journal écrit par un
    // runtime d'avant l'interrupteur.
    if (journalPasRejoue(erreur)) echouer(1, "this log does not have the project switch yet: restart the runtime, which sets it");
    throw erreur;
  } finally {
    journal.fermer();
  }
}

if (import.meta.main) await enProcess(principal);
