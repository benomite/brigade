// Le quota Max n'est consommé que par le binaire `claude` officiel : rien
// dans le runtime ne parle à Anthropic autrement. Ce que la connexion Max
// ajoute à la station — sa veille, son branchement sur les cuisines, l'étape
// de connexion — ne lance rien d'autre que `claude` et le renouvellement.
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
import { test } from "node:test";

const RUNTIME = join(import.meta.dirname, "../..");
const SRC = join(RUNTIME, "src");
const sources = (repertoire: string): string[] =>
  readdirSync(repertoire, { withFileTypes: true }).flatMap((entree) => (entree.isDirectory() ? sources(join(repertoire, entree.name)) : entree.name.endsWith(".ts") ? [join(repertoire, entree.name)] : []));
const lues = sources(SRC).map((fichier) => ({ nom: relative(SRC, fichier), texte: readFileSync(fichier, "utf8") }));
const qui = (motif: RegExp) => lues.filter(({ texte }) => motif.test(texte)).map(({ nom }) => nom).sort();

test("le runtime n'embarque aucune bibliothèque : ni SDK d'Anthropic, ni client d'API", () => {
  const paquet = JSON.parse(readFileSync(join(RUNTIME, "package.json"), "utf8")) as { dependencies?: Record<string, string> };
  assert.deepEqual(Object.keys(paquet.dependencies ?? {}), []);
  assert.deepEqual(qui(/from\s+["']@anthropic-ai\//), []);
});

test("aucun code du runtime ne joint l'API d'Anthropic : son nom n'y sert qu'à la porte réseau, qui laisse passer `claude`", () => {
  assert.deepEqual(qui(/anthropic\.com/), ["reseau.ts"]);
  // claude.ai : la porte, et l'installeur officiel du binaire `claude`.
  assert.deepEqual(qui(/https:\/\/claude\.ai/), ["connexion-max/connecter-cli.ts", "installation.ts"]);
});

test("la veille de la connexion Max et son branchement sur les cuisines ne lancent rien et ne joignent rien : ils lisent un fichier", () => {
  for (const nom of ["connexion-max/connexion.ts", "connexion-max/veille.ts", "connexion-max/cuisine.ts", "connexion-max/connecter.ts"]) {
    const texte = lues.find((lue) => lue.nom === nom)?.texte ?? "";
    assert.doesNotMatch(texte, /from\s+["']node:(child_process|http|https|net|tls|dgram)["']|\bfetch\s*\(/, nom);
  }
  // L'étape lance par `lancer` : `claude`, le renouvellement, et — en root,
  // si `claude` manque — son installeur officiel.
  const cli = lues.find((lue) => lue.nom === "connexion-max/connecter-cli.ts")?.texte ?? "";
  assert.deepEqual([...cli.matchAll(/lancer\("([^"]+)"/g)].map((appel) => appel[1]).sort(), ["bash", "mkdir"]);
  assert.match(cli, /connecterMax\(\{ lancer, claude: "claude",/);
});
