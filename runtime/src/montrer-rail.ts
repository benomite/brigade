// Montre le rail, en lecture seule : `npm --prefix runtime run rail`.
// Une ligne par ticket, dans l'ordre de service :
//   #<ticket>  <état>  <priorité>  <détail de l'état>  <titre>
// puis, en retrait, sa fiche s'il en porte une, et ce que le runtime n'y
// comprend pas.
//
// Et les gestes du chef sur un ticket du rail (geste-ticket.ts) — les deux
// premiers sont ceux que la fiche de l'app joue :
//   npm --prefix runtime run rail -- remove 8              le retirer du rail (en attente, BLOQUÉ, 86, ou qui attend le chef)
//   npm --prefix runtime run rail -- merge 8               merger sa livraison, quand la file demande de la merger à la main
//   npm --prefix runtime run rail -- send-back 8 [raison…] renvoyer à un cook sa livraison, quand elle attend le chef
//   npm --prefix runtime run rail -- correct 8 <raison…>   dire pourquoi il a corrigé sa livraison
//   npm --prefix runtime run rail -- choose 8 <n>          répondre à sa carte de TODO par son choix n (à partir de 1)
//   npm --prefix runtime run rail -- answer 8 <texte…>     répondre à sa carte de TODO en texte libre
// `send-back` et `correct` font de la raison une leçon candidate du projet.
// `choose` et `answer` écrivent la réponse sur l'issue et font avancer le
// ticket dans le même appel (reponse-carte.ts).
// La priorité d'un ticket n'a pas de geste ici : c'est le label `prio:` de son
// issue, que l'app change elle-même sur GitHub (app/src/priorite.ts).
// Chacun dit son prix, accompli sur la sortie, refusé sur la sortie d'erreur
// (code 1) avec sa raison. Il pose le label sur l'issue — ou merge la PR —, sous
// le `gh` du compte du service, puis écrit au journal ce que le sondage y aurait
// écrit ; un merge, la pass le constate à son tour suivant.
import { configRail } from "./alimenter.ts";
import { enProcess, Sortie, type Appel } from "./appel.ts";
import { direAttenteDeTiersEn } from "./attente.ts";
import { CLE_DES_CAPACITES } from "./capacites.ts";
import { corrigerLaLivraison, mergerLaLivraison, renvoyerLaLivraison, retirerDuRail } from "./geste-ticket.ts";
import { ouvrirGitHub } from "./github.ts";
import { repondreALaCarte } from "./reponse-carte.ts";
import { ouvrirJournal, type Journal } from "./journal.ts";
import { journalPasRejoue } from "./journal-pas-rejoue.ts";
import { communsDuRail, lireRail, type TicketRail } from "./projections/rail.ts";
import { etatStation, plafondDeCooks, stationsAnnoncees } from "./projections/stations.ts";
import { avecHorsZoneEn, direRetenueEn, etatLuEn, retenue } from "./rail.ts";
import { direHorsBudget, horsBudgetSansTicket } from "./budget-des-gates.ts";
import { ConfigInvalide } from "./runtime.ts";

const USAGE = [
  "usage: BRIGADE_STATE_DIR=<state directory> npm --prefix runtime run rail [-- <geste> <ticket> …]",
  "  remove <ticket>",
  "  merge <ticket>",
  "  send-back <ticket> [reason…]",
  "  correct <ticket> <reason…>",
  "  choose <ticket> <choice number>",
  "  answer <ticket> <answer…>",
].join("\n");

const GESTES = ["remove", "merge", "send-back", "correct", "choose", "answer"];
// Les gestes qui prennent une raison — ou une réponse —, en un ou plusieurs mots.
const AVEC_RAISON = ["send-back", "correct", "answer"];
// Ceux qui prennent une valeur, en un mot.
const AVEC_VALEUR = ["choose"];


export function principal({ args, env, dire, redire }: Appel): void | Promise<void> {
  function echouer(code: number, message: string): never {
    redire(`brigade : ${message}`);
    throw new Sortie(code);
  }

  // Un geste sur un ticket : sa demande se lit en entier avant que rien ne
  // s'ouvre, journal ou GitHub.
  async function jouer(repertoireEtat: string): Promise<void> {
    const [geste = "", numero, valeur, ...deTrop] = args;
    if (!GESTES.includes(geste)) echouer(2, `unknown gesture: “${geste}”\n${USAGE}`);
    if (numero === undefined || !/^[1-9][0-9]*$/.test(numero)) echouer(2, `the ticket number is needed\n${USAGE}`);
    const raison = AVEC_RAISON.includes(geste) ? args.slice(2).join(" ") : null;
    if (raison === null && (deTrop.length > 0 || !AVEC_VALEUR.includes(geste) !== (valeur === undefined))) echouer(2, USAGE);
    if (geste === "choose" && (valeur === undefined || !/^[1-9][0-9]*$/.test(valeur))) echouer(2, `the choice number is needed, from 1\n${USAGE}`);
    const ticket = Number(numero);

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
    // Un geste du chef : la box ne retient aucun de ses appels (limite-github.ts).
    const github = ouvrirGitHub({ depot: rail.depot, bin: rail.gh, usage: "geste" });
    try {
      const projet = journal.base.lire<{ project: string }>("SELECT project FROM events ORDER BY seq DESC LIMIT 1")[0]?.project;
      if (!projet) echouer(1, "empty log: the runtime has never started on this state directory");
      let resultat: Awaited<ReturnType<typeof retirerDuRail>>;
      try {
        resultat =
          geste === "remove"
            ? await retirerDuRail(journal, github, projet, ticket)
            : geste === "merge"
              ? await mergerLaLivraison(journal, github, ticket)
              : geste === "send-back"
                ? renvoyerLaLivraison(journal, projet, ticket, raison)
                : geste === "correct"
                  ? corrigerLaLivraison(journal, projet, ticket, raison)
                  : geste === "choose"
                    ? await repondreALaCarte(journal, github, projet, ticket, { choix: Number(valeur) })
                    : await repondreALaCarte(journal, github, projet, ticket, { texte: raison ?? "" });
      } catch (erreur) {
        if (journalPasRejoue(erreur)) echouer(1, "this log does not have the rail state yet: restart the runtime, which recomputes it");
        echouer(1, `the gesture on #${ticket} did not go through on GitHub: ${erreur instanceof Error ? erreur.message : String(erreur)}`);
      }
      const fait: string = {
        remove: `#${ticket} removed from the rail`,
        merge: `#${ticket}: delivery merged`,
        "send-back": `#${ticket}: delivery sent back to a cook`,
        correct: `#${ticket}: correction recorded`,
        choose: `#${ticket}: card answered, choice ${valeur ?? ""}`,
      }[geste] ?? `#${ticket}: card answered`;
      if (!resultat.done) echouer(1, `#${ticket} is not touched: ${resultat.reason} — cost: ${resultat.price}`);
      dire(`${fait} — cost: ${resultat.price}`);
    } finally {
      github.fermer();
      journal.fermer();
    }
  }

  // Ce que l'état a à dire de plus que son nom : qui, depuis quand, jusqu'à
  // quand — et, pour un ticket en attente qui ne part pas, pourquoi.
  // `cap`: le plafond de cooks de la box (null : sans limite), `enCuisine` : les
  // tickets pris. Un ticket que rien ne retient sur le rail attend la place
  // d'un cook quand le plafond est atteint.
  function detail(ticket: TicketRail, cap: number | null = null, enCuisine = 0): string {
    switch (ticket.state) {
      case "waiting": {
        // Un tenant qui ne retient que par ce qu'il a écrit hors de sa zone le dit.
        const parZone = new Set(ticket.held.filter(({ outside }) => !outside).map(({ ticket: numero }) => numero));
        const parEcart = new Set(ticket.held.map(({ ticket: numero }) => numero).filter((numero) => !parZone.has(numero)));
        const tenants = [
          ...(parZone.size === 0 ? [] : [`${[...parZone].map((numero) => `#${numero}`).join(", ")} (zone overlap)`]),
          ...(parEcart.size === 0 ? [] : [`${[...parEcart].map((numero) => `#${numero}`).join(", ")} (written outside its zone)`]),
        ].join(", ");
        const raison =
          retenue(ticket) === "zone"
            ? `waits on ${tenants}`
            : retenue(ticket) === null && cap !== null && enCuisine >= cap
              ? "cap reached"
              : direRetenueEn(ticket);
        return [...[raison ?? []].flat(), `since ${ticket.since}`].join(" — ");
      }
      case "taken":
        return `by ${ticket.station} since ${ticket.since}, last progress ${ticket.progressedAt}, lease until ${ticket.leaseUntil}`;
      case "pass":
      case "served":
        return `since ${ticket.since}, cooked by ${ticket.station}`;
      case "86":
        if (ticket.waitingFor !== null) return direAttenteDeTiersEn(ticket.waitingFor, (instant) => instant);
        return `since ${ticket.since} (${ticket.reason}), ${ticket.until ? `back at ${ticket.until}` : "no return time"}`;
    }
  }

  function formater(ticket: TicketRail, cap: number | null = null, enCuisine = 0): string {
    return [
      `#${ticket.ticket}`,
      etatLuEn(ticket),
      ticket.priority === null ? "-" : `prio:${ticket.priority}`,
      avecHorsZoneEn(detail(ticket, cap, enCuisine), ticket),
      ticket.title,
    ].join("  ");
  }

  const RETRAIT = "     ";

  function fiche({ card }: TicketRail): string[] {
    if (card === null) return [];
    const attend = card.waitsFor.length === 0 ? "nothing" : card.waitsFor.map((numero) => `#${numero}`).join(", ");
    return [
      `${RETRAIT}card — awaiting: ${attend} · zone: ${card.zone.join(", ") || "none"}${card.requires?.length ? ` · \`${CLE_DES_CAPACITES}\`: ${card.requires.join(", ")}` : ""}`,
      ...card.problems.map((probleme) => `${RETRAIT}UNREADABLE CARD — ${probleme}`),
    ];
  }

  const repertoireEtat = env.BRIGADE_STATE_DIR;
  if (!repertoireEtat) echouer(2, `BRIGADE_STATE_DIR is not set\n${USAGE}`);
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
    if (communs.length > 0) dire(`common paths, held by no one: ${communs.join(", ")}`);
    // Les cooks en cuisine contre le plafond de la box : la somme de ceux de ses stations.
    const enCuisine = tickets.filter(({ state }) => state === "taken").length;
    const plafonds = stationsAnnoncees(journal.base).flatMap((nom) => {
      const station = etatStation(journal.base, nom);
      return station === null ? [] : [plafondDeCooks(station)];
    });
    const cap = plafonds.length === 0 || plafonds.includes(null) ? null : plafonds.reduce((somme: number, plafond) => somme + (plafond ?? 0), 0);
    if (plafonds.length > 0) dire(`cooks: ${enCuisine}/${cap ?? "no limit"}`);
    const projet = env.BRIGADE_PROJECT || journal.base.lire<{ project: string }>("SELECT project FROM events ORDER BY seq DESC LIMIT 1")[0]?.project || "";
    const horsBudget = projet === "" ? null : horsBudgetSansTicket(journal.base, projet);
    if (horsBudget !== null) dire(direHorsBudget(horsBudget));
    if (tickets.length === 0) dire("empty rail");
    for (const ticket of tickets) dire([formater(ticket, cap, enCuisine), ...fiche(ticket)].join("\n"));
  } catch (erreur) {
    // En lecture seule, rien ne crée le rail d'un journal écrit par un runtime
    // d'avant ses colonnes d'aujourd'hui.
    if (journalPasRejoue(erreur)) {
      echouer(1, "this log does not have the rail state yet: restart the runtime, which recomputes it");
    }
    throw erreur;
  } finally {
    journal.fermer();
  }
}

if (import.meta.main) await enProcess(principal);
