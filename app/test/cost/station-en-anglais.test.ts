// `station` parle anglais (#953) : l'onglet Cost lit ses blocs dans les deux langues — celle d'une box
// à jour et celle d'une box qui n'a pas encore le runtime du ticket.
import assert from "node:assert/strict";
import { test } from "node:test";
import { cooksDe } from "../../src/vue/cost/chers.js";
import { joursDe } from "../../src/vue/cost/courbe.js";
import { perdusDe } from "../../src/vue/cost/perdus.js";
import { seuilsDe } from "../../src/vue/cost/seuils.js";
import { fenetresDe } from "../../src/vue/cost/tete.js";

const EN = [
  "station               box/claude — engine claude, provides: code",
  "latest cooks          ",
  "  2026-10-12T10:00:00.000Z  #30  r-91c0  sonnet / medium  done  31 turns · 412,806 tokens · 9.2 min",
  "  2026-10-12T10:01:00.000Z  #31  r-91c1  sonnet / medium  failed  3 turns · 1,200 tokens · 1.5 min",
  "  2026-10-12T10:02:00.000Z  #32  r-91c2  sonnet / medium  interrupted (runtime stopped)",
  "consumed              in flight: nothing",
  "                      5 h: 6 launches · 31 turns · 1,284,530 tokens",
  "                      24 h: nothing",
  "                      2026-10-16: 19 launches · 4,912,044 tokens",
  "                      what this project has launched, not the account's consumption: /usage gives it",
  "chef's decisions      `station -- <geste> <valeur>` to set one, `station -- help` for the settings",
  "  seuil-ticket        800000",
  "  seuil-perdus        not set — BRIGADE_DRIFT_LOST_TOKENS is only read from the log",
].join("\n");

test("les cooks, les tokens perdus, les seuils, les fenêtres et les jours se lisent aussi dans la sortie anglaise", () => {
  assert.deepEqual(cooksDe(EN), [{ ticket: 30, tokens: 412806 }, { ticket: 31, tokens: 1200 }, { ticket: 32, tokens: null }]);
  assert.deepEqual(perdusDe(EN)?.map(({ ticket, tokens, cause }) => [ticket, tokens, cause]), [[31, 1200, "red attempt"], [32, null, "interrupted"]]);
  assert.deepEqual(seuilsDe(EN), { ticket: 800000, perdus: null });
  assert.deepEqual([...fenetresDe(EN)], [[5, 1284530], [24, 0]]);
  assert.deepEqual([...joursDe(EN)], [["2026-10-16", 4912044]]);
});
