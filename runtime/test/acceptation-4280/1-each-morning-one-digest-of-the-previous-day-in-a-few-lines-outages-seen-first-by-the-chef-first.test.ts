import assert from "node:assert/strict";
import { test } from "node:test";
import { digestDeLaVeille } from "../../src/journal-du-jour/digest.ts";

// #4025 : chaque matin, un digest de la veille, en un seul texte de quelques lignes, qui commence par le nombre de pannes
// vues d'abord par le chef.
const MATIN = new Date("2026-11-25T07:00:00.000Z");
const pm = (cause: string, vuEnPremier: string, fin: string) => ({ cause, duree: "45 min", vuEnPremier, corrige: "restart", ticket: "#1", fin });
const geste = (at: string, line: string, kind: string, outcome: string) => ({ at, line, reason: "r", outcome, kind });

test("the digest of yesterday is a few lines and its first line gives the outages seen first by the chef", () => {
  const texte = digestDeLaVeille(
    {
      postMortems: [pm("a", "chef", "2026-11-24T10:00:00.000Z"), pm("b", "chef", "2026-11-24T16:00:00.000Z"), pm("c", "system", "2026-11-24T18:00:00.000Z"), pm("d", "chef", "2026-11-23T10:00:00.000Z")],
      fils: { cook: [geste("2026-11-24T09:00:00.000Z", "merged #4001", "delivered", "fixed by itself")] },
    },
    MATIN,
  );
  const lignes = texte.split("\n").filter((l) => l.trim() !== "");
  assert.ok(lignes.length >= 1 && lignes.length <= 6, "a few lines");
  assert.match(lignes[0]!, /\b2\b/, "the first line counts the 2 outages of yesterday seen first by the chef");
  assert.match(lignes[0]!, /chef/i);
  assert.ok(texte.includes("merged #4001"), "what was delivered yesterday is there");
});
