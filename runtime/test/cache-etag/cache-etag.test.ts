// Le cache des ETags survit à un redémarrage de la station.
import assert from "node:assert/strict";
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { test, type TestContext } from "node:test";
import { ouvrirCacheEtag } from "../../src/cache-etag/cache-etag.ts";
import { gardeesDuProcess, ouvrirGitHub, type Transport } from "../../src/github.ts";
import { repertoireTemporaire } from "../outils.ts";

const ETAG = 'W/"v1"';
const reponse = (statut: number, corps: unknown) =>
  ({ erreur: null, stderr: "", stdout: [`HTTP/2.0 ${statut}`, `Etag: ${ETAG}`, "", JSON.stringify(corps)].join("\r\n") });

function monde(t: TestContext) {
  gardeesDuProcess.vider();
  t.after(() => gardeesDuProcess.vider());
  const fichier = join(repertoireTemporaire(t), "cache-etag.json");
  const vus: string[][] = [];
  const transport: Transport = async (args) => {
    vus.push(args);
    return args.includes(`If-None-Match: ${ETAG}`) ? reponse(304, "") : reponse(200, { number: 7, title: "T", state: "open", labels: [] });
  };
  const github = () => ouvrirGitHub({ depot: "o/redemarrage", bin: "gh-redemarrage", transport });
  const lignes: string[] = [];
  const cache = (extra = {}) => ouvrirCacheEtag({ fichier, dire: (l) => lignes.push(l), ...extra });
  return { fichier, vus, github, lignes, cache };
}

test("après un redémarrage, la lecture part avec son ETag et le 304 sert la réponse gardée", async (t) => {
  const { vus, github, cache } = monde(t);
  await github().issue(7);
  assert.ok(!vus[0]!.some((a) => a.startsWith("If-None-Match")));
  assert.equal(cache().enregistrer(), true);

  gardeesDuProcess.vider(); // le process neuf n'a rien en mémoire
  assert.equal(cache().charger(), 1);
  const issue = await github().issue(7);
  assert.ok(vus.at(-1)!.includes(`If-None-Match: ${ETAG}`));
  assert.equal(issue?.number, 7);
  assert.equal(issue?.title, "T");
});

test("un fichier corrompu : la station démarre à vide et le dit en une ligne", async (t) => {
  const { fichier, vus, github, lignes, cache } = monde(t);
  writeFileSync(fichier, '{"version":1,"entrees":[["a",{"etag":');
  assert.equal(cache().charger(), 0);
  assert.equal(lignes.length, 1);
  assert.match(lignes[0]!, /corrompu/);
  await github().issue(7);
  assert.ok(!vus[0]!.some((a) => a.startsWith("If-None-Match")));
});

test("un fichier absent se lit vide, sans rien dire", (t) => {
  const { lignes, cache } = monde(t);
  assert.equal(cache().charger(), 0);
  assert.deepEqual(lignes, []);
});

test("une écriture interrompue laisse l'ancien fichier valide en place", async (t) => {
  const { fichier, github, lignes, cache } = monde(t);
  await github().issue(7);
  assert.equal(cache().enregistrer(), true);
  const avant = readFileSync(fichier, "utf8");

  const interrompue = cache({ ecrire: (f: string, contenu: string) => { writeFileSync(f, contenu.slice(0, 10)); throw new Error("coupure"); } });
  assert.equal(interrompue.enregistrer(), false);
  assert.equal(readFileSync(fichier, "utf8"), avant);
  assert.match(lignes.at(-1)!, /non écrit/);

  gardeesDuProcess.vider();
  assert.equal(cache().charger(), 1);
});

test("l'arrêt propre écrit une dernière fois", async (t) => {
  const { fichier, github, cache } = monde(t);
  const ouvert = cache({ intervalleMs: 3_600_000 });
  ouvert.demarrer();
  await github().issue(7);
  ouvert.arreter();
  assert.equal(JSON.parse(readFileSync(fichier, "utf8")).entrees.length, 1);
});
