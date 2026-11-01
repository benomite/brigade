import assert from "node:assert/strict";
import test from "node:test";
import type { Evenement } from "../../src/evenements.ts";
import { direMergesAvantRouge, mergesAvantRouge } from "../../src/base-check/merges-avant-rouge.ts";

const JOUR = "2026-01-01";
let seq = 0;
// Un fait minimal : seuls seq, at, type et ticket servent au module.
const fait = (type: string, ticket: number, heure: string) => ({ seq: ++seq, at: `${JOUR}T${heure}.000Z`, project: "p", ticket, author: "pass", type, payload: {} }) as unknown as Evenement;

function journalDe(faits: Evenement[]) {
  return {
    merges: faits.filter((f) => f.type === "merge.done"),
    duTicket: (ticket: number) => faits.filter((f) => f.ticket === ticket),
  };
}

test("deux merges aux jugements qui se recouvrent, puis une base rouge : la ligne les liste dans l'ordre du merge, avec début et fin de jugement", () => {
  const { merges, duTicket } = journalDe([
    fait("pass.started", 17, "10:00:00"),
    fait("pass.started", 18, "10:01:00"),
    fait("pass.judged", 17, "10:05:00"),
    fait("merge.done", 17, "10:05:10"),
    fait("pass.judged", 18, "10:06:00"),
    fait("merge.done", 18, "10:06:10"),
  ]);
  const ligne = direMergesAvantRouge("v2", mergesAvantRouge(merges, duTicket));
  assert.equal(
    ligne,
    "brigade : v2 rouge après des merges dont les jugements se recouvrent (#17, #18) — merges depuis la dernière base verte : " +
      `#17 (merge n°1 à ${JOUR}T10:05:10.000Z, jugement ${JOUR}T10:00:00.000Z → ${JOUR}T10:05:00.000Z) ; ` +
      `#18 (merge n°2 à ${JOUR}T10:06:10.000Z, jugement ${JOUR}T10:01:00.000Z → ${JOUR}T10:06:00.000Z)`,
  );
});

test("un seul merge série avant le rouge : la ligne le nomme et ne parle pas de parallélisme", () => {
  const { merges, duTicket } = journalDe([fait("pass.started", 17, "10:00:00"), fait("pass.judged", 17, "10:05:00"), fait("merge.done", 17, "10:05:10")]);
  const ligne = direMergesAvantRouge("v2", mergesAvantRouge(merges, duTicket));
  assert.match(ligne ?? "", /^brigade : v2 rouge après un seul merge, sans jugement en parallèle : #17 \(merge n°1/);
});

test("deux merges l'un après l'autre, jugements disjoints : pas de parallélisme", () => {
  const { merges, duTicket } = journalDe([
    fait("pass.started", 17, "10:00:00"),
    fait("pass.judged", 17, "10:01:00"),
    fait("merge.done", 17, "10:01:10"),
    fait("pass.started", 18, "10:02:00"),
    fait("pass.judged", 18, "10:03:00"),
    fait("merge.done", 18, "10:03:10"),
  ]);
  assert.match(direMergesAvantRouge("v2", mergesAvantRouge(merges, duTicket)) ?? "", /2 merges faits l'un après l'autre, sans jugement en parallèle/);
});

test("aucun merge depuis la dernière base verte : aucune ligne", () => {
  assert.equal(direMergesAvantRouge("v2", mergesAvantRouge([], () => [])), null);
});
