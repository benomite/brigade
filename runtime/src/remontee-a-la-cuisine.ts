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
// - **rien de plus** : renvoyé et `fix` déjà tentés, le ticket reste 86 sur le
//   rail, et sa carte dit que la cuisine n'a plus rien à essayer.
//
// À chaque pas, le ticket reste sur le rail, et sa carte dit ce que fait la
// cuisine (`direReprise`) : rien n'en entre dans TODO. Seules restent au chef
// les remontées que `CAUSES_DU_CHEF` nomme, chacune avec sa raison.
//
// Rien n'est tenu ici : tout se relit du journal (`pass.kitchen-took-over`).
import type { Base } from "./base.ts";
import { cartesEnTodo } from "./carte-todo.ts";
import { DU_MANAGER, ENCORE_ROUGE, HORS_RAIL, motifDeRemontee, NON_JUGEE, REDECOUPE } from "./events/pass.ts";
import { LABEL } from "./github.ts";
import { RENOMMAGE_ABANDONNE } from "./pause/pause.ts";
import { reactionDe } from "./projections/reactions.ts";
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
// `fix` : un ticket `fix` ouvert, le ticket 86 l'attend ; `resume` : ce `fix`
// servi, renvoyée à un cook ; `none` : plus rien à essayer.
export type Coup = "return" | "fix" | "resume" | "none";

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

export type Reprise = { cause: string; coup: Coup; issue: number | null; seq: number; at: string };

const lirePrises = (base: Base, ticket: number): Reprise[] =>
  base
    .lire<{ seq: number; at: string; payload: string }>("SELECT seq, at, payload FROM events WHERE ticket = ? AND type = 'pass.kitchen-took-over' ORDER BY seq", ticket)
    .map(({ seq, at, payload }) => {
      const lu = JSON.parse(payload) as { cause?: unknown; move?: unknown; issue?: unknown };
      return { cause: typeof lu.cause === "string" ? lu.cause : "", coup: lu.move as Coup, issue: typeof lu.issue === "number" ? lu.issue : null, seq, at };
    });

// Ce que la cuisine a fait de la remontée en cours du ticket : son dernier pas
// depuis elle, ou null s'il n'y en a aucun encore.
export function repriseDeLaRemontee(base: Base, ticket: number, remontee: Remontee): Reprise | null {
  return lirePrises(base, ticket).findLast(({ seq }) => seq > remontee.seq) ?? null;
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
// base — un `fix` de plus ne partirait pas, ou n'en finirait pas.
export function prochainCoup(remontee: { reason: string; cause: string | null }, deja: { renvoye: boolean; fixe: boolean }, fixPermis: boolean): Exclude<Coup, "resume"> {
  const { reason, cause } = remontee;
  if (reason === NON_JUGEE && !deja.renvoye && !deja.fixe && !(cause !== null && Object.hasOwn(SANS_RENVOI, cause))) return "return";
  if (!deja.fixe && fixPermis) return "fix";
  return "none";
}

// Ce que la cuisine a déjà tenté sur ce ticket, toutes remontées confondues.
export function dejaTente(base: Base, ticket: number): { renvoye: boolean; fixe: boolean } {
  const prises = lirePrises(base, ticket);
  return { renvoye: prises.some(({ coup }) => coup === "return"), fixe: prises.some(({ coup }) => coup === "fix") };
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
export function direRepriseEn({ cause, reprise }: RepriseDuTicket): string {
  if (reprise === null) return `the kitchen takes it up (${cause}), not the chef`;
  if (reprise.coup === "fix") return `the kitchen took it up (${cause}): its \`fix\` ticket #${reprise.issue} is open, and it goes back to a cook once #${reprise.issue} is served`;
  if (reprise.coup === "none") return `the kitchen took it up (${cause}) and has nothing left to try: it stays set aside`;
  return `the kitchen sent it back to a cook (${cause})`;
}
export function direReprise({ cause, reprise }: RepriseDuTicket): string {
  if (reprise === null) return `la cuisine le reprend (${cause}), pas le chef`;
  if (reprise.coup === "fix") return `la cuisine l'a repris (${cause}) : son ticket \`fix\` #${reprise.issue} est ouvert, il repart chez un cook une fois #${reprise.issue} servi`;
  if (reprise.coup === "none") return `la cuisine l'a repris (${cause}) et n'a plus rien à essayer : il reste de côté`;
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
// comme tout ce qui va au cook.
export function constatsDuRenvoi(remontee: Remontee, coup: "return" | "resume", issue: number | null, constats: string[]): string[] {
  const cause = remontee.cause ?? remontee.reason;
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
