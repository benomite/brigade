// Connecter cet ordinateur à GitHub d'un bouton (#1434) : le geste du runtime (`connexionGitHub`), lancé tel quel,
// sans terminal. Le code que `gh` donne revient à la vue ; sa page s'ouvre — par `gh` quand il attend Entrée, par
// l'app sinon ; la fin, réussie ou non, est dite. Un second clic pendant qu'il attend ne lance rien de plus.
// Contre un faux `gh` qui écrit ce que le vrai écrit, et attend qu'on le laisse finir.
import assert from "node:assert/strict";
import { chmodSync, existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test, type TestContext } from "node:test";
import { connexionGitHub } from "../../runtime/src/appairage/stations-du-chef.ts";
import { tenirConnexionGitHub, type FinDeConnexion } from "../src/connexion-github.ts";
import { SANS_POSIX } from "./aides/posix.ts";

const repertoire = (t: TestContext) => {
  const cree = mkdtempSync(join(tmpdir(), "brigade-app-connexion-"));
  t.after(() => rmSync(cree, { recursive: true, force: true }));
  return cree;
};

// Un fait, attendu : jamais une durée. La garde ne sert qu'à ce qu'un test cassé le dise.
async function jusqua(fait: () => boolean, garde = 60_000) {
  const fin = Date.now() + garde;
  while (!fait()) {
    if (Date.now() > fin) assert.fail("le fait attendu n'est pas arrivé");
    await new Promise((resoudre) => setTimeout(resoudre, 20));
  }
}

// `interactif` : il attend Entrée pour ouvrir la page lui-même, et note ce qu'il a lu ; sinon, il donne l'adresse.
function unFauxGh(t: TestContext, { interactif, code = 0, sansCode = false }: { interactif: boolean; code?: number; sansCode?: boolean }) {
  const dossier = repertoire(t);
  const gh = join(dossier, "gh");
  const page = interactif ? 'printf "Press Enter to open https://github.com/login/device in your browser... " >&2\nread ligne\necho "entree" >> "$D/lu"' : 'echo "Open this URL to continue in your web browser: https://github.com/login/device" >&2';
  const donne = sansCode ? 'echo "error connecting to api.github.com" >&2\nexit 1' : `printf '\\033[0;33m!\\033[0m First copy your one-time code: \\033[1mA1B2-C3D4\\033[0m\\n' >&2\n${page}`;
  writeFileSync(gh, `#!/bin/sh\nD="${dossier}"\necho "$@" >> "$D/appels"\n${donne}\nwhile [ ! -f "$D/fin" ]; do sleep 0.05; done\necho "✓ Logged in as chef" >&2\nexit ${code}\n`);
  chmodSync(gh, 0o755);
  const lignes = (fichier: string) => (existsSync(join(dossier, fichier)) ? readFileSync(join(dossier, fichier), "utf8").trim().split("\n") : []);
  return { gh, appels: () => lignes("appels"), lu: () => lignes("lu"), finir: () => writeFileSync(join(dossier, "fin"), "") };
}

function uneConnexion(gh: string) {
  const ouvertes: string[] = [];
  const fins: FinDeConnexion[] = [];
  const connecter = tenirConnexionGitHub({ commande: async () => connexionGitHub(gh).command, env: process.env, ouvrir: (adresse) => ouvertes.push(adresse), apres: (fin) => fins.push(fin) });
  return { connecter, ouvertes, fins };
}

test("`gh` attend Entrée : l'app la lui donne — il ouvre la page —, le code revient sans ses couleurs ; fini, c'est dit", { skip: SANS_POSIX }, async (t) => {
  const faux = unFauxGh(t, { interactif: true });
  const { connecter, ouvertes, fins } = uneConnexion(faux.gh);
  assert.deepEqual(await connecter(), { code: "A1B2-C3D4", page: "https://github.com/login/device" });
  assert.deepEqual(faux.appels(), [connexionGitHub(faux.gh).command.slice(1).join(" ")]);
  assert.deepEqual(faux.appels(), ["auth login --hostname github.com --web --git-protocol https"]);
  await jusqua(() => faux.lu().length === 1);
  assert.deepEqual(ouvertes, []);
  // Un second clic pendant qu'il attend : le même code, rien de lancé de plus.
  assert.deepEqual(await connecter(), { code: "A1B2-C3D4", page: "https://github.com/login/device" });
  assert.equal(faux.appels().length, 1);
  faux.finir();
  await jusqua(() => fins.length === 1);
  assert.deepEqual(fins, [{ connecte: true }]);
});

test("`gh` sans terminal donne l'adresse : c'est l'app qui ouvre la page", { skip: SANS_POSIX }, async (t) => {
  const faux = unFauxGh(t, { interactif: false });
  const { connecter, ouvertes, fins } = uneConnexion(faux.gh);
  assert.deepEqual(await connecter(), { code: "A1B2-C3D4", page: "https://github.com/login/device" });
  assert.deepEqual(ouvertes, ["https://github.com/login/device"]);
  faux.finir();
  await jusqua(() => fins.length === 1);
  // Fini, un clic relance.
  const relance = unFauxGh(t, { interactif: false, code: 1 });
  relance.finir();
  const suite = uneConnexion(relance.gh);
  assert.equal("code" in (await suite.connecter()), true);
  await jusqua(() => suite.fins.length === 1);
  assert.deepEqual(suite.fins, [{ refus: "GitHub sign-in did not finish (code 1): ✓ Logged in as chef.", detail: "! First copy your one-time code: A1B2-C3D4\nOpen this URL to continue in your web browser: https://github.com/login/device\n✓ Logged in as chef" }]);
});

test("un `gh` qui échoue avant de donner un code, ou absent : le refus en une phrase, le détail à part", { skip: SANS_POSIX }, async (t) => {
  const faux = unFauxGh(t, { interactif: false, sansCode: true });
  assert.deepEqual(await uneConnexion(faux.gh).connecter(), { refus: "GitHub sign-in did not start (code 1): error connecting to api.github.com.", detail: "error connecting to api.github.com" });
  const absent = join(repertoire(t), "gh");
  const rendu = await uneConnexion(absent).connecter();
  assert.equal("refus" in rendu && rendu.refus, `The GitHub CLI (\`${absent}\`) is not installed on this computer, so brigade cannot sign you in to GitHub.`);
});
