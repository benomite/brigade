// #4510 — the shell's small modules read nothing from the old runtime: every file of the ticket names no `runtime/src/<x>`
// but `runtime/src/kitchen/`; the `brigade` command, which only ran the old runtime's station gesture, is gone; the phone
// reads a station's selection itself; and « back to the kitchen » removes the labels the kitchen reads as parked.
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, test } from "node:test";
import { removeTheLabel } from "../../src/actions-github.ts";
import { readTheProjectsOfAccount } from "../../src/read-github-phone.ts";
import type { AnswerGitHub } from "../../src/board/client.ts";
import type { BoardRead } from "../../src/board/read.ts";
import type { ClientOfThePriority } from "../../src/priority.ts";

const SRC = join(import.meta.dirname, "..", "..", "src");
const SCOPE = ["home.ts", "manager.ts", "notification.ts", "setup/init.sh", "read-github-phone.ts", "actions-github.ts", "name.ts", "ordinary.ts", "cooking.ts", "caps-duration.ts", "closer-health.ts", "reliability.ts", "terminals.ts", "alerts.ts"];

describe("#4510 — the shell's small modules read nothing from the old runtime", () => {
  test("no file of the ticket names a path of runtime/src other than runtime/src/kitchen/", () => {
    const found = SCOPE.flatMap((file) =>
      readFileSync(join(SRC, file), "utf8")
        .split("\n")
        .flatMap((line, rank) => (/runtime\/src\/(?!kitchen\/)/.test(line) ? [`${file}:${rank + 1}: ${line.trim()}`] : [])),
    );
    assert.deepEqual(found, []);
  });

  test("the `brigade` command, which ran the old runtime's station gesture, is gone", () => {
    assert.equal(existsSync(join(SRC, "command-brigade.ts")), false);
    assert.doesNotMatch(readFileSync(join(SRC, "main.ts"), "utf8"), /command-brigade/);
  });

  test("the phone reads a station's selection from its gist: a well-formed one names its repositories, a malformed one none", async () => {
    const gists: Record<string, Record<string, string>> = {
      a1: { "brigade-selection.json": JSON.stringify({ brigade: "station-selection", format: 1, repositories: ["chef/parade"], updatedAt: "2026-11-02T00:00:00Z" }) },
      b2: { "brigade-selection.json": "{ not json" },
      c3: { "brigade-selection.json": JSON.stringify({ brigade: "station-selection", format: 1, repositories: ["chef/cantine", "not a repository"] }) },
    };
    const call = async (path: string): Promise<AnswerGitHub> => {
      if (path.startsWith("/gists?")) return { status: 200, data: Object.entries(gists).map(([id, files]) => ({ id, files })) };
      const files = gists[path.slice("/gists/".length)] ?? {};
      return { status: 200, data: { files: Object.fromEntries(Object.entries(files).map(([name, content]) => [name, { content }])) } };
    };
    assert.deepEqual(await readTheProjectsOfAccount(call), [{ nom: "parade", depot: "chef/parade" }]);
  });

  test("« back to the kitchen » removes `parked` and `parked:chef`, then the waiting labels the kitchen still reads as parked", async () => {
    const read = { lu: true, depot: "chef/parade", faits: { rail: [], attend: [{ ticket: 31 }] } } as unknown as BoardRead;
    const removed: string[] = [];
    const client = { ecrire: async (_method: string, path: string) => (removed.push(decodeURIComponent(path.split("/labels/")[1] ?? "")), { status: 200, data: [] }) } as unknown as ClientOfThePriority;
    assert.ok("fait" in (await removeTheLabel(read, "cuisine", 31, client)));
    assert.deepEqual(removed, ["parked", "parked:chef", "waiting", "blocked-on-human"]);
  });
});
