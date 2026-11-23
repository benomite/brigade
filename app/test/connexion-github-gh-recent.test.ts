// #4084, critère 1 : un `gh` récent, qui dit son code et sa page autrement, donne quand même le code et ouvre la page, vite.
import assert from "node:assert/strict";
import { chmodSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test, type TestContext } from "node:test";
import { connexionGitHub } from "../../runtime/src/appairage/stations-du-chef.ts";
import { tenirConnexionGitHub, type DebutDeConnexion, type FinDeConnexion } from "../src/connexion-github.ts";
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
const dansQuelquesSecondes = (promesse: Promise<DebutDeConnexion>) =>
  Promise.race([promesse, new Promise<never>((_, rejeter) => setTimeout(() => rejeter(new Error("le bouton tourne encore après 10 s")), 10_000))]);

test("un `gh` récent qui formule autrement son code et sa page : le code revient et la page s'ouvre", { skip: SANS_POSIX }, async (t) => {
  const gh = fauxGh(t, `echo "! Your device code is: WXYZ-5678" >&2\necho "  Go to https://github.com/login/device and enter it." >&2\nsleep 30`);
  const ouvertes: string[] = [];
  const connecter = tenirConnexionGitHub({ commande: async () => connexionGitHub(gh).command, env: process.env, ouvrir: (a) => ouvertes.push(a), apres: () => undefined });
  const debut = await dansQuelquesSecondes(connecter());
  assert.deepEqual(debut, { code: "WXYZ-5678", page: "https://github.com/login/device" });
  assert.deepEqual(ouvertes, ["https://github.com/login/device"]);
});
