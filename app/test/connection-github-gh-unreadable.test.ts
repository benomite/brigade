// #4084, critère 2 : un `gh` qu'on ne sait pas lire : le bouton cesse de tourner en quelques secondes, une phrase, le détail au survol.
import assert from "node:assert/strict";
import { chmodSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test, type TestContext } from "node:test";
import { connexionGitHub } from "../../runtime/src/appairage/stations-du-chef.ts";
import { holdConnectionGitHub, type StartOfConnection, type EndOfConnection } from "../src/connection-github.ts";
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

test("un `gh` illisible qui reste en vie : un refus en une phrase, ce que `gh` a dit en détail", { skip: WITHOUT_POSIX }, async (t) => {
  const gh = fakeGh(t, `echo "Quelque chose d'inattendu: ZZZ" >&2\nsleep 30`);
  const connect = holdConnectionGitHub({ commande: async () => connexionGitHub(gh).command, env: process.env, ouvrir: () => undefined, apres: () => undefined });
  const start = await inSomeSeconds(connect());
  assert.ok("refus" in start, "un refus, pas une attente");
  assert.equal(start.refus.trim().split("\n").length, 1);
  assert.match(start.refus, /\.$/);
  assert.match(start.detail ?? "", /Quelque chose d'inattendu: ZZZ/);
});
