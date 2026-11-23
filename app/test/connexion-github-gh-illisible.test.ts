// #4084, critère 2 : un `gh` qu'on ne sait pas lire : le bouton cesse de tourner en quelques secondes, une phrase, le détail au survol.
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

test("un `gh` illisible qui reste en vie : un refus en une phrase, ce que `gh` a dit en détail", { skip: SANS_POSIX }, async (t) => {
  const gh = fauxGh(t, `echo "Quelque chose d'inattendu: ZZZ" >&2\nsleep 30`);
  const connecter = tenirConnexionGitHub({ commande: async () => connexionGitHub(gh).command, env: process.env, ouvrir: () => undefined, apres: () => undefined });
  const debut = await dansQuelquesSecondes(connecter());
  assert.ok("refus" in debut, "un refus, pas une attente");
  assert.equal(debut.refus.trim().split("\n").length, 1);
  assert.match(debut.refus, /\.$/);
  assert.match(debut.detail ?? "", /Quelque chose d'inattendu: ZZZ/);
});
