// The park and unpark gesture (#4275): one gesture for the second and the app, on any project.
// It is a thin adapter over the parked state (runtime/src/parked/, built by another ticket): it checks the
// request, then calls park(ticket, who, for, until) or unpark(ticket, reason). It runs no box command.

// The parked state, as the gesture calls it.
export interface ParkedState<Record = unknown, Unparked = unknown> {
  park(ticket: number, who: string, forWhat: string, until: string): Record | Promise<Record>;
  unpark(ticket: number, reason: string): Unparked | Promise<Unparked>;
}

export interface ParkRequest {
  who: string;
  for: string;
  until: string;
}

const REQUIRED = ["who", "for", "until"] as const;

export function createParkedGesture<R, U>(parked: ParkedState<R, U>) {
  return {
    async park(ticket: number, request: ParkRequest): Promise<R> {
      const missing = REQUIRED.filter((field) => typeof request?.[field] !== "string" || request[field].trim() === "");
      if (missing.length > 0) {
        throw new Error(`cannot park #${ticket}: ${missing.map((field) => `'${field}'`).join(", ")} missing — a parked ticket needs who, for what and until when`);
      }
      return parked.park(ticket, request.who, request.for, request.until);
    },
    async unpark(ticket: number, reason: string): Promise<U> {
      if (typeof reason !== "string" || reason.trim() === "") throw new Error(`cannot unpark #${ticket}: 'reason' missing`);
      return parked.unpark(ticket, reason);
    },
  };
}
