// docs/captures/ ne garde que les captures que quelque chose lit (#4578) : un test, un workflow ou un doc qui nomme le
// fichier. Les preuves des PR mergées restent dans l'historique git ; elles pesaient 190 Mo du dépôt.
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { join } from "node:path";
import { test } from "node:test";

const ROOT = join(import.meta.dirname, "../..");
const git = (...args: string[]) => spawnSync("git", args, { cwd: ROOT, encoding: "utf8" });

test("every file left in docs/captures/ is named by a file outside it (#4578)", () => {
  const files = git("ls-files", "docs/captures").stdout.split("\n").filter(Boolean);
  const unread = files.filter((file) => git("grep", "-q", "-F", "-e", file, "--", ":!docs/captures").status !== 0);
  assert.deepEqual(unread, []);
});
