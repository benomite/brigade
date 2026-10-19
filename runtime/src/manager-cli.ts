// Le manager vu et commandé par le chef, depuis son propre process :
//   npm --prefix runtime run manager                l'interrupteur, les dernières décisions, ce qu'il a écarté, les épiques, et ses réactions aux échecs
//   npm --prefix runtime run manager -- on          il juge les issues ouvertes, pose `fire` et le calibrage, découpe les épiques
//   npm --prefix runtime run manager -- off         il ne juge plus rien
//   npm --prefix runtime run manager -- return <n°> il rejuge à neuf une issue qu'il avait écartée parce que le chef y avait retiré un de ses labels
//   npm --prefix runtime run manager -- backlog     ce qu'allumer engage : combien d'issues sont ouvertes sur le dépôt, et combien portent `blocked-on-human`
//   npm --prefix runtime run manager -- upstream    ce qui n'est pas encore sur le rail : chaque issue ouverte qu'il ne porte pas, et ce qui lui arrive — pour un programme
// Les anciens mots (`allumer`, `eteindre`, `rendre`) répondent encore, en
// disant le nouveau (`commandes.ts`).
// Une commande s'écrit dans le journal ; le runtime qui tourne la voit à son
// prochain réveil, une seconde au plus, sans redémarrage. `backlog` n'écrit
// rien, nulle part : elle lit GitHub, et ne touche pas au journal. `upstream`
// non plus : elle lit GitHub, puis le journal, sans y écrire.
import { existsSync } from "node:fs";
import { configRail } from "./alimenter.ts";
import { enAmont } from "./amont.ts";
import { enProcess, Sortie, type Appel } from "./appel.ts";
import { enAnglais } from "./commandes.ts";
import { decrire, decrireEcart, ecart } from "./dire-manager.ts";
import type { Ecart } from "./events/manager.ts";
import { ouvrirGitHub, type IssueOuverte } from "./github.ts";
import { logPath, openLog, type Log } from "./log.ts";
import { logNotReplayed } from "./log-not-replayed.ts";
import { managerSplits, epicTickets, type Split } from "./projections/splits.ts";
import { decisionsDuManager, ecarteesDuManager, etatDuManager, issueDuManager, remiseDe, queuedReturns } from "./projections/manager.ts";
import { sortDuTicket } from "./projections/rail.ts";
import { reactionsDuManager, type ReactionDeTicket } from "./projections/reactions.ts";
import { sessionEnCours } from "./projections/sessions.ts";
import { ConfigInvalide } from "./runtime.ts";

const USAGE = "usage: BRIGADE_STATE_DIR=<state directory> npm --prefix runtime run manager -- [on | off | return <issue number> | backlog | upstream]";
const AUTEUR = "chef";
const DECISIONS_MONTREES = 15;
const ECARTEES_MONTREES = 10;
const EPICS_SHOWN = 10;
const REACTIONS_MONTREES = 10;

// Seules `backlog` et `upstream` attendent quelque chose — GitHub : les autres rendent la main aussitôt.
export function principal({ args: tapes, env, dire, redire }: Appel): void | Promise<void> {
  const args = enAnglais("manager", tapes, redire);
  function echouer(code: number, message: string): never {
    redire(`brigade : ${message}`);
    throw new Sortie(code);
  }

  const ligne = (titre: string, valeur: string) => dire(`${titre.padEnd(22)}${valeur}`);

  // Où en est une épique : ce que le manager en a fait, et ce qu'il attend.
  function describeEpic(log: Log, epic: Split): string {
    switch (epic.state) {
      case "split": {
        const tickets = epicTickets(log.base, epic.epic);
        const nes = tickets.filter((ticket) => ticket.index !== null && ticket.fired).length;
        if (!epic.done) return `split in progress, ${nes}/${epic.tickets.length} tickets created and fired — ${epic.reason}`;
        const servedOnes = tickets.filter((ticket) => sortDuTicket(log.base, ticket.ticket)?.outcome === "served").length;
        return `split, ${servedOnes}/${tickets.length} served (${tickets.map((ticket) => `#${ticket.ticket}`).join(", ")}) — ${epic.reason}`;
      }
      case "asked":
        return `QUESTION ASKED, awaiting your answer on the epic — ${epic.reason}`;
      case "skipped":
        return `already split, no ticket created — ${epic.reason}`;
      case "failed":
        return `unreadable split — ${epic.reason}`;
    }
  }

  // Ce que le manager a fait d'un ticket que la pass a jugé rouge, et pourquoi.
  function decrireReaction(reaction: ReactionDeTicket): string {
    const dit = (calibration: { model: string; effort: string }) => `${calibration.model} / ${calibration.effort}`;
    const apres = `after ${reaction.returns} return${reaction.returns > 1 ? "s" : ""}`;
    switch (reaction.choice) {
      case "retry":
        return `second return at the same calibration (${dit(reaction.from)}) — ${reaction.reason}`;
      case "raise":
        if (reaction.raised && !reaction.applied) return `${apres}, raise from ${dit(reaction.from)} to ${dit(reaction.to ?? reaction.from)} dropped: the chef recalibrated in the meantime — ${reaction.reason}`;
        return `${apres}, calibration raised from ${dit(reaction.from)} to ${dit(reaction.to ?? reaction.from)} — ${reaction.reason}`;
      case "split":
        return `${apres}, split again — ${reaction.reason}`;
      case "escalate":
        return `${apres}, escalated to the chef — ${reaction.reason}${reaction.proposal === null ? "" : ` Proposed: ${reaction.proposal}`}`;
    }
  }

  function montrer(log: Log): void {
    const { base } = log;
    const etat = etatDuManager(base);
    ligne(
      "manager",
      etat === null
        ? "OFF — never turned on: no issue is judged, `fire` and the calibration are set by hand"
        : etat.active
          ? `ON since ${etat.since} (by ${etat.by}) — it judges the open issues, sets \`fire\` and the calibration`
          : `OFF since ${etat.since} (by ${etat.by}) — no issue is judged, what it set stays set`,
    );
    const decisions = decisionsDuManager(base, DECISIONS_MONTREES);
    ligne("latest decisions", decisions.length === 0 ? "none" : "");
    for (const issue of decisions) dire(`  ${issue.at}  #${issue.ticket}  ${decrire(issue)}`);
    const ecartees = ecarteesDuManager(base, ECARTEES_MONTREES);
    const remises = queuedReturns(base);
    ligne("set aside", ecartees.length + remises.length === 0 ? "none" : "");
    for (const remise of remises) dire(`  ${remise.at}  #${remise.ticket}  returned to the manager, not rejudged yet — it rejudges it on its next wake-up, if it is on`);
    for (const issue of ecartees) dire(`  ${issue.at}  #${issue.ticket}  ${decrireEcart(issue)}`);
    const epics = managerSplits(base, EPICS_SHOWN);
    ligne("epics", epics.length === 0 ? "none" : "");
    for (const epic of epics) dire(`  ${epic.at}  #${epic.epic}  ${describeEpic(log, epic)}`);
    const reactions = reactionsDuManager(base, REACTIONS_MONTREES);
    ligne("reactions", reactions.length === 0 ? "none" : "");
    for (const reaction of reactions) dire(`  ${reaction.at}  #${reaction.ticket}  ${decrireReaction(reaction)}`);
  }

  // Écrit la commande du chef si elle change quelque chose, et dit ce qu'il en
  // est. Vérifier et écrire tiennent dans une seule transaction.
  function commander(log: Log, commande: "on" | "off"): string {
    const { base } = log;
    return base.transaction(() => {
      const projet = base.lire<{ project: string }>("SELECT project FROM events ORDER BY seq DESC LIMIT 1")[0]?.project;
      if (!projet) echouer(1, "empty log: the runtime has never started on this state directory");
      const etat = etatDuManager(base);
      const absent = sessionEnCours(base) ? "" : " (no runtime is running: the command will take effect at its next start)";

      if (commande === "on") {
        if (etat?.active) return `manager already on since ${etat.since}`;
        log.ajouter({ project: projet, ticket: null, author: AUTEUR, type: "manager.enabled", payload: {} });
        return `manager on: it judges the open issues, sets \`fire\` and the calibration on the executable ones, splits epics into tickets, and says why on the others — an issue carrying \`blocked-on-human\` or \`hors-cuisine\` is never judged${absent}`;
      }
      if (!etat?.active) return "nothing to turn off: the manager is not on";
      log.ajouter({ project: projet, ticket: null, author: AUTEUR, type: "manager.disabled", payload: {} });
      return `manager off: no issue is judged any more — what it set stays set; a judgment under way runs to its end, but its decision is only applied once it is turned on again${absent}`;
    });
  }

  // Rend une issue au manager, si c'est par là que son écart se lève ; sinon dit
  // le geste qui le lève. `fait` : la remise est au journal, ou y était déjà.
  function rendre(log: Log, numero: number): { fait: boolean; message: string } {
    const { base } = log;
    return base.transaction(() => {
      const projet = base.lire<{ project: string }>("SELECT project FROM events ORDER BY seq DESC LIMIT 1")[0]?.project;
      if (!projet) echouer(1, "empty log: the runtime has never started on this state directory");
      const suite = !etatDuManager(base)?.active
        ? " (the manager is off: it will be rejudged when you turn it on)"
        : sessionEnCours(base)
          ? ""
          : " (no runtime is running: it will be rejudged at its next start)";
      if (remiseDe(base, numero)) return { fait: true, message: `#${numero} is already returned to the manager: it rejudges it on its next wake-up${suite}` };
      const issue = issueDuManager(base, numero);
      if (!issue) return { fait: false, message: `nothing to return: the manager has decided nothing on #${numero} — an open issue it has never seen is judged on its own` };
      if (issue.decision !== "aside") return { fait: false, message: `nothing to return: #${numero} is not set aside — ${decrire(issue)}` };
      if (issue.reason !== ("chef-changed" satisfies Ecart)) {
        const { motif, geste } = ecart(issue);
        return { fait: false, message: `#${numero} is not returned: ${motif}. ${geste === null ? "Nothing returns it to the manager." : `What lifts this: ${geste}.`}` };
      }
      log.ajouter({ project: projet, ticket: numero, author: AUTEUR, type: "manager.handed-back", payload: {} });
      return {
        fait: true,
        message: `#${numero} returned to the manager: it rejudges it from scratch — it removes the calibration it had set there, then sets \`fire\` and the one from the new judgment, or says why it is not an executable ticket. A return counts for one judgment${suite}`,
      };
    });
  }

  // La liste des issues ouvertes du dépôt, PR écartées — celle que le manager
  // sonde —, lue à l'instant sous le `gh` du compte du service, comme
  // `installation` : un GET, ni label, ni commentaire, ni journal. `quoi` : ce
  // qui n'a pas été lu, si elle ne l'est pas — ce n'est jamais « aucune issue ».
  async function lireOuvertes(quoi: (depot: string) => string): Promise<{ depot: string; issues: IssueOuverte[] }> {
    let rail: ReturnType<typeof configRail>;
    try {
      rail = configRail(env);
    } catch (erreur) {
      if (erreur instanceof ConfigInvalide) echouer(2, `${erreur.message}\n${USAGE}`);
      throw erreur;
    }
    const { depot } = rail;
    const github = ouvrirGitHub({ depot, bin: rail.gh });
    try {
      const sondage = await github.ouvertes();
      // Un GitHub ouvert à l'instant n'a pas d'ETag : la liste est toujours rendue — sans elle, rien n'est compté.
      if (sondage.inchange) throw new Error("GitHub did not return the list of open issues");
      return { depot, issues: sondage.issues };
    } catch (erreur) {
      echouer(1, `${quoi(depot)} was not read: ${erreur instanceof Error ? erreur.message : String(erreur)} — this is not “no issue”`);
    } finally {
      github.fermer();
    }
  }

  // Ce qu'allumer engage, compté là où le manager le lira : les issues ouvertes,
  // et celles qui portent `blocked-on-human`, jamais jugées. Les nombres
  // s'écrivent en chiffres nus, en tête de leur mot : un programme les lit.
  async function compter(): Promise<void> {
    const { depot, issues } = await lireOuvertes((depot) => `the backlog of ${depot}`);
    const retenues = issues.filter((issue) => issue.labels.includes("blocked-on-human" satisfies Ecart)).length;
    ligne("backlog", `${issues.length} open issue${issues.length === 1 ? "" : "s"}, of which ${retenues} ${retenues === 1 ? "carries" : "carry"} \`blocked-on-human\` — read just now on GitHub (${depot})`);
  }

  // Ce qui n'est pas encore sur le rail (amont.ts) : les issues ouvertes que le
  // rail ne porte pas, et ce qui arrive à chacune d'après le journal. Un objet
  // JSON sur une ligne, pour un programme — l'app : docs/runtime/manager.md, « En amont du rail ».
  // GitHub d'abord : le journal n'est ouvert, en lecture seule, que le temps de ranger.
  async function enAmontDuRail(repertoireEtat: string): Promise<void> {
    const { depot, issues } = await lireOuvertes((depot) => `what is upstream of the rail of ${depot}`);
    const lu = new Date().toISOString();
    const log = openLog(repertoireEtat, { lectureSeule: true });
    try {
      dire(JSON.stringify({ lu, depot, issues: enAmont(log.base, issues) }));
    } catch (erreur) {
      if (logNotReplayed(erreur)) echouer(1, "this log does not have the manager's state yet: restart the runtime, which recomputes it");
      throw erreur;
    } finally {
      log.fermer();
    }
  }

  const [commande] = args;
  // Elle ne lit pas le journal : elle n'en réclame pas le répertoire.
  if (commande === "backlog" && args.length === 1) return compter();
  const repertoireEtat = env.BRIGADE_STATE_DIR;
  if (!repertoireEtat) echouer(2, `BRIGADE_STATE_DIR is not set\n${USAGE}`);
  const montre = args.length === 0;
  const numero = commande === "return" && args.length === 2 && /^[1-9][0-9]*$/.test(args[1] ?? "") ? Number(args[1]) : null;
  const amont = commande === "upstream" && args.length === 1;
  if (!montre && !amont && numero === null && (args.length !== 1 || (commande !== "on" && commande !== "off"))) echouer(2, USAGE);
  // Une commande ouvre le journal en écriture : sans ce contrôle, elle en
  // créerait un là où il n'y en a pas.
  if (!existsSync(logPath(repertoireEtat))) echouer(1, `no log in ${repertoireEtat}`);
  if (amont) return enAmontDuRail(repertoireEtat);

  const log = openLog(repertoireEtat, { lectureSeule: montre });
  try {
    if (montre) montrer(log);
    else if (numero !== null) {
      const { fait, message } = rendre(log, numero);
      dire(`brigade : ${message}`);
      if (!fait) throw new Sortie(1);
    } else dire(`brigade : ${commander(log, commande as "on" | "off")}`);
  } catch (erreur) {
    // En lecture seule, rien ne crée les tables d'un journal écrit par un
    // runtime d'avant le manager.
    if (logNotReplayed(erreur)) {
      echouer(1, "this log does not have the manager's state yet: restart the runtime, which recomputes it");
    }
    throw erreur;
  } finally {
    log.fermer();
  }
}

if (import.meta.main) await enProcess(principal);
