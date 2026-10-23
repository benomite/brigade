// The facts of a project's autonomy table (`autonomie/table.ts`): one row
// moved from one position to another, by whoever the envelope's `author` names
// — and those of the decisions routed by it (`decision/evenements.ts`).
import type { FaitAiguillage } from "./decision/evenements.ts";
import type { Position, Rangee } from "./table.ts";

export type FaitAutonomie =
  // `row`: the kind of decision. `previous`: the position it held at that
  // read — the default when nothing had been set. `profile`: the profile
  // whose application moved it, or null for a change of that row alone.
  | { type: "autonomy.changed"; payload: { row: Rangee; previous: Position; position: Position; profile: string | null } }
  | FaitAiguillage;
