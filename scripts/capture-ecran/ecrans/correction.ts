// La file de « parade » quand une cause de ratage revient (#999, épique 994) : `facts` porte une
// correction proposée de son `CLAUDE.md`, que le chef tranche. Ce que la box rend de plus que la
// cuisine figée : le champ `corrections` (runtime/src/correctif/cartes.ts), une proposition — la
// cause, les trois tickets qu'elle a fait rater, le diff, son coût.
import type { CorrectionLue } from "../../../app/src/correction.ts";
import type { Faits } from "../../../app/src/faits.ts";
import { configuration, cuisine, demarrage, type Ecran, MAINTENANT, type Rendu } from "./commun.ts";
import { PROJETS, RENDUS } from "./cuisine-figee.ts";

const PARADE = RENDUS.parade as Rendu;
const ISSUE = (ticket: number) => `https://github.com/chef/parade/issues/${ticket}`;

export const CORRECTION: CorrectionLue = {
  proposition: 412,
  cause: "gates-app",
  titre: "red gates: app tests",
  tickets: [3, 5, 8].map((ticket) => ({ ticket, url: ISSUE(ticket) })),
  motif: "Three cooks ran the app tests against the clock; the guidance never says a test waits for a fact, not a duration.",
  diff: [
    "diff --git a/CLAUDE.md b/CLAUDE.md",
    "index 3b18e51..a9c4f02 100644",
    "--- a/CLAUDE.md",
    "+++ b/CLAUDE.md",
    "@@ -21,7 +21,10 @@ Conventions",
    " - Tests: `npm test` in `app/`, before every commit.",
    " - Type check: `npm run typecheck`.",
    "-- A test may wait a few seconds for the server to start.",
    "+- A test never runs against the clock: it waits for a fact — a file written,",
    "+  a process gone, a line printed — never for a duration. Several suites run",
    "+  at once on the station, and each takes three to four times as long.",
    " - Never kill a process by its name.",
    " ",
    " ## Screens",
  ].join("\n"),
  fichiers: ["CLAUDE.md"],
  base: "48638df",
  cout: { tokens: 18_342 },
  proposee: "2026-10-13T09:58:40.000Z",
};

const FACTS: Faits = { ...PARADE.facts, corrections: [CORRECTION] };

export const ecran: Ecran = {
  dit: "La file de « parade » avec une correction proposée de son CLAUDE.md : la cause, ses trois tickets, le diff, son coût, « yes » et « no »",
  largeur: 1440,
  hauteur: 900,
  etapes: [{ cliquer: '#projets > button[title^="parade — "]' }],
  donnees: () => ({
    maintenant: MAINTENANT,
    reponses: { demarrage: demarrage(configuration(PROJETS)), espace: [] },
    envois: cuisine({ ...RENDUS, parade: { ...PARADE, facts: FACTS } }),
  }),
};
