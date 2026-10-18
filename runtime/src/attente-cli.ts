// WAITING vu et commandé par le chef, depuis son propre process :
//   npm --prefix runtime run waiting                                          les tickets qui attendent un tiers
//   npm --prefix runtime run waiting -- set 8 --what "sa validation écrite" --from "le client" [--remind 2026-10-21]
//   npm --prefix runtime run waiting -- resume 8                              WAITING → TODO, tout de suite
//   npm --prefix runtime run waiting -- arrived 8                             « c'est arrivé, on repart » : en cuisine, sans repasser par TODO
// Les anciens mots (`attente`, `poser`, `reprendre`, `arrive`, `--quoi`, `--de`,
// `--relance`) répondent encore, en disant le nouveau (`commandes.ts`).
// `--remind` : une date (2026-10-21, ce jour-là à minuit, heure de la box —
// UTC), une date et une heure (2026-10-21T09:00) ou une durée (7j, 36h) ; sans
// elle, dans sept jours. `set` sur un ticket qui attend déjà met à jour ce
// qu'il attend. Le geste s'écrit au journal ; le runtime qui tourne le porte
// sur l'issue (label `waiting`, commentaire) dès qu'il le lit.
import { enProcess, Sortie, type Appel } from "./appel.ts";
import { enAnglais } from "./commandes.ts";
import { cestArrive, direAttenteDeTiersEn, lireRelance, mettreEnAttente, reprendre } from "./attente.ts";
import { dureeEn } from "./etat.ts";
import { ouvrirJournal, type Journal } from "./journal.ts";
import { journalPasRejoue } from "./journal-pas-rejoue.ts";
import { lireRail, type TicketRail } from "./projections/rail.ts";
import { GesteRefuse } from "./rail.ts";

const USAGE = [
  "usage: BRIGADE_STATE_DIR=<state directory> npm --prefix runtime run waiting -- [<geste> <ticket> …]",
  "  set <ticket> --what <what it waits for> --from <who> [--remind <date, date and time, or duration>]",
  "  resume <ticket>",
  "  arrived <ticket>",
].join("\n");

const OPTIONS = ["--what", "--from", "--remind"];

// `maintenant` : l'heure du geste — celle de l'horloge, hors des tests.
export function principal({ args: tapes, env, dire, redire }: Appel, maintenant = () => new Date()): void {
  const args = enAnglais("waiting", tapes, redire);
  function echouer(code: number, message: string): never {
    redire(`brigade : ${message}`);
    throw new Sortie(code);
  }

  const repertoireEtat = env.BRIGADE_STATE_DIR;
  if (!repertoireEtat) echouer(2, `BRIGADE_STATE_DIR is not set\n${USAGE}`);
  const [geste, numero, ...suite] = args;

  const lues = new Map<string, string>();
  for (let i = 0; i < suite.length; i++) {
    const mot = suite[i] ?? "";
    if (!OPTIONS.includes(mot) || lues.has(mot) || i + 1 >= suite.length) echouer(2, USAGE);
    lues.set(mot, suite[++i] ?? "");
  }
  if (geste !== undefined && !["set", "resume", "arrived"].includes(geste)) echouer(2, `unknown gesture: “${geste}”\n${USAGE}`);
  if (geste !== undefined && (numero === undefined || !/^[1-9][0-9]*$/.test(numero))) echouer(2, `the ticket number is needed\n${USAGE}`);
  if (geste !== "set" && lues.size > 0) echouer(2, USAGE);
  const ticket = Number(numero);

  let journal: Journal;
  try {
    journal = ouvrirJournal(repertoireEtat, { lectureSeule: geste === undefined });
  } catch (erreur) {
    echouer(1, erreur instanceof Error ? erreur.message : String(erreur));
  }
  try {
    const instant = maintenant();
    const depuis = (moment: string) => `${dureeEn(instant.getTime() - Date.parse(moment))} (${moment})`;
    const ligne = (lu: TicketRail) => `#${lu.ticket}  ${lu.waitingFor === null ? "" : direAttenteDeTiersEn(lu.waitingFor, depuis)}  ${lu.title}`;
    if (geste === undefined) {
      const enAttente = lireRail(journal.base).filter((lu) => lu.waitingFor !== null);
      if (enAttente.length === 0) dire("no ticket is waiting for a third party");
      for (const lu of enAttente) dire(ligne(lu));
      return;
    }
    const projet = journal.base.lire<{ project: string }>("SELECT project FROM events ORDER BY seq DESC LIMIT 1")[0]?.project;
    if (!projet) echouer(1, "empty log: the runtime has never started on this state directory");
    try {
      if (geste === "set") {
        const quoi = lues.get("--what");
        const qui = lues.get("--from");
        if (quoi === undefined || qui === undefined) echouer(2, `set: --what and --from are to be said\n${USAGE}`);
        const brute = lues.get("--remind");
        const relance = brute === undefined ? undefined : lireRelance(brute, instant);
        const lu = mettreEnAttente(journal, projet, ticket, { quoi, qui, ...(relance === undefined ? {} : { relance }) }, instant);
        dire(`WAITING: ${ligne(lu)}`);
      } else if (geste === "resume") {
        reprendre(journal, projet, ticket);
        dire(`#${ticket} resumed: it goes back to TODO, in front of the chef`);
      } else {
        cestArrive(journal, projet, ticket);
        dire(`#${ticket}: it arrived — it goes back to the kitchen`);
      }
    } catch (erreur) {
      if (erreur instanceof GesteRefuse) echouer(1, erreur.message);
      throw erreur;
    }
  } catch (erreur) {
    if (journalPasRejoue(erreur)) echouer(1, "this log does not have the rail state yet: restart the runtime, which recomputes it");
    throw erreur;
  } finally {
    journal.fermer();
  }
}

if (import.meta.main) await enProcess((appel) => principal(appel));
