// Le superviseur du projet (spec 2026-11-20-kitchen-spinning, étape 4, #3911) : le manager du projet, devant deux
// choses que la cuisine ne referme pas seule.
//
// - Le disjoncteur ouvert. Le chef ne le referme plus : le superviseur rejoue le contrôle qui l'a ouvert — un run, qui
//   finit bien ou non — et ne le referme que si ce run finit bien. Tant que le contrôle échoue, le disjoncteur reste
//   ouvert, et le contrôle est rejoué plus tard. Fermé, il le dit sur chaque ticket que la cause touchait.
// - Un ticket mis de côté par ses échecs (`set-aside:failures`). Aucune minuterie ne le remet sur le rail : il est confié
//   au superviseur, qui reçoit son dossier et répond par UN geste de la liste fermée ci-dessous — les gestes de l'étape 4 de
//   la spec. Sa réponse illisible, ou hors de la liste, ne fait rien : le dossier est redonné plus tard, trois fois au plus.
//
// Rien n'est tenu ici qu'un cache : l'état se relit du journal et de GitHub à chaque passe. Un geste qui réussit retire
// `set-aside:failures`, et le ticket n'est plus confié.
import type { Base } from "../base.ts";
import { calageDuDisjoncteur, direLeCalage } from "../breaker/calage.ts";
import { projetEteint } from "../projections/switch.ts";
import { poserLAttente, corpsDeLAttente } from "../attente-github/attente-github.ts";
import type { Evenement } from "../evenements.ts";
import type { FaitGardeFous } from "../events/guardrails.ts";
import { ECHECS_ATTEINTS, LABEL, type GitHub, type Issue } from "../github.ts";
import type { Journal } from "../journal.ts";
import { couper, COMMENTAIRES_MAX, CORPS_MAX } from "../juger.ts";
import { echecsDuDisjoncteur, etatDesGardeFous } from "../projections/guardrails.ts";
import type { Reponse } from "../decoupage.ts";

// Les gestes que le superviseur peut faire sur un ticket mis de côté : ceux de l'étape 4 de la spec que ce ticket sait
// appliquer, et aucun autre. `rail` : remettre le ticket sur le rail, avec une note ; `waiting` : le mettre de côté en
// WAITING pour un tiers nommé ; `close` : fermer un doublon ou une alerte périmée ; `todo` : poser une carte de TODO, pour
// une question de produit ou de design seulement.
const GESTES = ["rail", "waiting", "close", "todo"] as const;
type Geste = (typeof GESTES)[number];

// Un contrôle de disjoncteur rejoué au plus toutes les 10 minutes.
const CONTROLE_TOUS_LES_MS = 10 * 60_000;
// Un dossier redonné après 10 minutes quand la réponse ne s'applique pas, trois fois au plus.
const DOSSIER_TOUS_LES_MS = 10 * 60_000;
const DOSSIER_ESSAIS_MAX = 3;
// Les tickets du rail se relisent au plus toutes les minutes.
const LECTURE_TOUTES_LES_MS = 60_000;

const MARQUE_DU_SUPERVISEUR = "<!-- brigade:superviseur -->";

type Demander = <T>(
  sujet: { numero: number; prefixe: string; nom: string },
  consigne: string,
  lire: (message: string | null) => { valeur: T } | { illisible: string },
  envDuRole?: NodeJS.ProcessEnv,
  succes?: "ok" | "neutral",
) => Promise<Reponse<T> | null>;

export type OptionsSupervision = {
  base: Base;
  journal: Journal;
  projet: string;
  github: Pick<GitHub, "tickets" | "issue" | "commentaires" | "commenter" | "labelliser" | "delabelliser" | "fermerIssue">;
  demander: Demander;
  maintenant: () => Date;
  avertir: (message: string) => void;
  arrete: () => boolean;
};

type Decision = { geste: Geste; note: string; tiers?: string; question?: string };

const message = (erreur: unknown) => (erreur instanceof Error ? erreur.message : String(erreur));

// Le numéro du ticket qu'un run nomme : `44-github-…` (un cook), `juge-45-…` (un jugement du manager).
const ticketDuRun = (run: string): number | null => {
  const numero = /^(?:juge-|decoupe-)?(\d+)-/.exec(run)?.[1];
  return numero === undefined ? null : Number(numero);
};

// La réponse du superviseur sur un ticket : un objet JSON, un geste de la liste fermée et sa note.
function lireLaDecision(texte: string | null): { valeur: Decision } | { illisible: string } {
  const objet = /\{[\s\S]*\}/.exec(texte ?? "")?.[0];
  if (objet === undefined) return { illisible: "no JSON object in the answer" };
  let lu: Record<string, unknown>;
  try {
    lu = JSON.parse(objet) as Record<string, unknown>;
  } catch {
    return { illisible: "the answer is not valid JSON" };
  }
  const { gesture, note, third_party: tiers, question } = lu;
  if (!(typeof gesture === "string" && (GESTES as readonly string[]).includes(gesture))) return { illisible: `\`gesture\` is not one of ${GESTES.join(", ")}` };
  if (typeof note !== "string" || note.trim() === "") return { illisible: "`note` is empty" };
  if (gesture === "waiting" && (typeof tiers !== "string" || tiers.trim() === "")) return { illisible: "`waiting` names no third party in `third_party`" };
  if (gesture === "todo" && (typeof question !== "string" || question.trim() === "")) return { illisible: "`todo` asks no question in `question`" };
  return { valeur: { geste: gesture as Geste, note: note.trim(), ...(typeof tiers === "string" ? { tiers: tiers.trim() } : {}), ...(typeof question === "string" ? { question: question.trim() } : {}) } };
}

const CONSIGNE_DU_CONTROLE = "This is a health check of the kitchen's `claude` run. Answer with the single word OK and nothing else.";

function consigneDuDossier(ticket: Issue, corps: string, commentaires: readonly string[], faits: readonly string[]): string {
  return [
    "You are the supervisor of a software kitchen. A ticket was set aside by its failure count (`set-aside:failures`): its cooks stopped without a delivery too many times, and nothing puts it back on the rail by itself. Read its dossier and choose ONE gesture.",
    "",
    "The only gestures you may make:",
    '- "rail": put the ticket back on the rail, with a note for the next cook saying what to change;',
    '- "waiting": set the ticket aside in WAITING for a named third party (`third_party`) — only when what it waits for is outside the kitchen;',
    '- "close": close the ticket, when it is a duplicate or a stale alert;',
    '- "todo": post a TODO card for the chef, only for a product or design question (`question`).',
    "You never ask the chef for a technical gesture (a rerun, a merge, a rebase, a log reading).",
    "",
    'Answer with one JSON object and nothing else: {"gesture": "rail" | "waiting" | "close" | "todo", "note": "what you saw and why", "third_party": "...", "question": "..."} — `third_party` only for "waiting", `question` only for "todo".',
    "",
    `# Ticket #${ticket.number} — ${ticket.title}`,
    `Labels: ${ticket.labels.join(", ")}`,
    "",
    couper(corps, CORPS_MAX),
    "",
    "# Its comments, oldest first",
    couper(commentaires.join("\n---\n"), COMMENTAIRES_MAX),
    "",
    "# What the journal says of it, oldest first",
    faits.join("\n"),
  ].join("\n");
}

const resume = (fait: Evenement) => `${fait.at} ${fait.type} ${couper(JSON.stringify(fait.payload), 300)}`;

export function ouvrirSupervision(options: OptionsSupervision) {
  const { base, journal, projet, github, demander, maintenant, avertir, arrete } = options;

  // Le contrôle du disjoncteur : l'ouverture qu'il a rejouée, et quand.
  let controle: { ouvertLe: string; a: number } | null = null;
  // Les dossiers : par ticket, combien de fois confié sans geste, et quand.
  const confies = new Map<number, { essais: number; a: number }>();
  let lueA = Number.NEGATIVE_INFINITY;
  let confirmees: Issue[] = [];
  let enCours = false;

  // La cause du disjoncteur ouvert, dite sur les tickets qu'elle touchait.
  const causeDuDisjoncteur = (): { tickets: number[]; gone: string } => {
    const calage = calageDuDisjoncteur(base);
    if (calage === null) {
      const echecs = echecsDuDisjoncteur(base);
      const tickets = [...new Set(echecs.flatMap((echec) => echec.ticket ?? []))];
      return { tickets, gone: `cooks failed in a row (${echecs.length} failure${echecs.length === 1 ? "" : "s"}) — a new run ended well` };
    }
    const ticket = ticketDuRun(calage.run);
    return { tickets: ticket === null ? [] : [ticket], gone: `a run kept stalling (${direLeCalage(calage)}) — a new run ended well` };
  };

  const controlerLeDisjoncteur = async () => {
    const ouvertLe = etatDesGardeFous(base).breakerOpenedAt;
    if (ouvertLe === null) {
      controle = null;
      return;
    }
    if (controle !== null && controle.ouvertLe === ouvertLe && maintenant().getTime() - controle.a < CONTROLE_TOUS_LES_MS) return;
    controle = { ouvertLe, a: maintenant().getTime() };
    const { tickets, gone } = causeDuDisjoncteur();
    const reponse = await demander({ numero: 0, prefixe: "controle", nom: "breaker check" }, CONSIGNE_DU_CONTROLE, () => ({ valeur: "ok" }), undefined, "ok");
    if (reponse === null || "illisible" in reponse || arrete()) return;
    // Le contrôle a passé. Un disjoncteur que le run a refermé seul (un calage) l'est déjà ; sinon c'est ici.
    const etat = etatDesGardeFous(base);
    const dejaFerme = etat.breakerOpenedAt === null;
    if (!dejaFerme) {
      const fait: FaitGardeFous = { type: "breaker.lifted", payload: { failures: etat.failures, threshold: etat.breakerThreshold ?? 0, after: reponse.run } };
      journal.ajouter({ project: projet, ticket: null, author: "runtime", ...fait });
    }
    controle = null;
    for (const ticket of tickets) {
      try {
        await github.commenter(ticket, `${MARQUE_DU_SUPERVISEUR}\n**Supervisor — the breaker is closed.** Cause gone: ${gone}. The kitchen launches cooks again.`);
      } catch (erreur) {
        if (!arrete()) avertir(`brigade : superviseur — la fermeture du disjoncteur n'a pas pu se dire sur #${ticket} — ${message(erreur)}`);
      }
    }
  };

  const confierUnTicket = async (ticket: Issue) => {
    const corps = (await github.issue(ticket.number))?.body ?? "";
    const commentaires = (await github.commentaires(ticket.number)).slice(-8).map((c) => `${c.author} (${c.createdAt}):\n${c.body}`);
    const faits = journal.duTicket(ticket.number).slice(-15).map(resume);
    const reponse = await demander({ numero: ticket.number, prefixe: "supervise", nom: "supervisor dossier" }, consigneDuDossier(ticket, corps, commentaires, faits), lireLaDecision);
    if (reponse === null || arrete()) return;
    const deja = confies.get(ticket.number) ?? { essais: 0, a: 0 };
    if ("illisible" in reponse) {
      confies.set(ticket.number, { essais: deja.essais + 1, a: maintenant().getTime() });
      avertir(`brigade : superviseur — la réponse sur #${ticket.number} ne s'applique pas (${reponse.illisible}), essai ${deja.essais + 1}/${DOSSIER_ESSAIS_MAX}`);
      return;
    }
    await appliquer(ticket, reponse.valeur);
    confies.delete(ticket.number);
  };

  // Le geste, puis la trace : un seul commentaire sur le ticket, ce que le superviseur a vu et ce qu'il a fait. Le label
  // `set-aside:failures` tombe en dernier : un geste interrompu se rejoue.
  const appliquer = async (ticket: Issue, { geste, note, tiers, question }: Decision) => {
    const n = ticket.number;
    const trace = (fait: string) => `${MARQUE_DU_SUPERVISEUR}\n**Supervisor** — the ticket was set aside by its failure count (\`${ECHECS_ATTEINTS}\`).\n\n**Saw:** ${note}\n\n**Did:** ${fait}`;
    switch (geste) {
      case "rail":
        await github.commenter(n, trace("put it back on the rail."));
        if (!ticket.labels.includes(LABEL)) await github.labelliser(n, [LABEL]);
        break;
      case "waiting": {
        // La marque de l'attente ouvre le commentaire, la trace le suit : un seul commentaire, aucune relance à une date.
        const attente = { what: note, who: tiers ?? "a third party", followUp: maintenant().toISOString() };
        await poserLAttente(github, n, `${corpsDeLAttente(attente, { station: "supervisor", mots: note })}\n\n${trace(`set it aside in WAITING for ${tiers}.`)}`, `#${n}`, "the ticket stays set aside");
        break;
      }
      case "close":
        await github.commenter(n, trace("closed it, a duplicate or a stale alert."));
        await github.fermerIssue(n);
        break;
      case "todo":
        await github.commenter(n, `${trace("posted a TODO card for the chef: a product or design question.")}\n\n**Question for the chef:** ${question}`);
        await github.labelliser(n, ["blocked-on-human"]);
        break;
    }
    await github.delabelliser(n, ECHECS_ATTEINTS);
  };

  const confierLesTicketsEcartes = async () => {
    if (maintenant().getTime() - lueA >= LECTURE_TOUTES_LES_MS) {
      lueA = maintenant().getTime();
      const sondage = await github.tickets();
      if (!sondage.inchange) {
        confirmees = sondage.issues;
        sondage.confirmer();
      }
    }
    for (const ticket of confirmees.filter((issue) => issue.labels.includes(ECHECS_ATTEINTS))) {
      const deja = confies.get(ticket.number);
      if (deja && (deja.essais >= DOSSIER_ESSAIS_MAX || maintenant().getTime() - deja.a < DOSSIER_TOUS_LES_MS)) continue;
      if (arrete() || projetEteint(base)) return;
      try {
        await confierUnTicket(ticket);
      } catch (erreur) {
        // Un geste qui a manqué se rejoue à la passe suivante : `set-aside:failures` n'est retiré qu'après lui.
        if (!arrete()) avertir(`brigade : superviseur — #${ticket.number} non traité — ${message(erreur)}`);
        confies.set(ticket.number, { essais: (deja?.essais ?? 0) + 1, a: maintenant().getTime() });
      }
    }
  };

  // Une passe à la fois : un réveil qui arrive pendant l'une est repris au suivant.
  const passer = async () => {
    if (enCours || arrete() || projetEteint(base)) return;
    enCours = true;
    try {
      await controlerLeDisjoncteur();
      await confierLesTicketsEcartes();
    } catch (erreur) {
      if (!arrete()) avertir(`brigade : le superviseur a buté — ${message(erreur)}`);
    } finally {
      enCours = false;
    }
  };

  return { passer };
}
