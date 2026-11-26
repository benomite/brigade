import assert from "node:assert/strict";
import { test } from "node:test";
import { Sortie } from "../src/appel.ts";
import { principal as rapport } from "../src/rapport-cli.ts";
import { repertoireTemporaire } from "./outils.ts";

function appeler(args: string[], env: Record<string, string>): { code: number | null; redits: string[] } {
  const redits: string[] = [];
  try {
    rapport({ args, env, dire: () => {}, redire: (l) => redits.push(l) });
  } catch (erreur) {
    if (!(erreur instanceof Sortie)) throw erreur;
    return { code: erreur.code, redits };
  }
  return { code: null, redits };
}

test("`report` without `--week` is a usage error: the daily report is gone", (t) => {
  const { code, redits } = appeler([], { BRIGADE_STATE_DIR: repertoireTemporaire(t) });
  assert.equal(code, 2);
  assert.match(redits.join("\n"), /usage: .*--week <YYYY-MM-DD>/);
});

test("`report --week <date>` is read as a call, not as a usage error", (t) => {
  const { code, redits } = appeler(["--week", "2026-11-02"], { BRIGADE_STATE_DIR: repertoireTemporaire(t) });
  assert.equal(code, 1);
  assert.doesNotMatch(redits.join("\n"), /usage:/);
});
