// Montre le rail, en lecture seule : `npm --prefix runtime run rail`.
// Une ligne par ticket, dans l'ordre de service :
//   #<ticket>  <état>  <priorité>  <détail de l'état>  <titre>
// puis, en retrait, sa fiche s'il en porte une, et ce que le runtime n'y
// comprend pas.
//
// Et les deux gestes du chef sur un ticket du rail (geste-ticket.ts), ceux que
// la fiche de l'app joue :
//   npm --prefix runtime run rail -- remove 8              le retirer du rail (en attente ou BLOQUÉ seulement)
//   npm --prefix runtime run rail -- priority 8 <1-9|none>  changer sa priorité, quel que soit son état
// Chacun dit son prix, accompli sur la sortie, refusé sur la sortie d'erreur
// (code 1) avec sa raison. Il pose le label sur l'issue, sous le `gh` du compte
// du service, puis écrit au journal ce que le sondage y aurait écrit.
import { configRail } from "./alimenter.ts";
import { enProcess, Sortie, type Appel } from "./appel.ts";
import { direAttenteDeTiers } from "./attente.ts";
import { CLE_DES_CAPACITES } from "./capacites.ts";
import { changerPriorite, retirerDuRail } from "./geste-ticket.ts";
import { ouvrirGitHub } from "./github.ts";
import { ouvrirJournal, type Journal } from "./journal.ts";
import { journalPasRejoue } from "./journal-pas-rejoue.ts";
import { communsDuRail, lireRail, type TicketRail } from "./projections/rail.ts";
import { direRetenue, etatLu } from "./rail.ts";
import { ConfigInvalide } from "./runtime.ts";

const USAGE = [
  "usage : BRIGADE_STATE_DIR=<répertoire d'état> npm --prefix runtime run rail [-- <geste> <ticket> …]",
  "  remove <ticket>",
  "  priority <ticket> <1-9 | none>",
].join("\n");

const GESTES = ["remove", "priority"];

export function principal({ args, env, dire, redire }: Appel): void | Promise<void> {
  function echouer(code: number, message: string): never {
    redire(`brigade : ${message}`);
    throw new Sortie(code);
  }

  // Un geste sur un ticket : sa demande se lit en entier avant que rien ne
  // s'ouvre, journal ou GitHub.
  async function jouer(repertoireEtat: string): Promise<void> {
    const [geste = "", numero, valeur, ...deTrop] = args;
    if (!GESTES.includes(geste)) echouer(2, `geste inconnu : « ${geste} »\n${USAGE}`);
    if (numero === undefined || !/^[1-9][0-9]*$/.test(numero)) echouer(2, `il faut le numéro du ticket\n${USAGE}`);
    if (deTrop.length > 0 || (geste === "remove") !== (valeur === undefined)) echouer(2, USAGE);
    const ticket = Number(numero);
    // `none` retire la priorité ; tout autre mot va tel quel au geste, qui dit pourquoi il le refuse.
    const priorite = valeur === "none" ? null : valeur !== undefined && /^-?[0-9]+$/.test(valeur) ? Number(valeur) : valeur;

    let rail: ReturnType<typeof configRail>;
    try {
      rail = configRail(env);
    } catch (erreur) {
      if (erreur instanceof ConfigInvalide) echouer(2, `${erreur.message}\n${USAGE}`);
      throw erreur;
    }
    let journal: Journal;
    try {
      journal = ouvrirJournal(repertoireEtat);
    } catch (erreur) {
      echouer(1, erreur instanceof Error ? erreur.message : String(erreur));
    }
    const github = ouvrirGitHub({ depot: rail.depot, bin: rail.gh });
    try {
      const projet = journal.base.lire<{ project: string }>("SELECT project FROM events ORDER BY seq DESC LIMIT 1")[0]?.project;
      if (!projet) echouer(1, "journal vide : le runtime n'a jamais démarré sur ce répertoire d'état");
      let resultat: Awaited<ReturnType<typeof retirerDuRail>>;
      try {
        resultat = geste === "remove" ? await retirerDuRail(journal, github, projet, ticket) : await changerPriorite(journal, github, projet, ticket, priorite);
      } catch (erreur) {
        if (journalPasRejoue(erreur)) echouer(1, "ce journal n'a pas encore l'état du rail : redémarrer le runtime, qui le recalcule");
        echouer(1, `le geste sur #${ticket} n'a pas abouti sur GitHub : ${erreur instanceof Error ? erreur.message : String(erreur)}`);
      }
      const fait = geste === "remove" ? `#${ticket} retiré du rail` : `#${ticket} : priorité ${priorite === null ? "retirée" : `prio:${String(priorite)}`}`;
      if (!resultat.done) echouer(1, `#${ticket} n'est pas touché : ${resultat.reason} — cost: ${resultat.price}`);
      dire(`${fait} — cost: ${resultat.price}`);
    } finally {
      github.fermer();
      journal.fermer();
    }
  }

  // Ce que l'état a à dire de plus que son nom : qui, depuis quand, jusqu'à
  // quand — et, pour un ticket en attente qui ne part pas, pourquoi.
  function detail(ticket: TicketRail): string {
    switch (ticket.state) {
      case "waiting":
        return [...[direRetenue(ticket) ?? []].flat(), `depuis ${ticket.since}`].join(" — ");
      case "taken":
        return `par ${ticket.station} depuis ${ticket.since}, dernier progrès ${ticket.progressedAt}, bail jusqu'à ${ticket.leaseUntil}`;
      case "pass":
      case "served":
        return `depuis ${ticket.since}, cuisiné par ${ticket.station}`;
      case "86":
        if (ticket.waitingFor !== null) return direAttenteDeTiers(ticket.waitingFor, (instant) => instant);
        return `depuis ${ticket.since} (${ticket.reason}), ${ticket.until ? `retour à ${ticket.until}` : "sans heure de retour"}`;
    }
  }

  function formater(ticket: TicketRail): string {
    return [
      `#${ticket.ticket}`,
      etatLu(ticket),
      ticket.priority === null ? "-" : `prio:${ticket.priority}`,
      detail(ticket),
      ticket.title,
    ].join("  ");
  }

  const RETRAIT = "     ";

  function fiche({ card }: TicketRail): string[] {
    if (card === null) return [];
    const attend = card.waitsFor.length === 0 ? "rien" : card.waitsFor.map((numero) => `#${numero}`).join(", ");
    return [
      `${RETRAIT}fiche — attend : ${attend} · zone : ${card.zone.join(", ") || "aucune"}${card.requires?.length ? ` · ${CLE_DES_CAPACITES} : ${card.requires.join(", ")}` : ""}`,
      ...card.problems.map((probleme) => `${RETRAIT}FICHE ILLISIBLE — ${probleme}`),
    ];
  }

  const repertoireEtat = env.BRIGADE_STATE_DIR;
  if (!repertoireEtat) echouer(2, `BRIGADE_STATE_DIR n'est pas défini\n${USAGE}`);
  if (args.length > 0) return jouer(repertoireEtat);

  let journal;
  try {
    journal = ouvrirJournal(repertoireEtat, { lectureSeule: true });
  } catch (erreur) {
    echouer(1, erreur instanceof Error ? erreur.message : String(erreur));
  }
  try {
    const tickets = lireRail(journal.base);
    const communs = communsDuRail(journal.base);
    if (communs.length > 0) dire(`chemins communs, à personne : ${communs.join(", ")}`);
    if (tickets.length === 0) dire("rail vide");
    for (const ticket of tickets) dire([formater(ticket), ...fiche(ticket)].join("\n"));
  } catch (erreur) {
    // En lecture seule, rien ne crée le rail d'un journal écrit par un runtime
    // d'avant ses colonnes d'aujourd'hui.
    if (journalPasRejoue(erreur)) {
      echouer(1, "ce journal n'a pas encore l'état du rail : redémarrer le runtime, qui le recalcule");
    }
    throw erreur;
  } finally {
    journal.fermer();
  }
}

if (import.meta.main) await enProcess(principal);
