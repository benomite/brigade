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
import type { Ecart } from "./evenements/manager.ts";
import { ouvrirGitHub, type IssueOuverte } from "./github.ts";
import { cheminJournal, ouvrirJournal, type Journal } from "./journal.ts";
import { journalPasRejoue } from "./journal-pas-rejoue.ts";
import { decoupagesDuManager, ticketsDEpique, type Decoupage } from "./projections/decoupages.ts";
import { decisionsDuManager, ecarteesDuManager, etatDuManager, issueDuManager, remiseDe, remisesEnAttente } from "./projections/manager.ts";
import { sortDuTicket } from "./projections/rail.ts";
import { reactionsDuManager, type ReactionDeTicket } from "./projections/reactions.ts";
import { sessionEnCours } from "./projections/sessions.ts";
import { ConfigInvalide } from "./runtime.ts";

const USAGE = "usage : BRIGADE_STATE_DIR=<répertoire d'état> npm --prefix runtime run manager -- [on | off | return <n° d'issue> | backlog | upstream]";
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
        if (!epique.done) return `découpage en cours, ${nes}/${epique.tickets.length} tickets créés et lancés — ${epique.reason}`;
        const servis = tickets.filter((ticket) => sortDuTicket(journal.base, ticket.ticket)?.outcome === "served").length;
        return `découpée, ${servis}/${tickets.length} servi${servis > 1 ? "s" : ""} (${tickets.map((ticket) => `#${ticket.ticket}`).join(", ")}) — ${epique.reason}`;
      }
      case "asked":
        return `QUESTION POSÉE, attend ta réponse sur l'épique — ${epique.reason}`;
      case "skipped":
        return `déjà découpée, aucun ticket créé — ${epique.reason}`;
      case "failed":
        return `découpage illisible — ${epique.reason}`;
    }
  }

  // Ce que le manager a fait d'un ticket que la pass a jugé rouge, et pourquoi.
  function decrireReaction(reaction: ReactionDeTicket): string {
    const dit = (calibrage: { model: string; effort: string }) => `${calibrage.model} / ${calibrage.effort}`;
    const apres = `après ${reaction.returns} renvoi${reaction.returns > 1 ? "s" : ""}`;
    switch (reaction.choice) {
      case "retry":
        return `second renvoi au même calibrage (${dit(reaction.from)}) — ${reaction.reason}`;
      case "raise":
        if (reaction.raised && !reaction.applied) return `${apres}, montée de ${dit(reaction.from)} à ${dit(reaction.to ?? reaction.from)} abandonnée : recalibré par le chef entre-temps — ${reaction.reason}`;
        return `${apres}, calibrage monté de ${dit(reaction.from)} à ${dit(reaction.to ?? reaction.from)} — ${reaction.reason}`;
      case "split":
        return `${apres}, redécoupé — ${reaction.reason}`;
      case "escalate":
        return `${apres}, remonté au chef — ${reaction.reason}${reaction.proposal === null ? "" : ` Proposé : ${reaction.proposal}`}`;
    }
  }

  function montrer(journal: Journal): void {
    const { base } = journal;
    const etat = etatDuManager(base);
    ligne(
      "manager",
      etat === null
        ? "ÉTEINT — jamais allumé : aucune issue n'est jugée, `fire` et le calibrage se posent à la main"
        : etat.active
          ? `ALLUMÉ depuis le ${etat.since} (par ${etat.by}) — il juge les issues ouvertes, pose \`fire\` et le calibrage`
          : `ÉTEINT depuis le ${etat.since} (par ${etat.by}) — aucune issue n'est jugée, ce qu'il a posé reste posé`,
    );
    const decisions = decisionsDuManager(base, DECISIONS_MONTREES);
    ligne("dernières décisions", decisions.length === 0 ? "aucune" : "");
    for (const issue of decisions) dire(`  ${issue.at}  #${issue.ticket}  ${decrire(issue)}`);
    const ecartees = ecarteesDuManager(base, ECARTEES_MONTREES);
    const remises = remisesEnAttente(base);
    ligne("écartées", ecartees.length + remises.length === 0 ? "aucune" : "");
    for (const remise of remises) dire(`  ${remise.at}  #${remise.ticket}  rendue au manager, pas encore rejugée — il la rejuge à son prochain réveil, s'il est allumé`);
    for (const issue of ecartees) dire(`  ${issue.at}  #${issue.ticket}  ${decrireEcart(issue)}`);
    const epiques = decoupagesDuManager(base, EPIQUES_MONTREES);
    ligne("épiques", epiques.length === 0 ? "aucune" : "");
    for (const epique of epiques) dire(`  ${epique.at}  #${epique.epic}  ${decrireEpique(journal, epique)}`);
    const reactions = reactionsDuManager(base, REACTIONS_MONTREES);
    ligne("réactions", reactions.length === 0 ? "aucune" : "");
    for (const reaction of reactions) dire(`  ${reaction.at}  #${reaction.ticket}  ${decrireReaction(reaction)}`);
  }

  // Écrit la commande du chef si elle change quelque chose, et dit ce qu'il en
  // est. Vérifier et écrire tiennent dans une seule transaction.
  function commander(journal: Journal, commande: "on" | "off"): string {
    const { base } = journal;
    return base.transaction(() => {
      const projet = base.lire<{ project: string }>("SELECT project FROM events ORDER BY seq DESC LIMIT 1")[0]?.project;
      if (!projet) echouer(1, "journal vide : le runtime n'a jamais démarré sur ce répertoire d'état");
      const etat = etatDuManager(base);
      const absent = sessionEnCours(base) ? "" : " (aucun runtime ne tourne : la commande vaudra à son prochain démarrage)";

      if (commande === "on") {
        if (etat?.active) return `manager déjà allumé depuis le ${etat.since}`;
        journal.ajouter({ project: projet, ticket: null, author: AUTEUR, type: "manager.enabled", payload: {} });
        return `manager allumé : il juge les issues ouvertes, pose \`fire\` et le calibrage sur celles qui sont exécutables, découpe les épiques en tickets, et dit pourquoi sur les autres — une issue \`blocked-on-human\` ou \`hors-cuisine\` n'est jamais jugée${absent}`;
      }
      if (!etat?.active) return "rien à éteindre : le manager n'est pas allumé";
      journal.ajouter({ project: projet, ticket: null, author: AUTEUR, type: "manager.disabled", payload: {} });
      return `manager éteint : plus aucune issue n'est jugée — ce qu'il a posé reste posé ; un jugement en cours va à son terme, mais sa décision ne sera posée que rallumé${absent}`;
    });
  }

  // Rend une issue au manager, si c'est par là que son écart se lève ; sinon dit
  // le geste qui le lève. `fait` : la remise est au journal, ou y était déjà.
  function rendre(journal: Journal, numero: number): { fait: boolean; message: string } {
    const { base } = journal;
    return base.transaction(() => {
      const projet = base.lire<{ project: string }>("SELECT project FROM events ORDER BY seq DESC LIMIT 1")[0]?.project;
      if (!projet) echouer(1, "journal vide : le runtime n'a jamais démarré sur ce répertoire d'état");
      const suite = !etatDuManager(base)?.active
        ? " (le manager est éteint : elle sera rejugée quand tu l'allumeras)"
        : sessionEnCours(base)
          ? ""
          : " (aucun runtime ne tourne : elle sera rejugée à son prochain démarrage)";
      if (remiseDe(base, numero)) return { fait: true, message: `#${numero} est déjà rendue au manager : il la rejuge à son prochain réveil${suite}` };
      const issue = issueDuManager(base, numero);
      if (!issue) return { fait: false, message: `rien à rendre : le manager n'a rien décidé sur #${numero} — une issue ouverte qu'il n'a jamais vue est jugée d'elle-même` };
      if (issue.decision !== "aside") return { fait: false, message: `rien à rendre : #${numero} n'est pas écartée — ${decrire(issue)}` };
      if (issue.reason !== ("chef-changed" satisfies Ecart)) {
        const { motif, geste } = ecart(issue);
        return { fait: false, message: `#${numero} n'est pas rendue : ${motif}. ${geste === null ? "Rien ne la rend au manager." : `Ce qui lève cet écart : ${geste}.`}` };
      }
      journal.ajouter({ project: projet, ticket: numero, author: AUTEUR, type: "manager.handed-back", payload: {} });
      return {
        fait: true,
        message: `#${numero} rendue au manager : il la rejuge à neuf — il retire le calibrage qu'il y avait posé, puis pose \`fire\` et celui du nouveau jugement, ou dit pourquoi ce n'est pas un ticket exécutable. Une remise vaut pour un jugement${suite}`,
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
      if (sondage.inchange) throw new Error("GitHub n'a pas rendu la liste des issues ouvertes");
      return { depot, issues: sondage.issues };
    } catch (erreur) {
      echouer(1, `${quoi(depot)} n'a pas été lu : ${erreur instanceof Error ? erreur.message : String(erreur)} — ce n'est pas « aucune issue »`);
    } finally {
      github.fermer();
    }
  }

  // Ce qu'allumer engage, compté là où le manager le lira : les issues ouvertes,
  // et celles qui portent `blocked-on-human`, jamais jugées. Les nombres
  // s'écrivent en chiffres nus, en tête de leur mot : un programme les lit.
  async function compter(): Promise<void> {
    const { depot, issues } = await lireOuvertes((depot) => `le backlog de ${depot}`);
    const retenues = issues.filter((issue) => issue.labels.includes("blocked-on-human" satisfies Ecart)).length;
    ligne("backlog", `${issues.length} issue${issues.length > 1 ? "s" : ""} ouverte${issues.length > 1 ? "s" : ""}, dont ${retenues} porte${retenues > 1 ? "nt" : ""} \`blocked-on-human\` — lu à l'instant sur GitHub (${depot})`);
  }

  // Ce qui n'est pas encore sur le rail (amont.ts) : les issues ouvertes que le
  // rail ne porte pas, et ce qui arrive à chacune d'après le journal. Un objet
  // JSON sur une ligne, pour un programme — l'app : docs/runtime/manager.md, « En amont du rail ».
  // GitHub d'abord : le journal n'est ouvert, en lecture seule, que le temps de ranger.
  async function enAmontDuRail(repertoireEtat: string): Promise<void> {
    const { depot, issues } = await lireOuvertes((depot) => `ce qui est en amont du rail de ${depot}`);
    const lu = new Date().toISOString();
    const journal = ouvrirJournal(repertoireEtat, { lectureSeule: true });
    try {
      dire(JSON.stringify({ lu, depot, issues: enAmont(journal.base, issues) }));
    } catch (erreur) {
      if (journalPasRejoue(erreur)) echouer(1, "ce journal n'a pas encore l'état du manager : redémarrer le runtime, qui le recalcule");
      throw erreur;
    } finally {
      journal.fermer();
    }
  }

  const [commande] = args;
  // Elle ne lit pas le journal : elle n'en réclame pas le répertoire.
  if (commande === "backlog" && args.length === 1) return compter();
  const repertoireEtat = env.BRIGADE_STATE_DIR;
  if (!repertoireEtat) echouer(2, `BRIGADE_STATE_DIR n'est pas défini\n${USAGE}`);
  const montre = args.length === 0;
  const numero = commande === "return" && args.length === 2 && /^[1-9][0-9]*$/.test(args[1] ?? "") ? Number(args[1]) : null;
  const amont = commande === "upstream" && args.length === 1;
  if (!montre && !amont && numero === null && (args.length !== 1 || (commande !== "on" && commande !== "off"))) echouer(2, USAGE);
  // Une commande ouvre le journal en écriture : sans ce contrôle, elle en
  // créerait un là où il n'y en a pas.
  if (!existsSync(cheminJournal(repertoireEtat))) echouer(1, `aucun journal dans ${repertoireEtat}`);
  if (amont) return enAmontDuRail(repertoireEtat);

  const journal = ouvrirJournal(repertoireEtat, { lectureSeule: montre });
  try {
    if (montre) montrer(journal);
    else if (numero !== null) {
      const { fait, message } = rendre(journal, numero);
      dire(`brigade : ${message}`);
      if (!fait) throw new Sortie(1);
    } else dire(`brigade : ${commander(journal, commande as "on" | "off")}`);
  } catch (erreur) {
    // En lecture seule, rien ne crée les tables d'un journal écrit par un
    // runtime d'avant le manager.
    if (journalPasRejoue(erreur)) {
      echouer(1, "ce journal n'a pas encore l'état du manager : redémarrer le runtime, qui le recalcule");
    }
    throw erreur;
  } finally {
    journal.fermer();
  }
}

if (import.meta.main) await enProcess(principal);
