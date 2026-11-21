// La relance d'un ticket mis de côté pour une raison qu'un cook sait réparer
// (épique #2745, ticket #2750). Un ticket que la station sort de la cuisine
// (`served-elsewhere`) attendait qu'un humain le relance, même quand rien ne
// demandait un humain : #2707 et #2709 sont restés une heure de côté, le rail
// vide. Ici, la cuisine le relance seule — le label `served-elsewhere` tombe,
// `fire` reste — et dit sur l'issue ce que le cook doit réparer :
// - la PR en conflit avec la base : la rebaser sur la base ;
// - un check rouge sur la tête de la PR : le check, par son nom ;
// - une relecture qui demande des changements sur cette tête : ses points bloquants ;
// - un cook qui s'est arrêté sans livrer : pourquoi il s'est arrêté.
//
// Rien d'autre ne se relance : une carte qui attend le chef (`chef-todo` — une
// question produit ou de design), une attente posée (`waiting`), un ticket mis
// de côté à son dernier renvoi — ses renvois épuisés (#3961) —, ou une mise de
// côté dont la raison ne se lit pas. Un humain décide.
//
// Le même ticket ne boucle pas : après `RELANCES_MAX` relances pour la même
// raison, la suivante n'a pas lieu, et le ticket reste de côté. Aucun ticket
// n'est ouvert sur lui : jamais un ticket sur un ticket (#3945).
//
// Rien n'est tenu ici : le compte des relances se relit des commentaires de
// l'issue, à chaque appel. Aucune valeur n'est
// propre à un projet : la base vient de la PR ou de l'appelant.
import { DE_CONFIANCE } from "../alimenter.ts";
import { CHEF_TODO } from "../github-seul/carte-todo/carte-todo.ts";
import { LABEL_WAITING } from "../github-etat/etats.ts";
import { dernierVerdict, type CommentaireDeVerdict, type PRAFusionner } from "../github-etat/fusion.ts";
import type { Check } from "../events/pass.ts";
import { ECHECS_ATTEINTS, estMisDeCote, HORS_CUISINE, LABEL, type PR } from "../github.ts";
import { estUnRenvoiPourConflit, MARQUE_D_ECHEC, MARQUE_DE_RENVOI } from "../qualite-github.ts";

// Combien de fois la cuisine relance un ticket pour la même raison.
export const RELANCES_MAX = 2;

export type Cause = "conflict" | "red-check" | "review" | "cook-stopped";

const MARQUE_DE_RELANCE = /^<!-- brigade:relance cause=([a-z-]+) n=(\d+) -->/;
export const marqueDeRelance = (cause: Cause, n: number) => `<!-- brigade:relance cause=${cause} n=${n} -->`;

// Le ticket mis de côté, tel que la station le lit.
export type TicketDeCote = { number: number; title: string; labels: readonly string[] };

// Ce que la relance demande au client GitHub de la station, et rien de plus.
export type GitHubDeLaGuerison = {
  // Les commentaires d'une issue ou d'une PR, du plus ancien au plus récent.
  commentaires(numero: number): Promise<CommentaireDeVerdict[]>;
  commenter(numero: number, corps: string): Promise<void>;
  labelliser(numero: number, labels: string[]): Promise<void>;
  delabelliser(numero: number, label: string): Promise<void>;
  // La PR qui livre le ticket, ou null.
  prDuTicket(issue: number): Promise<(PRAFusionner & Partial<Pick<PR, "base">>) | null>;
  // Les checks de la CI sur le commit `sha`.
  ci(sha: string): Promise<Pick<Check, "outcome" | "name">[]>;
};

export type ContexteDeLaGuerison = {
  github: GitHubDeLaGuerison;
  // La station qui relance, telle que ses commentaires la nomment.
  station: string;
  // La branche d'intégration du projet, quand la PR ne la dit pas.
  base: string;
};

// La raison réparable d'une mise de côté, et ce que le cook doit en faire.
export type Diagnostic = { cause: Cause; consigne: string };

export type Guerison =
  | { fait: "relance"; cause: Cause; n: number }
  | { fait: "rien"; pourquoi: string };

const DIT: Record<Cause, string> = {
  conflict: "its PR conflicts with the base",
  "red-check": "a check is red on its PR",
  review: "the review has blocking points",
  "cook-stopped": "the cook stopped without a delivery",
};

const deLaCuisine = (commentaires: CommentaireDeVerdict[]) => commentaires.filter((c) => DE_CONFIANCE.includes(c.association));

// Les points bloquants d'un verdict : ses puces, ou son texte entier s'il n'en a pas.
function pointsBloquants(motif: string): string[] {
  const puces = motif
    .split("\n")
    .map((ligne) => /^\s*(?:[-*+]|\d+[.)])\s+(.*\S)\s*$/.exec(ligne)?.[1])
    .filter((point): point is string => point !== undefined);
  return puces.length > 0 ? puces : motif.trim() === "" ? ["see the review on the PR"] : [motif.trim()];
}

// Le dernier commentaire de la station sur le ticket, hors des relances de la
// guérison : ce qui l'a mis de côté.
async function dernierDeLaStation(ticket: TicketDeCote, { github }: ContexteDeLaGuerison) {
  return deLaCuisine(await github.commentaires(ticket.number))
    .filter((c) => c.body.startsWith("<!-- brigade:") && !MARQUE_DE_RELANCE.test(c.body))
    .at(-1);
}

// Pourquoi le ticket est de côté, s'il s'agit d'une raison qu'un cook répare :
// d'abord l'état de sa PR (conflit, check rouge, relecture), puis le dernier
// commentaire de la station (un cook arrêté). Null sinon.
export async function diagnostiquer(ticket: TicketDeCote, contexte: ContexteDeLaGuerison): Promise<Diagnostic | null> {
  const { github } = contexte;
  const pr = await github.prDuTicket(ticket.number);
  if (pr !== null && pr.state === "open" && !pr.merged) {
    const base = pr.base ?? contexte.base;
    if (pr.enConflit === true) {
      return { cause: "conflict", consigne: `PR #${pr.number} conflicts with \`${base}\`: rebase the branch on \`${base}\`, resolve the conflicts, and push.` };
    }
    const rouges = (await github.ci(pr.sha)).filter((check) => check.outcome === "red").map((check) => check.name);
    if (rouges.length > 0) {
      return { cause: "red-check", consigne: `PR #${pr.number} has ${rouges.length === 1 ? "a red check" : "red checks"} on \`${pr.sha.slice(0, 7)}\`: make ${rouges.map((nom) => `\`${nom}\``).join(", ")} green.` };
    }
    const commentairesDeLaPR = await github.commentaires(pr.number);
    const verdict = dernierVerdict(commentairesDeLaPR);
    if (verdict !== null && verdict.verdict === "request-changes" && verdict.sha === pr.sha) {
      const corps = commentairesDeLaPR.find((c) => c.id === verdict.commentaire)?.body ?? "";
      const points = pointsBloquants(corps.split("\n").slice(2).join("\n"));
      return { cause: "review", consigne: `The review of PR #${pr.number} on \`${pr.sha.slice(0, 7)}\` has blocking points; fix each of them:\n${points.map((point) => `- ${point}`).join("\n")}` };
    }
  }
  const dernier = await dernierDeLaStation(ticket, contexte);
  if (dernier?.body.startsWith(MARQUE_D_ECHEC)) {
    const motif = / — ([^\n]*)/.exec(dernier.body)?.[1] ?? "no reason given";
    return { cause: "cook-stopped", consigne: `The last cook stopped without a delivery — ${motif}. Pick the ticket up again and deliver it.` };
  }
  return null;
}

// Relance le ticket mis de côté si sa raison est réparable par un cook, au
// plus `RELANCES_MAX` fois pour la même raison. Rend ce qui a été fait.
export async function relancer(ticket: TicketDeCote, contexte: ContexteDeLaGuerison): Promise<Guerison> {
  const { github, station } = contexte;
  if (!estMisDeCote(ticket.labels)) return { fait: "rien", pourquoi: "not set aside" };
  if (ticket.labels.includes(CHEF_TODO)) return { fait: "rien", pourquoi: "a card awaits the chef: a product or design decision" };
  if (ticket.labels.includes(LABEL_WAITING)) return { fait: "rien", pourquoi: "it waits for something on purpose (`waiting`)" };
  // Mis de côté à son dernier renvoi, ses renvois épuisés : il est allé au
  // superviseur, et la cuisine ne le rend jamais seule à un cook (#3961) —
  // #3955 a bouclé ainsi, relancé après chaque mise de côté.
  const dernier = await dernierDeLaStation(ticket, contexte);
  if (dernier !== undefined && dernier.body.startsWith(MARQUE_DE_RENVOI) && !estUnRenvoiPourConflit(dernier.body)) return { fait: "rien", pourquoi: "its sends back are spent: the supervisor decides, never a cook again" };
  const diagnostic = await diagnostiquer(ticket, contexte);
  if (diagnostic === null) return { fait: "rien", pourquoi: "no reason a cook can fix: a human decides" };
  const { cause, consigne } = diagnostic;
  const relances = deLaCuisine(await github.commentaires(ticket.number)).filter((c) => MARQUE_DE_RELANCE.exec(c.body)?.[1] === cause);
  if (relances.length >= RELANCES_MAX) return { fait: "rien", pourquoi: `${DIT[cause]} again after ${relances.length} relaunches for this reason: it stays set aside` };
  const n = relances.length + 1;
  // Le commentaire avant le label : relancé sans lui, le cook ne saurait pas quoi réparer.
  await github.commenter(ticket.number, `${marqueDeRelance(cause, n)}\nStation \`${station}\`: put back on the rail (relaunch ${n}/${RELANCES_MAX}) — ${DIT[cause]}, which a cook can fix.\n\n**What the cook must fix:** ${consigne}`);
  if (!ticket.labels.includes(LABEL)) await github.labelliser(ticket.number, [LABEL]);
  for (const label of [HORS_CUISINE, ECHECS_ATTEINTS]) if (ticket.labels.includes(label)) await github.delabelliser(ticket.number, label);
  return { fait: "relance", cause, n };
}
