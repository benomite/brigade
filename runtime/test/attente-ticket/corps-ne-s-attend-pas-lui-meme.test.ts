// #3763 : un corps qui nomme son propre ticket ne le fait pas s'attendre lui-même ; les autres tickets nommés restent attendus.
import assert from "node:assert/strict";
import { test } from "node:test";
import { attendusDuCorps } from "../../src/attente-ticket/attente-ticket.ts";

test("un ticket qui se nomme dans sa ligne Depends on ne s'attend pas, et attend les autres", async () => {
  const lire = async () => ({ state: "open", body: "" });
  assert.deepEqual(await attendusDuCorps(20, "Depends on #20", lire), []);
  assert.deepEqual(await attendusDuCorps(20, "Depends on #12\nDepends on #20", lire), [12]);
});
