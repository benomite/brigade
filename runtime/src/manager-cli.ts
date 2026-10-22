// Le manager vu et commandé par le chef, depuis son propre process :
//   npm --prefix runtime run manager                s'il juge, les dernières décisions, ce qu'il a écarté, les épiques, et ses réactions aux échecs
//   npm --prefix runtime run manager -- on | off    refusées : le manager n'a plus d'interrupteur à lui, il suit celui du projet (`switch`, interrupteur.ts)
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
import { cheminJournal, ouvrirJournal, type Journal } from "./journal.ts";
import { journalPasRejoue } from "./journal-pas-rejoue.ts";
import { decoupagesDuManager, ticketsDEpique, type Decoupage } from "./projections/splits.ts";
import { decisionsDuManager, ecarteesDuManager, etatDuManager, issueDuManager, managerAllume, remiseDe, remisesEnAttente } from "./projections/manager.ts";
import { etatDeLInterrupteur } from "./projections/switch.ts";
import { geste } from "./geste.ts";
import { sortDuTicket } from "./projections/rail.ts";
import { reactionsDuManager, type ReactionDeTicket } from "./projections/reactions.ts";
import { sessionEnCours } from "./projections/sessions.ts";
import { ConfigInvalide } from "./runtime.ts";

const USAGE = "usage: BRIGADE_STATE_DIR=<state directory> npm --prefix runtime run manager -- [return <issue number> | backlog | upstream]";
const AUTEUR = "chef";
const DECISIONS_MONTREES = 15;
const ECARTEES_MONTREES = 10;
const EPIQUES_MONTREES = 10;
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
  function decrireEpique(journal: Journal, epique: Decoupage): string {
    switch (epique.state) {
      case "split": {
        const tickets = ticketsDEpique(journal.base, epique.epic);
        const nes = tickets.filter((ticket) => ticket.index !== null && ticket.fired).length;
        if (!epique.done) return `split in progress, ${nes}/${epique.tickets.length} tickets created and fired — ${epique.reason}`;
        const servis = tickets.filter((ticket) => sortDuTicket(journal.base, ticket.ticket)?.outcome === "served").length;
        return `split, ${servis}/${tickets.length} served (${tickets.map((ticket) => `#${ticket.ticket}`).join(", ")}) — ${epique.reason}`;
      }
      case "asked":
        return `QUESTION ASKED, awaiting your answer on the epic — ${epique.reason}`;
      case "skipped":
        return `already split, no ticket created — ${epique.reason}`;
      case "failed":
        return `unreadable split — ${epique.reason}`;
    }
  }

  // Ce que le manager a fait d'un ticket que la pass a jugé rouge, et pourquoi.
  function decrireReaction(reaction: ReactionDeTicket): string {
    const dit = (calibrage: { model: string; effort: string }) => `${calibrage.model} / ${calibrage.effort}`;
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

  function montrer(journal: Journal): void {
    const { base } = journal;
    // Le manager suit l'interrupteur du projet ; seul un journal où il n'est pas encore posé lit l'ancien.
    const projet = etatDeLInterrupteur(base);
    const etat = projet === null ? etatDuManager(base) : { active: projet.on, since: projet.since, by: projet.by };
    const suit = projet === null ? "" : "the project switch is on: ";
    ligne(
      "manager",
      etat === null
        ? "OFF — never turned on: no issue is judged, `fire` and the calibration are set by hand"
        : etat.active
          ? `ON since ${etat.since} (by ${etat.by}) — ${suit}it judges the open issues, sets \`fire\` and the calibration`
          : `OFF since ${etat.since} (by ${etat.by}) — ${projet === null ? "" : `the project switch is off: \`${geste("switch on")}\` turns it on — `}no issue is judged, what it set stays set`,
    );
    const decisions = decisionsDuManager(base, DECISIONS_MONTREES);
    ligne("latest decisions", decisions.length === 0 ? "none" : "");
    for (const issue of decisions) dire(`  ${issue.at}  #${issue.ticket}  ${decrire(issue)}`);
    const ecartees = ecarteesDuManager(base, ECARTEES_MONTREES);
    const remises = remisesEnAttente(base);
    ligne("set aside", ecartees.length + remises.length === 0 ? "none" : "");
    for (const remise of remises) dire(`  ${remise.at}  #${remise.ticket}  returned to the manager, not rejudged yet — it rejudges it on its next wake-up, if it is on`);
    for (const issue of ecartees) dire(`  ${issue.at}  #${issue.ticket}  ${decrireEcart(issue)}`);
    const epiques = decoupagesDuManager(base, EPIQUES_MONTREES);
    ligne("epics", epiques.length === 0 ? "none" : "");
    for (const epique of epiques) dire(`  ${epique.at}  #${epique.epic}  ${decrireEpique(journal, epique)}`);
    const reactions = reactionsDuManager(base, REACTIONS_MONTREES);
    ligne("reactions", reactions.length === 0 ? "none" : "");
    for (const reaction of reactions) dire(`  ${reaction.at}  #${reaction.ticket}  ${decrireReaction(reaction)}`);
  }

  // Rend une issue au manager, si c'est par là que son écart se lève ; sinon dit
  // le geste qui le lève. `fait` : la remise est au journal, ou y était déjà.
  function rendre(journal: Journal, numero: number): { fait: boolean; message: string } {
    const { base } = journal;
    return base.transaction(() => {
      const projet = base.lire<{ project: string }>("SELECT project FROM events ORDER BY seq DESC LIMIT 1")[0]?.project;
      if (!projet) echouer(1, "empty log: the runtime has never started on this state directory");
      const suite = !managerAllume(base)
        ? ` (the manager is off: it will be rejudged once the project switch is on — \`${geste("switch on")}\`)`
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
      journal.ajouter({ project: projet, ticket: numero, author: AUTEUR, type: "manager.handed-back", payload: {} });
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
    // Une commande du chef : la box ne retient aucun de ses appels (limite-github.ts).
    const github = ouvrirGitHub({ depot, bin: rail.gh, usage: "geste" });
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
    const journal = ouvrirJournal(repertoireEtat, { lectureSeule: true });
    try {
      dire(JSON.stringify({ lu, depot, issues: enAmont(journal.base, issues) }));
    } catch (erreur) {
      if (journalPasRejoue(erreur)) echouer(1, "this log does not have the manager's state yet: restart the runtime, which recomputes it");
      throw erreur;
    } finally {
      journal.fermer();
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
  // Le manager n'a plus d'interrupteur à lui (#1406) : il suit celui du projet.
  if (args.length === 1 && (commande === "on" || commande === "off")) {
    echouer(1, `the manager has no switch of its own any more: it follows the project switch, which also takes the tickets and merges the green deliveries — \`${geste(`switch ${commande}`)}\`. Nothing is written`);
  }
  if (!montre && !amont && numero === null) echouer(2, USAGE);
  // Une commande ouvre le journal en écriture : sans ce contrôle, elle en
  // créerait un là où il n'y en a pas.
  if (!existsSync(cheminJournal(repertoireEtat))) echouer(1, `no log in ${repertoireEtat}`);
  if (amont) return enAmontDuRail(repertoireEtat);

  const journal = ouvrirJournal(repertoireEtat, { lectureSeule: montre });
  try {
    if (montre) montrer(journal);
    else if (numero !== null) {
      const { fait, message } = rendre(journal, numero);
      dire(`brigade : ${message}`);
      if (!fait) throw new Sortie(1);
    }
  } catch (erreur) {
    // En lecture seule, rien ne crée les tables d'un journal écrit par un
    // runtime d'avant le manager.
    if (journalPasRejoue(erreur)) {
      echouer(1, "this log does not have the manager's state yet: restart the runtime, which recomputes it");
    }
    throw erreur;
  } finally {
    journal.fermer();
  }
}

if (import.meta.main) await enProcess(principal);
