// `/brigade:init` écrit `.brigade/try.json` depuis ce que le dépôt montre
// (`essai-projet/declaration-cli.ts`, #3559), joué ici comme l'init le lance :
// un process sur le dossier du projet. Un fichier déjà là reste octet pour
// octet ; un dépôt qui ne dit pas comment il s'essaie n'en reçoit aucun.
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { chmodSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { after, test, type TestContext } from "node:test";
import { ENV_ENFANT, repertoireTemporaire, temporaireDuFichier } from "../outils.ts";

const rienNeReste = temporaireDuFichier();

const CLI = join(import.meta.dirname, "../../src/essai-projet/declaration-cli.ts");
const DECLARATION = ".brigade/try.json";

function projet(t: TestContext, fichiers: Record<string, string>): string {
  const dossier = repertoireTemporaire(t);
  for (const [chemin, contenu] of Object.entries(fichiers)) {
    mkdirSync(dirname(join(dossier, chemin)), { recursive: true });
    writeFileSync(join(dossier, chemin), contenu);
  }
  return dossier;
}

function lancer(...args: string[]): Promise<{ code: number; sortie: string; erreur: string }> {
  return new Promise((resoudre) => {
    execFile(process.execPath, [CLI, ...args], { env: ENV_ENFANT, encoding: "utf8" }, (erreur, sortie, erreurs) => {
      resoudre({ code: erreur === null ? 0 : Number(erreur.code), sortie, erreur: erreurs });
    });
  });
}

test("a repository with an npm `dev` script gets `.brigade/try.json` with a `command` key", async (t) => {
  const dossier = projet(t, { "package.json": JSON.stringify({ scripts: { dev: "vite --port 5173" } }) });
  const { code, sortie, erreur } = await lancer(dossier);
  assert.equal(code, 0, erreur);
  assert.deepEqual(JSON.parse(readFileSync(join(dossier, DECLARATION), "utf8")), { command: "npm install && npm run dev", url: "http://localhost:5173" });
  assert.match(sortie, /try\.json : écrit/);
});

test("an Android app gets the declaration of a project that cannot be tried, with its reason", async (t) => {
  const dossier = projet(t, { "app/src/main/AndroidManifest.xml": "<manifest/>" });
  const { code, erreur } = await lancer(dossier);
  assert.equal(code, 0, erreur);
  const lue = JSON.parse(readFileSync(join(dossier, DECLARATION), "utf8"));
  assert.equal(lue.tryable, false);
  assert.match(lue.reason, /Android/);
});

test("a repository that already has `.brigade/try.json` keeps it byte-identical, even unreadable", async (t) => {
  for (const deja of ['{"command":"make run"}', "{ pas du json\r\n"]) {
    const dossier = projet(t, { "package.json": JSON.stringify({ scripts: { dev: "vite" } }), [DECLARATION]: deja });
    const { code, sortie, erreur } = await lancer(dossier);
    assert.equal(code, 0, erreur);
    assert.equal(readFileSync(join(dossier, DECLARATION), "utf8"), deja);
    assert.match(sortie, /déjà là, laissé tel quel/);
  }
});

test("a repository with no readable way to run it gets no file", async (t) => {
  const dossier = projet(t, { "README.md": "# notes\n" });
  const { code, sortie, erreur } = await lancer(dossier);
  assert.equal(code, 0, erreur);
  assert.equal(existsSync(join(dossier, ".brigade")), false);
  assert.match(sortie, /aucune déclaration écrite/);
});

test("a repository it cannot read gets no file", { skip: process.platform === "win32" || process.getuid?.() === 0 }, async (t) => {
  const dossier = projet(t, { "package.json": JSON.stringify({ scripts: { dev: "vite" } }) });
  chmodSync(join(dossier, "package.json"), 0o000);
  t.after(() => chmodSync(join(dossier, "package.json"), 0o644));
  const { code, erreur } = await lancer(dossier);
  assert.equal(code, 0, erreur);
  assert.equal(existsSync(join(dossier, DECLARATION)), false);
});

test("called without a folder, or on one that does not exist: usage error, nothing written", async (t) => {
  assert.equal((await lancer()).code, 64);
  assert.equal((await lancer(join(repertoireTemporaire(t), "absent"))).code, 64);
});

// Rien ne reste dans le répertoire temporaire du fichier : vérifié après ses
// tests, par un hook qui fait échouer le fichier s'il y reste quelque chose.
after(rienNeReste);
