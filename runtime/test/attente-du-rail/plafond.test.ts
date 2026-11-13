// Le plafond de cooks de la station locale, lu du journal : la raison 5 de l'attente de la file (#3433).
import assert from "node:assert/strict";
import { test } from "node:test";
import { plafondAtteintDeLaStation } from "../../src/attente-du-rail/status.ts";
import { ouvrirJournal } from "../../src/journal.ts";
import { horloge, repertoireTemporaire } from "../outils.ts";

const STATION = "box/claude";
const LIMITES = { durationMs: 3_600_000, tokens: 2_000_000, idleMs: 600_000 };

function cuisine(t: import("node:test").TestContext, annonce: Record<string, unknown> | null) {
  const journal = ouvrirJournal(repertoireTemporaire(t), { maintenant: horloge() });
  t.after(() => journal.fermer());
  if (annonce !== null) journal.ajouter({ project: "brigade", ticket: null, author: `station:${STATION}`, type: "station.announced", payload: { station: STATION, engine: "claude", provides: ["code"], ...annonce } });
  const lancer = (run: string, ticket: number) =>
    journal.ajouter({
      project: "brigade",
      ticket,
      author: "runtime",
      type: "cook.launched",
      payload: { run, limits: LIMITES, stream: `runs/${run}.jsonl`, station: STATION, model: "sonnet", effort: "medium", branch: `cook/${run}`, worktree: `worktrees/${run}` },
    });
  return { base: journal.base, lancer };
}

test("aucune station annoncée : le plafond n'est pas atteint", (t) => {
  assert.equal(plafondAtteintDeLaStation(cuisine(t, null).base), false);
});

test("la station a une place libre, puis plus aucune : atteint seulement quand ses cooks égalent son plafond", (t) => {
  const { base, lancer } = cuisine(t, { maxCooks: 2 });
  lancer("r1", 1);
  assert.equal(plafondAtteintDeLaStation(base), false);
  lancer("r2", 2);
  assert.equal(plafondAtteintDeLaStation(base), true);
});
