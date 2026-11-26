// Fake of the parked state (runtime/src/parked/): same signatures as the real one, keeps a record per ticket.
export function fakeParked() {
  const calls: unknown[][] = [];
  const records = new Map<number, unknown>();
  return {
    calls,
    records,
    park: (ticket: number, who: string, forWhat: string, until: string) => {
      calls.push(["park", ticket, who, forWhat, until]);
      const record = { ticket, who, for: forWhat, until, step: "cooking" };
      records.set(ticket, record);
      return record;
    },
    unpark: (ticket: number, reason: string) => {
      calls.push(["unpark", ticket, reason]);
      records.delete(ticket);
      return { ticket, reason };
    },
  };
}
