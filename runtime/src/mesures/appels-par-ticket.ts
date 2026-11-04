// The GitHub calls spent per served ticket over the last merges, for the `measures` report.
// Pure: the ledger snapshot (`perTicket`, built in `github/budget-appels.ts`) and the merged
// deliveries are passed in. A merged ticket the ledger does not know is unknown, never 0.
export const CALLS_MERGES = 10;

export type PerTicket = { [ticketNumber: number]: number };
export type MergedTicket = { ticket: number | null };
export type TicketCalls = { ticket: number; calls: number | null };
export type CallsPerTicket = { merges: number; tickets: TicketCalls[]; average: number | null; max: number | null };

// The `count` most recently merged tickets (deliveries come in merge order); a ticket merged
// twice counts once, at its latest merge.
export function measureCallsPerTicket(deliveries: MergedTicket[], perTicket: PerTicket, count = CALLS_MERGES): CallsPerTicket {
  const seen = new Set<number>();
  const last: number[] = [];
  for (const { ticket } of [...deliveries].reverse()) {
    if (ticket === null || seen.has(ticket)) continue;
    seen.add(ticket);
    last.push(ticket);
    if (last.length === count) break;
  }
  const tickets = last.reverse().map((ticket) => ({ ticket, calls: Object.hasOwn(perTicket, ticket) ? perTicket[ticket]! : null }));
  const known = tickets.flatMap(({ calls }) => (calls === null ? [] : [calls]));
  const average = known.length === 0 ? null : known.reduce((sum, calls) => sum + calls, 0) / known.length;
  return { merges: tickets.length, tickets, average, max: known.length === 0 ? null : Math.max(...known) };
}

export function describeCallsPerTicket(result: CallsPerTicket, count = CALLS_MERGES): string[] {
  const title = `GitHub calls per served ticket over the last ${count} merges`;
  if (result.merges === 0) return [`${title}: no merge in the log`];
  const unknown = result.tickets.filter(({ calls }) => calls === null).length;
  const over = result.merges < count ? `${title}: over the ${result.merges} merge${result.merges === 1 ? "" : "s"} available` : title;
  const stats = result.average === null ? "average unknown, max unknown" : `average ${Math.round(result.average * 10) / 10}, max ${result.max}`;
  const per = result.tickets.map(({ ticket, calls }) => `#${ticket}: ${calls ?? "unknown"}`).join(", ");
  return [`${over} — ${stats}${unknown > 0 ? ` (${unknown} unknown, left out)` : ""}`, `  ${per}`];
}
