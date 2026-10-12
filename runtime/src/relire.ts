// Relit le journal, en lecture seule : `npm --prefix runtime run journal -- [<ticket> | --ticks]`.
// Avec un numéro de ticket, tout ce qui lui est arrivé, dans l'ordre ; sans,
// tout le journal — moins les battements du runtime (un par minute, que
// `status` résume), sauf avec `--ticks`. Avec `--derniers <N>`, seulement les N
// derniers événements, dans l'ordre (les battements exclus ne comptent pas).
// Une ligne par événement.
import { enProcess, Sortie, type Appel } from "./appel.ts";
import { BATTEMENT } from "./evenements/runtime.ts";
import { ouvrirJournal } from "./journal.ts";
import { formaterEvenement } from "./ligne-evenement.ts";

const USAGE = "usage : BRIGADE_STATE_DIR=<répertoire d'état> npm --prefix runtime run journal -- [<numéro de ticket> | --ticks] [--derniers <N>]";

export function principal({ args, env, dire, redire }: Appel): void {
  function echouer(code: number, message: string): never {
    redire(`brigade : ${message}`);
    throw new Sortie(code);
  }

  const repertoireEtat = env.BRIGADE_STATE_DIR;
  if (!repertoireEtat) echouer(2, `BRIGADE_STATE_DIR n'est pas défini\n${USAGE}`);
  const reste = [...args];
  let derniers: number | undefined;
  const position = reste.indexOf("--derniers");
  if (position !== -1) {
    const nombre = reste[position + 1];
    if (nombre === undefined || !/^[0-9]+$/.test(nombre) || Number(nombre) < 1) echouer(2, USAGE);
    derniers = Number(nombre);
    reste.splice(position, 2);
  }
  const [argument] = reste;
  const avecTicks = argument === "--ticks";
  if (reste.length > 1 || (argument !== undefined && !avecTicks && !/^[0-9]+$/.test(argument))) echouer(2, USAGE);

  let journal;
  try {
    journal = ouvrirJournal(repertoireEtat, { lectureSeule: true });
  } catch (erreur) {
    echouer(1, erreur instanceof Error ? erreur.message : String(erreur));
  }
  try {
    const sauf = argument === undefined ? [BATTEMENT] : [];
    const evenements =
      argument === undefined || avecTicks
        ? derniers === undefined
          ? journal.tout().filter((evenement) => !sauf.includes(evenement.type))
          : journal.derniers(derniers, sauf)
        : journal.duTicket(Number(argument)).slice(derniers === undefined ? 0 : -derniers);
    if (evenements.length === 0) {
      dire(argument === undefined || avecTicks ? "journal vide" : `aucun événement pour le ticket ${argument}`);
    }
    for (const evenement of evenements) dire(formaterEvenement(evenement));
  } finally {
    journal.fermer();
  }
}

if (import.meta.main) await enProcess(principal);
