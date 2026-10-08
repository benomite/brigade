// Le manager vu et commandé par le chef, depuis son propre process :
//   npm --prefix runtime run manager                l'interrupteur, les dernières décisions, ce qu'il a écarté, les épiques, et ses réactions aux échecs
//   npm --prefix runtime run manager -- allumer     il juge les issues ouvertes, pose `fire` et le calibrage, découpe les épiques
//   npm --prefix runtime run manager -- eteindre    il ne juge plus rien
//   npm --prefix runtime run manager -- rendre <n°> il rejuge à neuf une issue qu'il avait écartée parce que le chef y avait retiré un de ses labels
// Une commande s'écrit dans le journal ; le runtime qui tourne la voit à son
// prochain réveil, une seconde au plus, sans redémarrage.
import { existsSync } from "node:fs";
import { commandeRendre, NOMS_DE_NATURE, type Ecart, type Nature } from "./evenements/manager.ts";
import { cheminJournal, ouvrirJournal, type Journal } from "./journal.ts";
import { journalPasRejoue } from "./journal-pas-rejoue.ts";
import { decoupagesDuManager, ticketsDEpique, type Decoupage } from "./projections/decoupages.ts";
import { decisionsDuManager, ecarteesDuManager, etatDuManager, issueDuManager, remiseDe, remisesEnAttente, type IssueDuManager } from "./projections/manager.ts";
import { sortDuTicket } from "./projections/rail.ts";
import { reactionsDuManager, type ReactionDeTicket } from "./projections/reactions.ts";
import { sessionEnCours } from "./projections/sessions.ts";

const USAGE = "usage : BRIGADE_STATE_DIR=<répertoire d'état> npm --prefix runtime run manager -- [allumer | eteindre | rendre <n° d'issue>]";
const AUTEUR = "chef";
const DECISIONS_MONTREES = 15;
const ECARTEES_MONTREES = 10;
const EPIQUES_MONTREES = 10;
const REACTIONS_MONTREES = 10;

function echouer(code: number, message: string): never {
  console.error(`brigade : ${message}`);
  process.exit(code);
}

const ligne = (titre: string, valeur: string) => console.log(`${titre.padEnd(22)}${valeur}`);

function decrire(issue: IssueDuManager): string {
  switch (issue.decision) {
    case "fire": {
      const pose = issue.labels === null ? "labels pas encore posés" : issue.labels.length === 0 ? "rien à poser" : `posé : ${issue.labels.join(", ")}`;
      return `sur le rail, ${issue.model} / ${issue.effort} (${pose}) — ${issue.reason}`;
    }
    case "refused":
      return `refusée (${NOMS_DE_NATURE[issue.kind as Nature] ?? issue.kind}) — ${issue.reason}`;
    case "failed":
      return `jugement illisible — ${issue.reason}`;
    case "aside":
      return `écartée (${issue.reason})${issue.fired ? ", `fire` posé par le chef : laissé, non calibrée" : ""}`;
  }
}

// Pourquoi une issue est écartée, et le geste du chef qui lève l'écart — un
// par motif : seul `chef-changed` se lève par la commande `rendre`.
function ecart(issue: IssueDuManager): { motif: string; geste: string | null } {
  const label = (nom: string) => ({ motif: `elle porte \`${nom}\``, geste: `retire \`${nom}\` : elle est jugée au réveil suivant` });
  switch (issue.reason as Ecart) {
    case "chef-changed":
      return { motif: "tu y as retiré `fire` ou un calibrage que le manager avait posé", geste: `\`${commandeRendre(issue.ticket)}\` : il la rejuge à neuf` };
    case "blocked-on-human":
    case "question":
    case "decision":
    case "epic":
      return label(issue.reason);
    case "already-split":
      return { motif: "son corps liste déjà les tickets d'une épique, découpée à la main", geste: "retire cette liste de son corps : l'épique est découpée au réveil suivant" };
    case "roadmap":
      return { motif: "c'est la roadmap du projet", geste: null };
    case "untrusted-author":
      return { motif: "son auteur n'a pas la main sur le dépôt", geste: null };
    default:
      return { motif: issue.reason, geste: null };
  }
}

const decrireEcart = (issue: IssueDuManager): string => {
  const { motif, geste } = ecart(issue);
  return `${motif} — ${geste === null ? "rien ne la rend au manager" : `pour la lui rendre : ${geste}`}`;
};

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
  for (const issue of decisions) console.log(`  ${issue.at}  #${issue.ticket}  ${decrire(issue)}`);
  const ecartees = ecarteesDuManager(base, ECARTEES_MONTREES);
  const remises = remisesEnAttente(base);
  ligne("écartées", ecartees.length + remises.length === 0 ? "aucune" : "");
  for (const remise of remises) console.log(`  ${remise.at}  #${remise.ticket}  rendue au manager, pas encore rejugée — il la rejuge à son prochain réveil, s'il est allumé`);
  for (const issue of ecartees) console.log(`  ${issue.at}  #${issue.ticket}  ${decrireEcart(issue)}`);
  const epiques = decoupagesDuManager(base, EPIQUES_MONTREES);
  ligne("épiques", epiques.length === 0 ? "aucune" : "");
  for (const epique of epiques) console.log(`  ${epique.at}  #${epique.epic}  ${decrireEpique(journal, epique)}`);
  const reactions = reactionsDuManager(base, REACTIONS_MONTREES);
  ligne("réactions", reactions.length === 0 ? "aucune" : "");
  for (const reaction of reactions) console.log(`  ${reaction.at}  #${reaction.ticket}  ${decrireReaction(reaction)}`);
}

// Écrit la commande du chef si elle change quelque chose, et dit ce qu'il en
// est. Vérifier et écrire tiennent dans une seule transaction.
function commander(journal: Journal, commande: "allumer" | "eteindre"): string {
  const { base } = journal;
  return base.transaction(() => {
    const projet = base.lire<{ project: string }>("SELECT project FROM events ORDER BY seq DESC LIMIT 1")[0]?.project;
    if (!projet) echouer(1, "journal vide : le runtime n'a jamais démarré sur ce répertoire d'état");
    const etat = etatDuManager(base);
    const absent = sessionEnCours(base) ? "" : " (aucun runtime ne tourne : la commande vaudra à son prochain démarrage)";

    if (commande === "allumer") {
      if (etat?.active) return `manager déjà allumé depuis le ${etat.since}`;
      journal.ajouter({ project: projet, ticket: null, author: AUTEUR, type: "manager.enabled", payload: {} });
      return `manager allumé : il juge les issues ouvertes, pose \`fire\` et le calibrage sur celles qui sont exécutables, découpe les épiques en tickets, et dit pourquoi sur les autres — une issue \`blocked-on-human\` n'est jamais jugée${absent}`;
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

const args = process.argv.slice(2);
const repertoireEtat = process.env.BRIGADE_STATE_DIR;
if (!repertoireEtat) echouer(2, `BRIGADE_STATE_DIR n'est pas défini\n${USAGE}`);
const [commande] = args;
const montre = args.length === 0;
const numero = commande === "rendre" && args.length === 2 && /^[1-9][0-9]*$/.test(args[1] ?? "") ? Number(args[1]) : null;
if (!montre && numero === null && (args.length !== 1 || (commande !== "allumer" && commande !== "eteindre"))) echouer(2, USAGE);
// Une commande ouvre le journal en écriture : sans ce contrôle, elle en
// créerait un là où il n'y en a pas.
if (!existsSync(cheminJournal(repertoireEtat))) echouer(1, `aucun journal dans ${repertoireEtat}`);

const journal = ouvrirJournal(repertoireEtat, { lectureSeule: montre });
try {
  if (montre) montrer(journal);
  else if (numero !== null) {
    const { fait, message } = rendre(journal, numero);
    console.log(`brigade : ${message}`);
    if (!fait) process.exitCode = 1;
  } else console.log(`brigade : ${commander(journal, commande as "allumer" | "eteindre")}`);
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
