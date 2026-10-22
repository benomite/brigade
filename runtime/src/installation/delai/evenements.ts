// The fact of a project's time to its first served ticket (`delai.ts`): the
// instant it was added. The instant is the event's own `at`; the payload is
// empty. It carries no ticket in its envelope: it holds the project.
export type FaitDelai =
  // The project was added to the station. Written once (dedup key), by the
  // station that prepares it for the first time.
  { type: "project.added"; payload: Record<string, never> };
