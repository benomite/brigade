// Test d'acceptation gelé (#4299), critère 5. Contrat : `commenterLesLents({ evenements, maintenant, github })` de `runtime/src/delai-de-prise/commenter.ts`
// (voir le critère 4) ; `github.commentaires(issue)` rend les corps déjà postés, c'est ainsi que le job sait qu'il a déjà commenté.
import assert from "node:assert/strict";
import { test } from "node:test";
import { commenterLesLents } from "../../src/delai-de-prise/commenter.ts";

// Fixed events: ticket 1 merged in 8 minutes; ticket 2 in 25 minutes with one send-back. `phases` tile `pris`..`fusionne`.
const MAINTENANT = "2026-11-25T12:00:00.000Z";
const t = (min: number) => new Date(Date.UTC(2026, 10, 25, 10, min)).toISOString();
const EVENEMENTS = [
  { ticket: 1, pris: t(0), fusionne: t(8), phases: [
    { type: "cook", debut: t(0), fin: t(5) }, { type: "gates", debut: t(5), fin: t(6) }, { type: "review", debut: t(6), fin: t(8) } ] },
  { ticket: 2, pris: t(0), fusionne: t(25), phases: [
    { type: "cook", debut: t(0), fin: t(10) }, { type: "gates", debut: t(10), fin: t(15) }, { type: "review", debut: t(15), fin: t(19) },
    { type: "send-back", debut: t(19), fin: t(22) }, { type: "wait", debut: t(22), fin: t(25) } ] },
];

test("running the job twice leaves exactly one comment on the slow ticket", async () => {
  const postes: { issue: number; corps: string }[] = [];
  const github = {
    commentaires: async (issue: number) => postes.filter((p) => p.issue === issue).map((p) => p.corps),
    commenter: async (issue: number, corps: string) => void postes.push({ issue, corps }),
  };
  await commenterLesLents({ evenements: EVENEMENTS, maintenant: MAINTENANT, github });
  await commenterLesLents({ evenements: EVENEMENTS, maintenant: MAINTENANT, github });
  assert.equal(postes.filter((p) => p.issue === 2).length, 1);
});
