// Ce que la box rend d'une correction proposée (#999), pour les tests de ce dossier : la forme que le
// runtime écrit dans `facts` (runtime/src/correctif/cartes.ts) — une proposition sur deux fichiers,
// le `CLAUDE.md` et les gates, trois tickets dont un sans adresse.
import type { CorrectionLue } from "../../src/correction.ts";
import type { Faits } from "../../src/faits.ts";

export const DIFF = [
  "diff --git a/CLAUDE.md b/CLAUDE.md",
  "index 3b18e51..a9c4f02 100644",
  "--- a/CLAUDE.md",
  "+++ b/CLAUDE.md",
  "@@ -1,3 +1,4 @@ Conventions",
  " - Tests: `npm test`.",
  "-- A test may wait a few seconds.",
  "+- A test never runs against the clock:",
  "+  it waits for a fact.",
  " - Never kill a process by its name.",
  "diff --git a/.claude/brigade/gates.sh b/.claude/brigade/gates.sh",
  "index 1111111..2222222 100755",
  "--- a/.claude/brigade/gates.sh",
  "+++ b/.claude/brigade/gates.sh",
  "@@ -4,2 +4,3 @@",
  " npm --prefix app test",
  "+npm --prefix app run typecheck",
  "\\ No newline at end of file",
  "",
].join("\n");

export const CORRECTION: CorrectionLue = {
  proposition: 412,
  cause: "gates-app",
  titre: "red gates: app tests",
  tickets: [
    { ticket: 3, url: "https://github.com/chef/parade/issues/3" },
    { ticket: 5, url: "https://github.com/chef/parade/issues/5" },
    { ticket: 8, url: null },
  ],
  motif: "The guidance never says a test waits for a fact.",
  diff: DIFF,
  fichiers: ["CLAUDE.md", ".claude/brigade/gates.sh"],
  base: "48638df",
  cout: { tokens: 18_342 },
  proposee: "2026-10-13T09:58:40.000Z",
};

export const FAITS: Faits = {
  etat: "ouverte",
  lu: "2026-10-13T10:04:11.000Z",
  dernierTick: "2026-10-13T10:04:02.000Z",
  compteurs: { rail: 1, auTravail: 0, aLaPass: 0, attend: 0, livres24h: 0 },
  dernierEvenement: null,
  rail: [{ ticket: 21, etat: "en attente", titre: "L'export du journal", url: "https://github.com/chef/parade/issues/21", activite: null }],
  cooks: [],
  attend: [],
  corrections: [CORRECTION],
};
