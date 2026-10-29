// Une remontée technique va à la cuisine, jamais dans TODO (#1826). La file du
// chef ne tient qu'un choix de produit ou un geste que lui seul peut faire : une
// livraison restée rouge (`still-red`) ou que la pass n'a pas pu juger
// (`unjudged` : CI muette, relecture illisible, worktree perdu…) n'est ni l'un
// ni l'autre. La pass la reprend, au réveil qui suit la remontée :
//
// - **renvoi** : non jugée, la livraison repart une fois chez un cook, sur sa
//   branche, avec ce qui a empêché le jugement — sans consommer de renvoi ;
//   sauf une cause que le cook ne lève pas (`SANS_RENVOI`) ;
// - **ticket `fix`** : restée rouge, ou non jugée de nouveau, la cuisine ouvre
//   un ticket `fix` sur la cause, et le ticket attend sur le rail, 86, que ce
//   `fix` soit servi — il repart alors chez un cook, sur sa livraison
//   (**reprise**) ;
// - **montée** : renvoyé et `fix` déjà tentés — ou le ticket est lui-même une
//   correction de la cuisine —, il n'est jamais laissé de côté (#1861) : la
//   cuisine monte son calibrage d'un cran, dans la limite du plafond du projet
//   et jamais au-delà de `high`, puis il repart chez un cook dès que le rail a
//   lu ce calibrage (**reprise**) ;
// - **réessai** (#1902) : avant d'abandonner, la cuisine le renvoie une fois de
//   plus chez un cook, depuis la base du moment, si au moins un merge a
//   atterri sur la base depuis son dernier verdict rouge — ce qui l'a fait
//   échouer a pu changer ;
// - **abandon** : rien ne peut plus monter, ou la cause n'est pas au cook
//   (`SANS_RENVOI`) : la cuisine le retire du rail — son label `fire` s'en va,
//   son issue reste ouverte — et dit pourquoi sur l'issue. Les tickets qui
//   l'attendent sortent du rail avec lui (`abandon-en-chaine.ts`).
//
// À chaque pas, le ticket reste sur le rail, et sa carte dit ce que fait la
// cuisine (`direReprise`) : rien n'en entre dans TODO. Seules restent au chef
// les remontées que `CAUSES_DU_CHEF` nomme, chacune avec sa raison.
//
// Rien n'est tenu ici : tout se relit du journal (`pass.kitchen-took-over`).
import type { Base } from "./base.ts";
import { EFFORTS, type Calibrage } from "./calibrage.ts";
import { cartesEnTodo } from "./carte-todo.ts";
import { DU_MANAGER, ENCORE_ROUGE, HORS_RAIL, motifDeRemontee, NON_JUGEE, REDECOUPE } from "./events/pass.ts";
import { LABEL } from "./github.ts";
import { RENOMMAGE_ABANDONNE } from "./pause/pause.ts";
import { reactionDe } from "./projections/reactions.ts";
import { monter, type Plafond } from "./reagir.ts";
import { CALIBRAGE_TEST_INSTABLE, PRIO_TEST_INSTABLE } from "./test-instable.ts";

// Les causes de remontée qui restent au chef, et pourquoi chacune est un choix
// de produit ou un geste que lui seul peut faire. Toute autre cause d'un
// `still-red` ou d'un `unjudged` va à la cuisine — une cause nouvelle aussi,
// tant qu'elle n'est pas nommée ici.
export const CAUSES_DU_CHEF: Readonly<Record<string, string>> = {
  "secrets-unavailable": "chef-only gesture: the secret values live on the machine, in the file `BRIGADE_SECRETS_FILE` names — no cook may see or set them",
  [`${DU_MANAGER} + card`]: "product choice: the manager escalated with a product or gesture card, the question the chef answers — the bare escalation is not listed while the card is in TODO",
};

// Les remontées qui ne font jamais d'entrée dans TODO, quoi qu'elles soient :
// hors du rail, redécoupée, renommage abandonné (son ticket reste en pass, et
// la carte de l'échec du renommage parle pour lui).
export const REMONTEES_SANS_ENTREE: Readonly<Record<string, string>> = {
  [HORS_RAIL]: "an off-rail PR (a closing pass): no ticket, so no entry",
  [REDECOUPE]: "the manager split the ticket: its sub-tickets carry the work",
  [RENOMMAGE_ABANDONNE]: "an abandoned code rename: the ticket stays in pass, and the rename's own failure line speaks for it",
};

// Les causes que la cuisine reprend, telles que le runtime les écrit — la
// liste qu'un test confronte au code. Une cause qui n'y est pas y va aussi.
export const CAUSES_DE_LA_CUISINE: Readonly<Record<string, string>> = {
  "returns-exhausted": "red after its send-backs, the manager off",
  [DU_MANAGER]: "red after its send-backs, the manager escalated it with no card: nothing for the chef to choose",
  "wrong-base": "its PR does not target the integration branch",
  "no-gates": "no gates once merged with the base",
  "worktree-lost": "the station's clone lost its branch, or the merge failed without a conflict",
  "ci-silent": "the CI did not conclude",
  "review-unreadable": "the reviewer's answer could not be read",
  "review-unsendable": "the reviewer's instructions do not fit in a command",
  "review-refused": "the model refused to review it",
  "rename-conflict": "it does not carry onto the tree of a merged code rename",
  "unstable-test": "red twice on a test it does not touch (a log from before #1820)",
};

// Ce que la cuisine a fait d'une remontée. `return` : renvoyée à un cook ;
// `fix` : un ticket `fix` ouvert, le ticket 86 l'attend ; `raise` : son
// calibrage monté d'un cran, le ticket 86 attend que le rail le lise ;
// `resume` : ce `fix` servi, ou ce calibrage lu, renvoyée à un cook ; `retry` :
// sur le point d'être abandonnée, renvoyée une fois de plus à un cook, la base
// ayant bougé depuis son dernier rouge ; `drop` : retiré du rail, avec sa
// raison. `none` ne s'écrit plus : d'un journal d'avant #1861, il n'est pas
// final — la cuisine reprend la remontée où il l'a laissée.
export type Coup = "return" | "fix" | "resume" | "raise" | "retry" | "drop" | "none";

export type Remontee = { seq: number; reason: string; cause: string | null; why: string | null };

// La dernière remontée du ticket, telle que la pass l'a écrite.
export function derniereRemontee(base: Base, ticket: number): Remontee | null {
  const [ligne] = base.lire<{ seq: number; payload: string }>("SELECT seq, payload FROM events WHERE ticket = ? AND type = 'pass.escalated' ORDER BY seq DESC LIMIT 1", ticket);
  if (ligne === undefined) return null;
  const payload = JSON.parse(ligne.payload) as { reason?: unknown; cause?: unknown; why?: unknown };
  const { reason, cause } = motifDeRemontee(payload);
  return { seq: ligne.seq, reason, cause, why: typeof payload.why === "string" && payload.why !== "" ? payload.why : null };
}

// La remontée va-t-elle à la cuisine ? `still-red` et `unjudged`, sauf les
// causes du chef ; le reste — redécoupée, motif inconnu — n'y va pas.
export function aLaCuisine(base: Base, ticket: number, reason: string, cause: string | null): boolean {
  if (reason !== ENCORE_ROUGE && reason !== NON_JUGEE) return false;
  if (cause === HORS_RAIL || cause === RENOMMAGE_ABANDONNE) return false;
  if (cause !== null && Object.hasOwn(CAUSES_DU_CHEF, cause)) return false;
  // Le manager qui remonte avec une carte pose une question au chef : la carte
  // proposée, ou entrée dans TODO.
  if (cause === DU_MANAGER && (reactionDe(base, ticket)?.card != null || cartesEnTodo(base).some((carte) => carte.ticket === ticket))) return false;
  return true;
}

// `from`, `to` : le calibrage d'une montée (`raise`) ; `reason` : celle d'un
// abandon (`drop`) ; `merges` : ceux qui ont atterri sur la base depuis le
// dernier rouge, pour un réessai (`retry`).
export type Reprise = { cause: string; coup: Coup; issue: number | null; from: Calibrage | null; to: Calibrage | null; reason: string | null; merges: number | null; seq: number; at: string };

const calibrageLu = (valeur: unknown): Calibrage | null => {
  const lu = valeur as { model?: unknown; effort?: unknown } | null | undefined;
  return typeof lu?.model === "string" && typeof lu.effort === "string" ? { model: lu.model, effort: lu.effort } : null;
};

const lirePrises = (base: Base, ticket: number): Reprise[] =>
  base
    .lire<{ seq: number; at: string; payload: string }>("SELECT seq, at, payload FROM events WHERE ticket = ? AND type = 'pass.kitchen-took-over' ORDER BY seq", ticket)
    .map(({ seq, at, payload }) => {
      const lu = JSON.parse(payload) as { cause?: unknown; move?: unknown; issue?: unknown; from?: unknown; to?: unknown; reason?: unknown; merges?: unknown };
      return {
        cause: typeof lu.cause === "string" ? lu.cause : "",
        coup: lu.move as Coup,
        issue: typeof lu.issue === "number" ? lu.issue : null,
        from: calibrageLu(lu.from),
        to: calibrageLu(lu.to),
        reason: typeof lu.reason === "string" && lu.reason !== "" ? lu.reason : null,
        merges: typeof lu.merges === "number" ? lu.merges : null,
        seq,
        at,
      };
    });

// Ce que la cuisine a fait de la remontée en cours du ticket : son dernier pas
// depuis elle, ou null s'il n'y en a aucun encore. Un `none` d'avant #1861
// n'en est pas un : la remontée attend encore son pas.
export function repriseDeLaRemontee(base: Base, ticket: number, remontee: Remontee): Reprise | null {
  const prise = lirePrises(base, ticket).findLast(({ seq }) => seq > remontee.seq) ?? null;
  return prise?.coup === "none" ? null : prise;
}

// Les causes d'un `unjudged` qu'un renvoi ne lèverait pas : le cook n'y peut
// rien — la base de la PR, les gates du projet, une consigne de relecture trop
// lourde ne sont pas à lui, et lui faire écrire ses propres gates serait pire.
// Elles vont droit au ticket `fix`.
export const SANS_RENVOI: Readonly<Record<string, string>> = {
  "wrong-base": "the station opens the PR, not the cook",
  "no-gates": "the gates are the project's judge: a cook must not write its own",
  "review-unsendable": "the reviewer's instructions are the runtime's, not the delivery's",
};

// Le pas suivant de la cuisine sur une remontée qu'elle n'a pas encore prise,
// d'après ce qu'elle a déjà tenté sur ce ticket. `fixPermis` : faux pour un
// ticket qui est lui-même la correction de la cuisine ou la réparation de la
// base — un `fix` de plus ne partirait pas, ou n'en finirait pas. `peutMonter` :
// son calibrage a un cran au-dessus (`calibrageAuDessus`). Il n'y a jamais
// « rien de plus » : ce qui ne peut ni repartir ni monter est abandonné.
export function prochainCoup(remontee: { reason: string; cause: string | null }, deja: { renvoye: boolean; fixe: boolean }, fixPermis: boolean, peutMonter: boolean): Exclude<Coup, "resume" | "none"> {
  const { reason, cause } = remontee;
  const pasAuCook = cause !== null && Object.hasOwn(SANS_RENVOI, cause);
  if (reason === NON_JUGEE && !deja.renvoye && !deja.fixe && !pasAuCook) return "return";
  if (!deja.fixe && fixPermis) return "fix";
  // Un cook mieux calibré ne lèverait pas plus une cause qui n'est pas la sienne.
  if (peutMonter && !pasAuCook) return "raise";
  return "drop";
}

// L'effort le plus haut que la cuisine pose : `xhigh` et `max` coûtent trop
// cher pour être posés sans le chef, comme au manager (`juger.ts`).
export const EFFORT_MAX_DE_LA_CUISINE = "high";
const rangDEffort = (effort: string) => EFFORTS.indexOf(effort as (typeof EFFORTS)[number]);

// Le calibrage un cran au-dessus de celui du ticket — l'effort d'abord, puis le
// modèle (`monter`) —, dans la limite du plafond du projet et jamais au-delà de
// `high`. Null : rien ne peut monter.
export function calibrageAuDessus(pose: Calibrage, plafond: Plafond): Calibrage | null {
  const effort = rangDEffort(plafond.effort) > rangDEffort(EFFORT_MAX_DE_LA_CUISINE) ? EFFORT_MAX_DE_LA_CUISINE : plafond.effort;
  const cible = monter(pose, { model: plafond.model, effort }, { model: true, effort: true });
  // Un effort que le chef a posé au-dessus de `high` ne se garde pas en montant le modèle.
  return cible === null || rangDEffort(cible.effort) > rangDEffort(EFFORT_MAX_DE_LA_CUISINE) ? null : cible;
}

// Pourquoi la cuisine abandonne un ticket, telle que son issue le lit.
export function raisonDAbandon(cause: string, pose: Calibrage | null, plafond: Plafond): string {
  const pasAuCook = SANS_RENVOI[cause];
  if (pasAuCook !== undefined) return `sa cause (\`${cause}\`) n'est pas au cook (${pasAuCook}) : ni un renvoi ni un calibrage plus haut ne la lèveraient, et le ticket \`fix\` que la cuisine pouvait ouvrir sur elle l'a été, ou ce ticket en est un`;
  const limite = `le plafond du projet (\`${plafond.model}\` / \`${plafond.effort}\`), et jamais au-delà de \`${EFFORT_MAX_DE_LA_CUISINE}\``;
  return `son calibrage (${pose === null ? "?" : `\`${pose.model}\` / \`${pose.effort}\``}) est déjà au plus haut que la cuisine pose — ${limite} —, et ce qu'elle pouvait tenter avant (renvoi, ticket \`fix\`, calibrage monté) n'a pas suffi`;
}

// Ce que la cuisine a déjà tenté sur ce ticket, toutes remontées confondues.
export function dejaTente(base: Base, ticket: number): { renvoye: boolean; fixe: boolean } {
  const prises = lirePrises(base, ticket);
  return { renvoye: prises.some(({ coup }) => coup === "return"), fixe: prises.some(({ coup }) => coup === "fix") };
}

// Le réessai unique avant l'abandon (#1902) : le nombre de merges qui ont
// atterri sur la base depuis le dernier verdict rouge du ticket, ou null s'il
// n'y a rien à réessayer — aucun verdict rouge, aucun merge depuis, ou le
// réessai déjà fait. Une fois par ticket, toutes remontées confondues, comme le
// renvoi et le `fix` : un ticket que le chef ramène sur le rail ne le rouvre
// pas. Un merge est un `merge.done`, celui d'une livraison de la pass comme
// celui fait à la main.
export function reessaiPermis(base: Base, ticket: number): number | null {
  if (lirePrises(base, ticket).some(({ coup }) => coup === "retry")) return null;
  const [rouge] = base.lire<{ seq: number }>("SELECT seq FROM events WHERE ticket = ? AND type = 'pass.judged' AND json_extract(payload, '$.verdict') = 'red' ORDER BY seq DESC LIMIT 1", ticket);
  if (rouge === undefined) return null;
  const [{ merges } = { merges: 0 }] = base.lire<{ merges: number }>("SELECT count(*) AS merges FROM events WHERE type = 'merge.done' AND seq > ?", rouge.seq);
  return merges > 0 ? merges : null;
}

// Un ticket que la cuisine a ouvert elle-même — la correction d'une remontée,
// d'un test instable, ou la réparation de la base — n'en ouvre pas d'autre.
export function fixPermis(base: Base, ticket: number): boolean {
  const [ouvert] = base.lire<{ un: number }>(
    `SELECT 1 AS un FROM events WHERE
       (type = 'pass.kitchen-took-over' AND json_extract(payload, '$.move') = 'fix' AND json_extract(payload, '$.issue') = ?)
       OR (type = 'base.repair-opened' AND ticket = ?)
       OR (type = 'pass.ci-set-aside' AND EXISTS (SELECT 1 FROM json_each(json_extract(payload, '$.fixes')) AS j WHERE json_extract(j.value, '$.issue') = ?))
     LIMIT 1`,
    ticket,
    ticket,
    ticket,
  );
  return ouvert === undefined;
}

// Le ticket 86 sur une remontée de la cuisine, et ce qu'elle en fait : nul pour
// tout autre ticket.
export type RepriseDuTicket = { cause: string; reprise: Reprise | null };
export function repriseDuTicket(base: Base, ticket: number): RepriseDuTicket | null {
  const remontee = derniereRemontee(base, ticket);
  if (remontee === null || !aLaCuisine(base, ticket, remontee.reason, remontee.cause)) return null;
  return { cause: remontee.cause ?? remontee.reason, reprise: repriseDeLaRemontee(base, ticket, remontee) };
}

// Les tickets 86 du rail sur une remontée de la cuisine.
export function reprisesDuRail(base: Base, rail: ReadonlyArray<{ ticket: number; state: string; until: string | null }>): Map<number, RepriseDuTicket> {
  return new Map(
    rail.flatMap(({ ticket, state, until }) => {
      if (state !== "86" || until !== null) return [];
      const reprise = repriseDuTicket(base, ticket);
      return reprise === null ? [] : [[ticket, reprise] as const];
    }),
  );
}

// Ce que la carte du ticket dit de la cuisine, en anglais (`status`) puis en
// français (l'app) : ce qu'elle fait, jamais un geste du chef à faire.
const dit = (calibrage: Calibrage | null) => (calibrage === null ? "?" : `${calibrage.model} / ${calibrage.effort}`);
export function direRepriseEn({ cause, reprise }: RepriseDuTicket): string {
  if (reprise === null) return `the kitchen takes it up (${cause}), not the chef`;
  if (reprise.coup === "fix") return `the kitchen took it up (${cause}): its \`fix\` ticket #${reprise.issue} is open, and it goes back to a cook once #${reprise.issue} is served`;
  if (reprise.coup === "raise") return `the kitchen raised its calibration (${cause}) from ${dit(reprise.from)} to ${dit(reprise.to)}: it goes back to a cook once the rail reads it`;
  if (reprise.coup === "retry") return `the kitchen gives it one more try from the current base (${cause}) before dropping it`;
  if (reprise.coup === "drop") return `the kitchen drops it (${cause}): it leaves the rail, the reason is on its issue`;
  return `the kitchen sent it back to a cook (${cause})`;
}
export function direReprise({ cause, reprise }: RepriseDuTicket): string {
  if (reprise === null) return `la cuisine le reprend (${cause}), pas le chef`;
  if (reprise.coup === "fix") return `la cuisine l'a repris (${cause}) : son ticket \`fix\` #${reprise.issue} est ouvert, il repart chez un cook une fois #${reprise.issue} servi`;
  if (reprise.coup === "raise") return `la cuisine a monté son calibrage (${cause}) de ${dit(reprise.from)} à ${dit(reprise.to)} : il repart chez un cook dès que le rail l'a lu`;
  if (reprise.coup === "retry") return `la cuisine lui donne un essai de plus depuis la base du moment (${cause}) avant de l'abandonner`;
  if (reprise.coup === "drop") return `la cuisine l'abandonne (${cause}) : il sort du rail, la raison est sur son issue`;
  return `la cuisine l'a renvoyé à un cook (${cause})`;
}

// Le ticket `fix` d'une remontée : son calibrage, ses labels, sa marque.
export const LABELS_DU_FIX = [LABEL, "fix", PRIO_TEST_INSTABLE, `model:${CALIBRAGE_TEST_INSTABLE.model}`, `effort:${CALIBRAGE_TEST_INSTABLE.effort}`];
const MARQUE = /^\s*<!--\s*brigade:remontee (\d+)\s*-->\s*$/m;
export const marqueDeRemontee = (ticket: number) => `<!-- brigade:remontee ${ticket} -->`;
export function ticketDeLaMarque(corps: string): number | null {
  const lu = MARQUE.exec(corps)?.[1];
  return lu === undefined ? null : Number(lu);
}

export type FixDeRemontee = {
  ticket: number;
  titre: string;
  reason: string;
  cause: string;
  // Ce que la pass en a dit, ou les constats du dernier rouge.
  why: string | null;
  findings: string[];
  pr: string | null;
  branch: string | null;
};

const ROUGE = (reason: string) => reason === ENCORE_ROUGE;

export function titreDuFix({ ticket, reason, cause }: FixDeRemontee): string {
  return ROUGE(reason) ? `Find why the delivery of #${ticket} stays red (${cause})` : `Find why the pass could not judge the delivery of #${ticket} (${cause})`;
}

export function corpsDuFix(fix: FixDeRemontee): string {
  const { ticket, titre, reason, cause, why, findings, pr, branch } = fix;
  const livraison = [pr, branch === null ? null : `branch \`${branch}\``].filter((morceau) => morceau !== null).join(", ");
  const vu = [...(why === null ? [] : [why]), ...findings].flatMap((texte) => [...texte.split("\n").map((ligne) => `> ${ligne}`), ""]);
  return [
    marqueDeRemontee(ticket),
    "",
    "## Context",
    "",
    `The delivery of #${ticket} (${titre}${livraison === "" ? "" : ` — ${livraison}`}) ${ROUGE(reason) ? "stays red after its send-backs" : "could not be judged by the pass"} (\`${reason}\`: \`${cause}\`). That is not a product choice: the kitchen keeps it instead of putting it in the chef's TODO. #${ticket} stays set aside on the rail; once this ticket is served, it goes back to a cook on its delivery.`,
    "",
    "## What the pass saw",
    "",
    ...(vu.length === 0 ? ["Nothing more than the cause: read the pass's comments on the issue.", ""] : vu),
    "## Acceptance criteria",
    "",
    "- The cause is found where it lives — the base, a test, the CI, the tooling, the runtime — and fixed there; or, if it cannot be, this issue says why.",
    `- #${ticket}'s own work is not done here: its delivery takes it up once this ticket is served.`,
    "",
    "---",
    "",
    `_Opened by the pass, with no gesture from the chef. Calibrated \`${CALIBRAGE_TEST_INSTABLE.model}\` / \`${CALIBRAGE_TEST_INSTABLE.effort}\`, \`${PRIO_TEST_INSTABLE}\`._`,
  ].join("\n");
}

// Ce qui repart au cook : pourquoi la cuisine le lui renvoie, en français
// comme tout ce qui va au cook. `montee` : le calibrage que la cuisine a
// monté, quand c'est lui que le renvoi suit. `merges` : ceux qui ont atterri
// sur la base depuis le dernier rouge, quand c'est un réessai.
export function constatsDuRenvoi(
  remontee: Remontee,
  coup: "return" | "resume" | "retry",
  issue: number | null,
  constats: string[],
  montee: { from: Calibrage; to: Calibrage } | null = null,
  merges: number | null = null,
): string[] {
  const cause = remontee.cause ?? remontee.reason;
  if (coup === "retry") {
    return [
      `Cette livraison est restée bloquée (\`${remontee.reason}\` : \`${cause}\`) après tout ce que la cuisine pouvait tenter, et elle allait l'abandonner. Mais ${merges === 1 ? "un merge a atterri" : `${merges ?? "des"} merges ont atterri`} sur la base depuis son dernier verdict rouge : ce qui la faisait échouer a pu changer. Elle te revient une dernière fois, depuis la base du moment. Mets ta branche à jour de la base, vérifie qu'elle tient, et livre de nouveau ; bloquée encore, la cuisine l'abandonnera.`,
      ...(remontee.reason === NON_JUGEE && remontee.why !== null ? [`Ce qui a empêché le jugement : ${remontee.why}`] : []),
      ...constats,
    ];
  }
  if (coup === "resume" && montee !== null) {
    return [
      `Cette livraison est restée bloquée (\`${remontee.reason}\` : \`${cause}\`) après ce que la cuisine avait déjà tenté : plutôt que de la laisser de côté, elle te revient un cran plus haut, en \`${montee.to.model}\` / \`${montee.to.effort}\` au lieu de \`${montee.from.model}\` / \`${montee.from.effort}\`. Mets ta branche à jour de la base, lève ce qui la bloque, et livre de nouveau.`,
      ...(remontee.reason === NON_JUGEE && remontee.why !== null ? [`Ce qui a empêché le jugement : ${remontee.why}`] : []),
      ...constats,
    ];
  }
  if (coup === "resume") {
    return [
      `Le ticket \`fix\` #${issue}, ouvert par la cuisine sur ce qui bloquait cette livraison (\`${cause}\`), est servi : la livraison te revient. Mets ta branche à jour de la base, vérifie qu'elle tient, et livre de nouveau.`,
      ...constats,
    ];
  }
  return [
    `La pass n'a pas pu juger cette livraison (\`${NON_JUGEE}\` : \`${cause}\`)${remontee.why === null ? "." : ` : ${remontee.why}`}`,
    "La cuisine te la renvoie une fois plutôt que de la remonter au chef : mets ta branche à jour de la base, lève ce qui t'en revient, et livre de nouveau. Si la même cause revient, la cuisine ouvre un ticket `fix` dessus.",
  ];
}
