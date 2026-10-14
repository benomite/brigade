// WAITING vu et commandé par le chef, depuis son propre process :
//   npm --prefix runtime run attente                                          les tickets qui attendent un tiers
//   npm --prefix runtime run attente -- poser 8 --quoi "sa validation écrite" --de "le client" [--relance 2026-10-21]
//   npm --prefix runtime run attente -- reprendre 8                           WAITING → TODO, tout de suite
//   npm --prefix runtime run attente -- arrive 8                              « c'est arrivé, on repart » : en cuisine, sans repasser par TODO
// `--relance` : une date (2026-10-21, ce jour-là à minuit, heure de la box —
// UTC), une date et une heure (2026-10-21T09:00) ou une durée (7j, 36h) ; sans
// elle, dans sept jours. `poser` sur un ticket qui attend déjà met à jour ce
// qu'il attend. Le geste s'écrit au journal ; le runtime qui tourne le porte
// sur l'issue (label `waiting`, commentaire) dès qu'il le lit.
import { enProcess, Sortie, type Appel } from "./appel.ts";
import { cestArrive, direAttenteDeTiers, lireRelance, mettreEnAttente, reprendre } from "./attente.ts";
import { duree } from "./etat.ts";
import { ouvrirJournal, type Journal } from "./journal.ts";
import { journalPasRejoue } from "./journal-pas-rejoue.ts";
import { lireRail, type TicketRail } from "./projections/rail.ts";
import { GesteRefuse } from "./rail.ts";

const USAGE = [
  "usage : BRIGADE_STATE_DIR=<répertoire d'état> npm --prefix runtime run attente -- [<geste> <ticket> …]",
  "  poser <ticket> --quoi <ce qu'il attend> --de <qui> [--relance <date, date et heure, ou durée>]",
  "  reprendre <ticket>",
  "  arrive <ticket>",
].join("\n");

const OPTIONS = ["--quoi", "--de", "--relance"];

// `maintenant` : l'heure du geste — celle de l'horloge, hors des tests.
export function principal({ args, env, dire, redire }: Appel, maintenant = () => new Date()): void {
  function echouer(code: number, message: string): never {
    redire(`brigade : ${message}`);
    throw new Sortie(code);
  }

  const repertoireEtat = env.BRIGADE_STATE_DIR;
  if (!repertoireEtat) echouer(2, `BRIGADE_STATE_DIR n'est pas défini\n${USAGE}`);
  const [geste, numero, ...suite] = args;

  const lues = new Map<string, string>();
  for (let i = 0; i < suite.length; i++) {
    const mot = suite[i] ?? "";
    if (!OPTIONS.includes(mot) || lues.has(mot) || i + 1 >= suite.length) echouer(2, USAGE);
    lues.set(mot, suite[++i] ?? "");
  }
  if (geste !== undefined && !["poser", "reprendre", "arrive"].includes(geste)) echouer(2, `geste inconnu : « ${geste} »\n${USAGE}`);
  if (geste !== undefined && (numero === undefined || !/^[1-9][0-9]*$/.test(numero))) echouer(2, `il faut le numéro du ticket\n${USAGE}`);
  if (geste !== "poser" && lues.size > 0) echouer(2, USAGE);
  const ticket = Number(numero);

  let journal: Journal;
  try {
    journal = ouvrirJournal(repertoireEtat, { lectureSeule: geste === undefined });
  } catch (erreur) {
    echouer(1, erreur instanceof Error ? erreur.message : String(erreur));
  }
  try {
    const instant = maintenant();
    const depuis = (moment: string) => `${duree(instant.getTime() - Date.parse(moment))} (${moment})`;
    const ligne = (lu: TicketRail) => `#${lu.ticket}  ${lu.waitingFor === null ? "" : direAttenteDeTiers(lu.waitingFor, depuis)}  ${lu.title}`;
    if (geste === undefined) {
      const enAttente = lireRail(journal.base).filter((lu) => lu.waitingFor !== null);
      if (enAttente.length === 0) dire("aucun ticket n'attend un tiers");
      for (const lu of enAttente) dire(ligne(lu));
      return;
    }
    const projet = journal.base.lire<{ project: string }>("SELECT project FROM events ORDER BY seq DESC LIMIT 1")[0]?.project;
    if (!projet) echouer(1, "journal vide : le runtime n'a jamais démarré sur ce répertoire d'état");
    try {
      if (geste === "poser") {
        const quoi = lues.get("--quoi");
        const qui = lues.get("--de");
        if (quoi === undefined || qui === undefined) echouer(2, `poser : --quoi et --de sont à dire\n${USAGE}`);
        const brute = lues.get("--relance");
        const relance = brute === undefined ? undefined : lireRelance(brute, instant);
        const lu = mettreEnAttente(journal, projet, ticket, { quoi, qui, ...(relance === undefined ? {} : { relance }) }, instant);
        dire(`WAITING : ${ligne(lu)}`);
      } else if (geste === "reprendre") {
        reprendre(journal, projet, ticket);
        dire(`#${ticket} repris : il revient dans TODO, devant le chef`);
      } else {
        cestArrive(journal, projet, ticket);
        dire(`#${ticket} : c'est arrivé — il repart en cuisine`);
      }
    } catch (erreur) {
      if (erreur instanceof GesteRefuse) echouer(1, erreur.message);
      throw erreur;
    }
  } catch (erreur) {
    if (journalPasRejoue(erreur)) echouer(1, "ce journal n'a pas encore l'état du rail : redémarrer le runtime, qui le recalcule");
    throw erreur;
  } finally {
    journal.fermer();
  }
}

if (import.meta.main) await enProcess((appel) => principal(appel));
