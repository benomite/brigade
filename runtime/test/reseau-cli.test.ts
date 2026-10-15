// `/brigade:init` écrit toujours `.claude/brigade/reseau`, avec les hôtes que
// le worktree-setup.sh du projet joint — registre d'un outil connu ou URL de
// dépendance.
import assert from "node:assert/strict";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { test, type TestContext } from "node:test";
import { lireDeclaration } from "../src/reseau.ts";
import { principal } from "../src/reseau-cli.ts";
import { appeler, repertoireTemporaire } from "./outils.ts";

function projet(t: TestContext, setup: string | null) {
  const dossier = repertoireTemporaire(t);
  mkdirSync(join(dossier, ".claude/brigade"), { recursive: true });
  if (setup !== null) writeFileSync(join(dossier, ".claude/brigade/worktree-setup.sh"), setup);
  const fichier = join(dossier, ".claude/brigade/reseau");
  const lancer = async () => {
    const cli = appeler(principal, [dossier], {});
    return { code: await cli.fin, sortie: cli.sortie() };
  };
  return { fichier, lancer };
}

test("un setup qui tire une dépendance d'une URL : le fichier existe et nomme l'hôte de l'URL, avec le registre de l'outil", async (t) => {
  const p = projet(t, '#!/usr/bin/env bash\n# https://exemple.org/ignoré\npnpm install --frozen-lockfile\npnpm add "https://cdn.sheetjs.com/xlsx-0.20.3/xlsx-0.20.3.tgz"\n');
  const { code } = await p.lancer();
  assert.equal(code, 0);
  const { hotes, problemes } = lireDeclaration(readFileSync(p.fichier, "utf8"));
  assert.deepEqual(problemes, []);
  assert.deepEqual(hotes, ["registry.npmjs.org", "cdn.sheetjs.com"]);
});

test("un setup sans hôte externe : le fichier existe, vide et commenté", async (t) => {
  const p = projet(t, "#!/usr/bin/env bash\necho \"export API_PORT=$((3000 + $1))\"\ngit clone https://github.com/x/y\n");
  await p.lancer();
  const texte = readFileSync(p.fichier, "utf8");
  assert.deepEqual(lireDeclaration(texte), { hotes: [], problemes: [] });
  assert.match(texte, /^# .*\n# Rien à ouvrir/);
});

test("le fichier absent est recréé à la relance ; un fichier posé à la main n'est jamais réécrit", async (t) => {
  const p = projet(t, "npm ci\n");
  await p.lancer();
  assert.ok(existsSync(p.fichier));
  writeFileSync(p.fichier, "# à la main\nautre.example.org\n");
  const relance = await p.lancer();
  assert.equal(readFileSync(p.fichier, "utf8"), "# à la main\nautre.example.org\n");
  assert.match(relance.sortie, /MANQUE registry\.npmjs\.org/);
});

test("sans worktree-setup.sh, ou avec un installeur inconnu : le fichier existe quand même, NON DÉTERMINÉ", async (t) => {
  for (const setup of [null, "brew install libvips\n"]) {
    const p = projet(t, setup);
    await p.lancer();
    assert.match(readFileSync(p.fichier, "utf8"), /NON DÉTERMINÉ/);
  }
});
