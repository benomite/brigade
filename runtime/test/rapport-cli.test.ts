// `report` only prints the weekly kitchen summary (#3261): the daily report read entries nothing wrote any more (#3908).
import assert from "node:assert/strict";
import { test } from "node:test";
import { principal as report } from "../src/rapport-cli.ts";
import { appeler } from "./outils.ts";

test("`report` refuses a call that does not name a week, and one without a state directory", async () => {
  const sansSemaine = appeler((appel) => report(appel), [], { BRIGADE_STATE_DIR: "/nonexistent" });
  assert.equal(await sansSemaine.fin, 2);
  assert.match(sansSemaine.sortie(), /--week <YYYY-MM-DD>/);
  const sansEtat = appeler((appel) => report(appel), ["--week", "2026-11-02"]);
  assert.equal(await sansEtat.fin, 2);
  const trop = appeler((appel) => report(appel), ["x"], { BRIGADE_STATE_DIR: "/nonexistent" });
  assert.equal(await trop.fin, 2);
});
