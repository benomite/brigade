// #4084, critère 3 : le chef ne passe jamais par un terminal : de « Entrée » au bout de la connexion, tout se fait depuis l'app.
import assert from "node:assert/strict";
import { chmodSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test, type TestContext } from "node:test";
import { holdConnectionGitHub, signInToGitHub, type StartOfConnection, type EndOfConnection } from "../src/connection-github.ts";
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

test("un `gh` récent, sans terminal : le code, la page, puis la fin de la connexion, sans que personne n'ait rien tapé", { skip: WITHOUT_POSIX }, async (t) => {
  const gh = fakeGh(t, `[ -t 0 ] && exit 3\necho "! Your device code is: WXYZ-5678" >&2\necho "  Go to https://github.com/login/device and enter it." >&2\nsleep 1\necho "Logged in as chef" >&2`);
  const ends: EndOfConnection[] = [];
  const connect = holdConnectionGitHub({ commande: async () => signInToGitHub(gh), env: process.env, ouvrir: () => undefined, apres: (end) => ends.push(end) });
  const start = await inSomeSeconds(connect());
  assert.deepEqual(start, { code: "WXYZ-5678", page: "https://github.com/login/device" });
  const end = Date.now() + 15_000;
  while (ends.length === 0 && Date.now() < end) await new Promise((r) => setTimeout(r, 50));
  assert.deepEqual(ends, [{ connecte: true }]);
});
