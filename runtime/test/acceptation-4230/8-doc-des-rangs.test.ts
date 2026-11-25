// #4230, criterion 8: docs/runtime/risk-levels.md lists the kinds, the defaults and where the chef changes a rank.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { RANGS_PAR_DEFAUT } from "../../src/risque/risque.ts";

const DOC = readFileSync(join(import.meta.dirname, "../../../docs/runtime/risk-levels.md"), "utf8");

test("the risk levels doc lists each kind with its default rank, the rank of an unranked kind, and where the chef changes a rank", () => {
  for (const [sorte, rang] of Object.entries(RANGS_PAR_DEFAUT)) assert.match(DOC, new RegExp(`\\| \`${sorte}\` \\| [^|]+ \\| \`${rang}\` \\|`), sorte);
  assert.match(DOC, /any other kind[^\n]*`chef`/i);
  assert.match(DOC, /`\.claude\/brigade\/projet\.json`/);
  assert.match(DOC, /`risks`/);
  assert.match(DOC, /`kind:<kind>`/);
});
