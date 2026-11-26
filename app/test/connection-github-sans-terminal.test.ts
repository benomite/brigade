// #4084, critère 3 : le chef ne passe jamais par un terminal : de « Entrée » au bout de la connexion, tout se fait depuis l'app.
import assert from "node:assert/strict";
import { chmodSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test, type TestContext } from "node:test";
import { connexionGitHub } from "../../runtime/src/appairage/stations-du-chef.ts";
import { holdConnectionGitHub, type DebutDeConnection, type FinDeConnection } from "../src/connection-github.ts";
import { SANS_POSIX } from "./aides/posix.ts";

const fauxGh = (t: TestContext, corps: string) => {
  const dossier = mkdtempSync(join(tmpdir(), "brigade-app-connexion-4084-"));
  t.after(() => rmSync(dossier, { recursive: true, force: true }));
  const gh = join(dossier, "gh");
  writeFileSync(gh, `#!/bin/sh\n${corps}\n`);
  chmodSync(gh, 0o755);
  return gh;
};

// Rend ce que la vue recevrait, ou dit que le bouton tourne encore au bout de quelques secondes.
const dansQuelquesSecondes = (promesse: Promise<DebutDeConnection>) =>
  Promise.race([promesse, new Promise<never>((_, rejeter) => setTimeout(() => rejeter(new Error("le bouton tourne encore après 10 s")), 10_000))]);

test("un `gh` récent, sans terminal : le code, la page, puis la fin de la connexion, sans que personne n'ait rien tapé", { skip: SANS_POSIX }, async (t) => {
  const gh = fauxGh(t, `[ -t 0 ] && exit 3\necho "! Your device code is: WXYZ-5678" >&2\necho "  Go to https://github.com/login/device and enter it." >&2\nsleep 1\necho "Logged in as chef" >&2`);
  const fins: FinDeConnection[] = [];
  const connecter = holdConnectionGitHub({ commande: async () => connexionGitHub(gh).command, env: process.env, ouvrir: () => undefined, apres: (fin) => fins.push(fin) });
  const debut = await dansQuelquesSecondes(connecter());
  assert.deepEqual(debut, { code: "WXYZ-5678", page: "https://github.com/login/device" });
  const fin = Date.now() + 15_000;
  while (fins.length === 0 && Date.now() < fin) await new Promise((r) => setTimeout(r, 50));
  assert.deepEqual(fins, [{ connecte: true }]);
});
