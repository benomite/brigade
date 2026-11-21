// What the cooks of the GitHub-only station spent on a ticket, read from their streams (`measures`).
import assert from "node:assert/strict";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { coutsDesFlux, lancementsDuFlux } from "../../src/mesures/flux-des-cooks.ts";
import type { CookMesure } from "../../src/projections/measures.ts";
import { repertoireTemporaire } from "../outils.ts";

// The stream a GitHub-only cook leaves, launch after launch: each spends `tokens`
// (its message read twice, the last usage counting, cache reads not), and
// delivers or not.
const flux = (...lancements: Array<{ tokens: number; livre: boolean }>) =>
  lancements
    .flatMap(({ tokens, livre }, i) => [
      { type: "system", subtype: "init", model: "claude-opus-5-5" },
      { type: "assistant", message: { id: `m${i}`, usage: { input_tokens: tokens / 2, output_tokens: 0 } } },
      { type: "assistant", message: { id: `m${i}`, usage: { input_tokens: tokens / 2, output_tokens: tokens / 2, cache_read_input_tokens: 99_999 } } },
      { type: "result", subtype: "success", is_error: !livre },
    ])
    .map((evenement) => JSON.stringify(evenement))
    .join("\n");

const cook = (tokens: number, delivered: boolean): CookMesure => ({ calibration: "claude-opus-5-5", turns: 1, durationMs: null, tokens, delivered });

test("a stream says what each launch of a ticket spent, and whether it delivered", () => {
  assert.deepEqual(lancementsDuFlux(`${flux({ tokens: 900, livre: false }, { tokens: 700, livre: true })}\n{"type":"assistant"`), [cook(900, false), cook(700, true)]);
  assert.deepEqual(lancementsDuFlux(""), []);
});

test("the cooks of a ticket come from its stream under the station's directory; none without a stream", (t) => {
  const repertoire = join(repertoireTemporaire(t), "github-seul");
  mkdirSync(repertoire);
  writeFileSync(join(repertoire, "119-github.flux.jsonl"), flux({ tokens: 1_500, livre: true }));
  const couts = coutsDesFlux(repertoire);
  assert.deepEqual(couts(119), [cook(1_500, true)]);
  assert.deepEqual(couts(120), []);
});
