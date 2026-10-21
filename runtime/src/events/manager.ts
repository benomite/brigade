// The manager's facts: the switch the chef holds, and each decision taken on
// an issue — set aside by the code, judged by the LLM —, with its reason, then
// what was put and said about it on GitHub.

import { geste } from "../geste.ts";
// What an issue is, according to the judgment. Only `ticket` goes onto the rail.
// `incomplete`: a unit of work, but one that lacks what it needs to start.
export const NATURES = ["ticket", "epic", "question", "decision", "incomplete"] as const;
export type Nature = (typeof NATURES)[number];

// Each nature as it is told to the chef, in French: the comments the manager puts on GitHub.
export const NOMS_DE_NATURE: Record<Nature, string> = {
  ticket: "un ticket",
  epic: "une épique",
  question: "une question",
  decision: "une issue de décision",
  incomplete: "un ticket incomplet",
};

// The same, in English: what `manager` and `manager upstream` say of them.
export const NOMS_DE_NATURE_EN: Record<Nature, string> = {
  ticket: "a ticket",
  epic: "an epic",
  question: "a question",
  decision: "a decision issue",
  incomplete: "an incomplete ticket",
};

// Why the code sets an issue aside without having it judged. `chef-changed`:
// the manager already put labels on it, and the chef has removed some since —
// everything it carries is now his.
// `already-split`: an epic whose body already carries the list of its tickets,
// without the log knowing it was split — it was done by hand.
export type Ecart = "roadmap" | "epic" | "question" | "decision" | "blocked-on-human" | "hors-cuisine" | "untrusted-author" | "chef-changed" | "already-split";

// The command by which the chef hands a `chef-changed` issue back to the
// manager, as it is told on the issue and in the report.
export const commandeRendre = (numero: number) => geste(`manager return ${numero}`);

// A ticket as the split plans it, before it exists on GitHub.
// `waitsFor`: the ranks, from 1, of the tickets of the same split that it
// awaits — always smaller than its own, which is what makes the order.
export type TicketPrevu = {
  title: string;
  context: string;
  criteria: string[];
  waitsFor: number[];
  zone: string[];
  // The capabilities the ticket asks of its station, if it asks for any.
  requires?: string[];
  // Those of its `waitsFor` that the code added to the split: its zone
  // overlapped theirs without it awaiting them. `path`: the shared path.
  overlaps?: { index: number; path: string }[];
  model: string;
  effort: string;
  calibration: string;
  // An interface ticket is cooked by the design cook. Absent: the ordinary
  // cook.
  cook?: "design";
};

// What the manager does with a ticket the pass handed to it. `retry`: the
// second return, at the same calibration — nothing could go up. `raise`: it
// raises the calibration. `split`: it splits it again. `escalate`: it takes it
// up to the chef.
export type ChoixDeReaction = "retry" | "raise" | "split" | "escalate";

// The manager's reaction to a red ticket. The envelope carries its number.
export type FaitReaction =
  // The choice, and its reason: this is where the chef reads "why was this
  // ticket split?". `verdict`: the sequence number of the `pass.judged` it
  // answers — the same one is not decided twice. `returns`: the returns
  // already consumed. `run`: the judgment that chose, null when the code
  // decided alone. `from`, `to`: the calibration, before and after a raise.
  // `proposal`: what it proposes to the chef, when it escalates.
  | {
      type: "manager.reacted";
      payload: {
        verdict: number;
        returns: number;
        choice: ChoixDeReaction;
        reason: string;
        proposal: string | null;
        run: string | null;
        from: { model: string; effort: string };
        to: { model: string; effort: string } | null;
        // The project's calibration ceiling the choice was made within. Absent
        // from a log written before it.
        ceiling?: { model: string; effort: string };
        // The TODO card of an escalation: `kind` is `product` or `gesture`, and
        // `statement` says in one line what is expected of the chef. Absent or
        // null: the ticket hides neither, and escalates without a card.
        card?: { kind: string; statement: string } | null;
      };
    }
  // The calibration labels changed by a raise, written once GitHub has been
  // served. `added`: those belong to the manager, it may replace them again.
  | { type: "manager.raised"; payload: { added: string[]; removed: string[] } }
  // The reaction is told on the issue.
  | { type: "manager.reaction-commented"; payload: Record<string, never> };

export type FaitManager =
  | FaitReaction
  // A ticket asks for a capability no station provides: the manager sends it
  // back before it reaches the chef. `resplit`: it was rewritten or split
  // again, and the ticket left the rail. `gestured`: it could not be, and a
  // `gesture` card in TODO names the access to give. `missing`: the
  // capabilities no station provides, `reason`: why the rewrite is impossible.
  | { type: "manager.capability-resplit"; payload: { missing: string[]; run: string | null } }
  | { type: "manager.capability-gestured"; payload: { missing: string[]; reason: string } }
  // An issue held by `blocked-on-human` was re-read for the decision it awaits.
  // `outcome`: `stated` (the decision is written: nothing changes), `card` (a
  // typed TODO card was derived: `card` holds it), `taken-back` (the label was
  // removed, the kitchen judges the issue), `unreadable` (no usable answer: it
  // stays held). `fingerprint`: what was read — the same one is not read twice.
  | {
      type: "manager.requalified";
      payload: { run: string; fingerprint: string; outcome: "stated" | "card" | "taken-back" | "unreadable"; reason: string; card?: { kind: string; statement: string } };
    }
  // The chef's commands. Without `manager.enabled`, the manager judges nothing.
  | { type: "manager.enabled"; payload: Record<string, never> }
  | { type: "manager.disabled"; payload: Record<string, never> }
  // The code decided, without an LLM. `fired`: the issue carries `fire`, put
  // there by the chef — the manager does not remove it, and does not calibrate
  // it. `lacking`, on a `chef-changed`: what the issue lacks to be launched
  // and calibrated (`fire`, `model:`, `effort:`) at the time it was set aside.
  | { type: "manager.set-aside"; payload: { reason: Ecart; fired: boolean; lacking?: string[] } }
  // The LLM judged. `run`: the judgment, whose calibration and cost are in its
  // `cook.launched` and its `cook.exited`. `fingerprint`: the fingerprint of
  // what was judged — the same one is not judged again. `reason`: the reason.
  // `missing`: what would make a refused issue executable. `calibration`: why
  // this model and this effort.
  | {
      type: "manager.judged";
      payload: {
        run: string;
        fingerprint: string;
        verdict: "fire" | "refused";
        kind: Nature;
        reason: string;
        missing: string | null;
        model: string | null;
        effort: string | null;
        calibration: string | null;
      };
    }
  // The judgment ran to its end, but its answer cannot be read: nothing is
  // put. A judgment that did not complete (outage, guardrail) writes nothing
  // here: it is retried.
  | { type: "manager.failed"; payload: { run: string; fingerprint: string; reason: string } }
  // What the manager put on the issue, written once GitHub has been served:
  // it is the only memory of what comes from it — every other label is the
  // chef's.
  | { type: "manager.labeled"; payload: { labels: string[] } }
  // The decision is told on the issue.
  | { type: "manager.commented"; payload: Record<string, never> }
  // The chef hands a `chef-changed` issue back to the manager: the manager
  // forgets what it had decided about it and what it had put on it, and judges
  // it again. A handback is good for one judgment: set aside again, it takes
  // another.
  | { type: "manager.handed-back"; payload: Record<string, never> }
  // The calibration labels the manager had put on a handed-back issue, and
  // removed before judging it again, written once GitHub has been served.
  | { type: "manager.withdrew"; payload: { labels: string[] } }
  // An issue on which the manager was awaiting the chef — set aside, an
  // unreadable judgment or split, a question asked on an epic — has left the
  // list of open issues: the chef decided by closing it. Written once.
  | { type: "manager.closed"; payload: Record<string, never> }
  // It came back as it had left: it is awaiting again.
  | { type: "manager.reopened"; payload: Record<string, never> }
  // --- The split of an epic. Unless stated otherwise, the envelope carries the
  // epic's number.
  //
  // The LLM split: this is the intent, written before any call to GitHub.
  // `reason`: why these tickets; `order`: why this order. An epic that carries
  // this fact is never judged again.
  | { type: "manager.split"; payload: { run: string; fingerprint: string; reason: string; order: string; tickets: TicketPrevu[] } }
  // The LLM does not split what it does not understand: it asks the chef a
  // question. The epic is re-read when it changes.
  | { type: "manager.split-asked"; payload: { run: string; fingerprint: string; question: string } }
  // The LLM reads that the epic already lists its tickets: nothing is created.
  | { type: "manager.split-skipped"; payload: { run: string; fingerprint: string; reason: string } }
  // The split ran to its end, but its answer cannot be read.
  | { type: "manager.split-failed"; payload: { run: string; fingerprint: string; reason: string } }
  // The ticket of rank `index` is about to be created: written before the
  // call. Without `split-created` behind it, nothing says whether GitHub
  // created it — it is looked for before being created again.
  | { type: "manager.split-creating"; payload: { index: number } }
  // The envelope carries the number of the ticket born. `reconciled`: found on
  // GitHub after a creation whose fact was missing.
  | { type: "manager.split-created"; payload: { epic: number; index: number; reconciled: boolean } }
  // Its card is put in place, then `fire`: it is on the rail. Envelope: the ticket.
  | { type: "manager.split-fired"; payload: { epic: number; index: number } }
  // All the planned tickets exist and are launched.
  | { type: "manager.split-done"; payload: Record<string, never> }
  // What the manager had to say about the split is told on the epic.
  | { type: "manager.split-commented"; payload: Record<string, never> }
  // A ticket the chef himself attached to a split epic, by the `Épique : #N`
  // line of its body. Envelope: the ticket.
  | { type: "manager.split-adopted"; payload: { epic: number; title: string } }
  // A ticket of an epic has left the list of open issues, or come back to it.
  // Envelope: the ticket.
  | { type: "manager.split-seen"; payload: { epic: number; open: boolean } }
  // The list of tickets is written in the epic's body. `digest`: the
  // fingerprint of what is written there — the same one is not rewritten.
  | { type: "manager.split-listed"; payload: { digest: string } }
  // All the epic's tickets are served: it is closed, with the list of its
  // tickets and their PRs. Written once GitHub has been served.
  | { type: "manager.split-served"; payload: Record<string, never> };
