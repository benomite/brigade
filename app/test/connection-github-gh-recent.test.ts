// #4084, critère 1 : un `gh` récent, qui dit son code et sa page autrement, donne quand même le code et ouvre la page, vite.
import assert from "node:assert/strict";
import { chmodSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test, type TestContext } from "node:test";
import { holdConnectionGitHub, signInToGitHub, type StartOfConnection } from "../src/connection-github.ts";
import { WITHOUT_POSIX } from "./helpers/posix.ts";

const fakeGh = (t: TestContext, body: string) => {
  const folder = mkdtempSync(join(tmpdir(), "brigade-app-connexion-4084-"));
  t.after(() => rmSync(folder, { recursive: true, force: true }));
  const gh = join(folder, "gh");
  writeFileSync(gh, `#!/bin/sh\n${body}\n`);
  chmodSync(gh, 0o755);
  return gh;
};

// Rend ce que la vue recevrait, ou dit que le bouton tourne encore au bout de quelques secondes.
const inSomeSeconds = (promise: Promise<StartOfConnection>) =>
  Promise.race([promise, new Promise<never>((_, rejeter) => setTimeout(() => rejeter(new Error("le bouton tourne encore après 10 s")), 10_000))]);

test("un `gh` récent qui formule autrement son code et sa page : le code revient et la page s'ouvre", { skip: WITHOUT_POSIX }, async (t) => {
  const gh = fakeGh(t, `echo "! Your device code is: WXYZ-5678" >&2\necho "  Go to https://github.com/login/device and enter it." >&2\nsleep 30`);
  const openEntries: string[] = [];
  const connect = holdConnectionGitHub({ commande: async () => signInToGitHub(gh), env: process.env, ouvrir: (a) => openEntries.push(a), apres: () => undefined });
  const start = await inSomeSeconds(connect());
  assert.deepEqual(start, { code: "WXYZ-5678", page: "https://github.com/login/device" });
  assert.deepEqual(openEntries, ["https://github.com/login/device"]);
});
