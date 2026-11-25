// #4230, criterion 8: docs/runtime/risk-levels.md lists the kinds, the defaults and where the chef changes a rank.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { risqueDuTicket } from "../../src/risque/risque.ts";

const DOC = readFileSync(join(import.meta.dirname, "../../../docs/runtime/risk-levels.md"), "utf8");

test("the risk levels doc lists each kind with its default rank, the rank of an unranked kind, and where the chef changes a rank", () => {
  for (const sorte of ["publish", "pay", "write-to-client", "fix-typo"]) {
    // The rank the doc says is the one the pass applies with no ranking in the sheet.
    const rang = risqueDuTicket([`kind:${sorte}`], () => null)?.rang;
    assert.match(DOC, new RegExp(`\\| \`${sorte}\` \\| [^|]+ \\| \`${rang}\` \\|`), sorte);
  }
  assert.match(DOC, /any other kind[^\n]*`chef`/i);
  assert.match(DOC, /`\.claude\/brigade\/projet\.json`/);
  assert.match(DOC, /`risks`/);
  assert.match(DOC, /`kind:<kind>`/);
});
