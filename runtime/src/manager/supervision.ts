// Le superviseur du projet (spec 2026-11-20-kitchen-spinning, étape 4, #3911) : le manager du projet, devant deux
// choses que la cuisine ne referme pas seule.
//
// - Le disjoncteur ouvert. Le chef ne le referme plus : le superviseur rejoue le contrôle qui l'a ouvert — un run, qui
//   finit bien ou non — et ne le referme que si ce run finit bien. Tant que le contrôle échoue, le disjoncteur reste
//   ouvert, et le contrôle est rejoué plus tard. Fermé, il le dit sur chaque ticket que la cause touchait.
// - Un ticket que la station a parqué par ses échecs (#4129 : `parked`, sa marque dit `failures` et qu'il attend le
//   superviseur). Il attend le superviseur : celui-ci reçoit son dossier et répond par UN geste de la liste fermée
//   ci-dessous — les gestes de l'étape 4 de la spec. Sa réponse illisible, ou hors de la liste, ne fait rien : le dossier
//   est redonné plus tard, trois fois au plus. Un ticket parqué pour quelqu'un d'autre n'est jamais confié.
//
// Rien n'est tenu ici qu'un cache : l'état se relit du journal et de GitHub à chaque passe. Un geste qui réussit dit
// au ticket qui il attend désormais, ou le déparque : il n'est plus confié.
import type { Base } from "../base.ts";
import { calageDuDisjoncteur, direLeCalage } from "../breaker/calage.ts";
import { projetEteint } from "../projections/switch.ts";
import { attenteDeLIssue, corpsDuParking, type AttenteGitHub } from "../attente-github/marque.ts";
import { carteQuestionProduit, poserCarte } from "../github-seul/carte-todo/carte-todo.ts";
import { RELANCE_PAR_DEFAUT_MS } from "../attente.ts";
import { CHEF_TODO, LABEL_PARKED } from "../github-etat/etats.ts";
import type { Evenement } from "../evenements.ts";
import type { FaitGardeFous } from "../events/guardrails.ts";
import { LABEL, type GitHub, type Issue } from "../github.ts";
import type { Journal } from "../journal.ts";
import { couper, COMMENTAIRES_MAX, CORPS_MAX } from "../juger.ts";
import { echecsDuDisjoncteur, etatDesGardeFous } from "../projections/guardrails.ts";
import type { Reponse } from "../decoupage.ts";

// Les gestes que le superviseur peut faire sur un ticket parqué pour lui : ceux de l'étape 4 de la spec que ce ticket sait
// appliquer, et aucun autre. `rail` : le déparquer sur le rail, avec une note ; `park` : le laisser parqué, pour un
// tiers nommé ; `close` : fermer un doublon ou une alerte périmée ; `todo` : le parquer pour le chef — sa carte de TODO —,
// pour une question de produit ou de design seulement.
const GESTES = ["rail", "park", "close", "todo"] as const;
type Geste = (typeof GESTES)[number];

// Un contrôle de disjoncteur rejoué au plus toutes les 10 minutes.
const CONTROLE_TOUS_LES_MS = 10 * 60_000;
// Un contrôle qui n'a lancé aucun run (lancement refusé, arrêt) n'a rien dit : il se rejoue au réveil suivant, après une demi-seconde.
const CONTROLE_SANS_RUN_MS = 500;
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

// Le ticket attend-il le superviseur ? La station l'a parqué par ses échecs, et personne ne l'a parqué depuis pour un autre.
const pourLeSuperviseur = (attente: AttenteGitHub | null): boolean => attente !== null && attente.failures === true && attente.who === "the supervisor";

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
  if (gesture === "park" && (typeof tiers !== "string" || tiers.trim() === "")) return { illisible: "`park` names no third party in `third_party`" };
  if (gesture === "todo" && (typeof question !== "string" || question.trim() === "")) return { illisible: "`todo` asks no question in `question`" };
  return { valeur: { geste: gesture as Geste, note: note.trim(), ...(typeof tiers === "string" ? { tiers: tiers.trim() } : {}), ...(typeof question === "string" ? { question: question.trim() } : {}) } };
}

const CONSIGNE_DU_CONTROLE = "This is a health check of the kitchen's `claude` run. Answer with the single word OK and nothing else.";

function consigneDuDossier(ticket: Issue, corps: string, commentaires: readonly string[], faits: readonly string[]): string {
  return [
    "You are the supervisor of a software kitchen. A ticket was parked by its failure count (`parked`, waiting for the supervisor): its cooks stopped without a delivery too many times, and nothing takes it before you answer. Read its dossier and choose ONE gesture.",
    "",
    "The only gestures you may make:",
    '- "rail": unpark the ticket onto the rail, with a note for the next cook saying what to change;',
    '- "park": keep the ticket parked, waiting for a named third party (`third_party`) — only when what it waits for is outside the kitchen;',
    '- "close": close the ticket, when it is a duplicate or a stale alert;',
    '- "todo": post a TODO card for the chef, only for a product or design question (`question`).',
    "You never ask the chef for a technical gesture (a rerun, a merge, a rebase, a log reading).",
    "",
    'Answer with one JSON object and nothing else: {"gesture": "rail" | "park" | "close" | "todo", "note": "what you saw and why", "third_party": "...", "question": "..."} — `third_party` only for "park", `question` only for "todo".',
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
  let controle: { ouvertLe: string; jusqua: number } | null = null;
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

  // Les runs de contrôle que le journal a vu partir.
  const runsDuControle = () => journal.tout().filter((fait) => fait.type === "cook.launched" && String((fait.payload as { run?: unknown }).run).startsWith("controle-")).length;

  const controlerLeDisjoncteur = async () => {
    const ouvertLe = etatDesGardeFous(base).breakerOpenedAt;
    if (ouvertLe === null) {
      controle = null;
      return;
    }
    if (controle !== null && controle.ouvertLe === ouvertLe && maintenant().getTime() < controle.jusqua) return;
    controle = { ouvertLe, jusqua: maintenant().getTime() + CONTROLE_TOUS_LES_MS };
    const lancesAvant = runsDuControle();
    const { tickets, gone } = causeDuDisjoncteur();
    const reponse = await demander({ numero: 0, prefixe: "controle", nom: "breaker check" }, CONSIGNE_DU_CONTROLE, () => ({ valeur: "ok" }), undefined, "ok");
    if (reponse === null && runsDuControle() === lancesAvant && !arrete()) {
      controle = { ouvertLe, jusqua: maintenant().getTime() + CONTROLE_SANS_RUN_MS };
      // Le réveil suivant peut être à une minute (le tick) : le contrôle se rejoue de lui-même, sans attendre.
      setTimeout(() => void passer(), CONTROLE_SANS_RUN_MS + 50).unref();
    }
    if (reponse === null || "illisible" in reponse || arrete()) return;
    // Le contrôle a passé. Un disjoncteur que le run a refermé seul (un calage) l'est déjà ; sinon c'est ici.
    const etat = etatDesGardeFous(base);
    const dejaFerme = etat.breakerOpenedAt === null;
    if (!dejaFerme) {
      const fait: FaitGardeFous = { type: "breaker.lifted", payload: { failures: etat.failures, threshold: etat.breakerThreshold ?? 0, after: reponse.run } };
      journal.ajouter({ project: projet, ticket: null, author: "runtime", ...fait });
    }
    controle = null;
    if (tickets.length === 0) avertir(`brigade : superviseur — disjoncteur fermé, cause disparue : ${gone} (aucun ticket à commenter)`);
    for (const ticket of tickets) {
      try {
        await github.commenter(ticket, `${MARQUE_DU_SUPERVISEUR}\n**Supervisor — the breaker is closed.** Cause gone: ${gone}. The kitchen launches cooks again.`);
      } catch (erreur) {
        if (!arrete()) avertir(`brigade : superviseur — la fermeture du disjoncteur n'a pas pu se dire sur #${ticket} — ${message(erreur)}`);
      }
    }
  };

  const confierUnTicket = async (ticket: Issue) => {
    const lus = await github.commentaires(ticket.number);
    // Parqué pour quelqu'un d'autre que le superviseur, il n'est pas à lui : il attend cette personne, ou sa date.
    if (!pourLeSuperviseur(attenteDeLIssue(lus))) {
      confies.set(ticket.number, { essais: confies.get(ticket.number)?.essais ?? 0, a: maintenant().getTime() });
      return;
    }
    const corps = (await github.issue(ticket.number))?.body ?? "";
    const commentaires = lus.slice(-8).map((c) => `${c.author} (${c.createdAt}):\n${c.body}`);
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

  // Le geste, puis la trace : ce que le superviseur a vu et ce qu'il a fait. Parqué pour un tiers, la marque ouvre ce
  // commentaire ; pour le chef, sa carte le suit : le ticket attend désormais cette personne, et le superviseur ne le
  // reprend plus. Remis sur le rail ou fermé, `parked` tombe en dernier : un geste interrompu se rejoue.
  const appliquer = async (ticket: Issue, { geste, note, tiers, question }: Decision) => {
    const n = ticket.number;
    const trace = (fait: string) => `${MARQUE_DU_SUPERVISEUR}\n**Supervisor** — the ticket was parked by its failure count, waiting for the supervisor.\n\n**Saw:** ${note}\n\n**Did:** ${fait}`;
    const parquer = async (attente: AttenteGitHub, fait: string) => github.commenter(n, `${corpsDuParking(attente)}\n\n${trace(fait)}`);
    switch (geste) {
      case "rail":
        await github.commenter(n, trace("unparked it onto the rail."));
        if (!ticket.labels.includes(LABEL)) await github.labelliser(n, [LABEL]);
        await github.delabelliser(n, LABEL_PARKED);
        break;
      case "park":
        await parquer({ what: note, who: tiers ?? "a third party", followUp: new Date(maintenant().getTime() + RELANCE_PAR_DEFAUT_MS).toISOString() }, `kept it parked, waiting for ${tiers}.`);
        break;
      case "close":
        await github.commenter(n, trace("closed it, a duplicate or a stale alert."));
        await github.fermerIssue(n);
        await github.delabelliser(n, LABEL_PARKED);
        break;
      case "todo":
        // La carte parque le ticket pour le chef (`chef-todo`) : il n'attend plus le superviseur (`parked` tombe), et la
        // réponse du chef, dans l'app, le fait reprendre.
        await github.commenter(n, trace("parked it for the chef: a product or design question, a card in the chef's TODO."));
        await poserCarte(n, carteQuestionProduit(n, question ?? note), github);
        await github.delabelliser(n, LABEL_PARKED);
        break;
    }
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
    // Les tickets parqués, hors de ceux du chef : la marque de chacun dit s'il attend le superviseur (`confierUnTicket`).
    for (const ticket of confirmees.filter((issue) => issue.labels.includes(LABEL_PARKED) && !issue.labels.includes(CHEF_TODO))) {
      const deja = confies.get(ticket.number);
      if (deja && (deja.essais >= DOSSIER_ESSAIS_MAX || maintenant().getTime() - deja.a < DOSSIER_TOUS_LES_MS)) continue;
      if (arrete() || projetEteint(base)) return;
      try {
        await confierUnTicket(ticket);
      } catch (erreur) {
        // Un geste qui a manqué se rejoue à la passe suivante : le ticket attend le superviseur tant qu'il n'a pas réussi.
        if (!arrete()) avertir(`brigade : superviseur — #${ticket.number} non traité — ${message(erreur)}`);
        confies.set(ticket.number, { essais: (deja?.essais ?? 0) + 1, a: maintenant().getTime() });
      }
    }
  };

  // Une passe à la fois : un réveil qui arrive pendant l'une est repris au suivant.
  const passer = async () => {
    if (enCours || arrete()) return;
    enCours = true;
    try {
      if (projetEteint(base)) return;
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
