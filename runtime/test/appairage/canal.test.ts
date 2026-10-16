// Le canal de la station vers l'app, par `gh api` — ici une doublure qui tient
// les gists dans un répertoire — et la station réelle qui s'en sert : elle
// affiche son code, publie son état, et écrit l'heure de son arrêt.
import assert from "node:assert/strict";
import { mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { test, type TestContext } from "node:test";
import { canalGitHub } from "../../src/appairage/canal.ts";
import { empreinte, FICHIER_APPAIRAGE, FICHIER_STATION, type DocumentStation } from "../../src/appairage/document.ts";
import { lancer, repertoireTemporaire, temporaireDuFichier } from "../outils.ts";

const rienNeReste = temporaireDuFichier();

const FAUX_GH = join(import.meta.dirname, "faux-gh-gists.ts");
const STATION = join(import.meta.dirname, "../../src/station/main.ts");
const SOURCES = join(import.meta.dirname, "../../src/appairage");

// GitHub : un répertoire, où la doublure range les gists du compte.
function unGitHub(t: TestContext) {
  const repertoire = repertoireTemporaire(t);
  const avant = process.env.FAUX_GISTS;
  process.env.FAUX_GISTS = repertoire;
  t.after(() => (avant === undefined ? delete process.env.FAUX_GISTS : (process.env.FAUX_GISTS = avant)));
  const gists = () => readdirSync(repertoire).filter((nom) => nom.endsWith(".gist.json"));
  const lire = (fichier: string) => JSON.parse(readFileSync(join(repertoire, fichier), "utf8")) as { id: string; description: string; public: boolean; files: Record<string, { content: string }> };
  return { repertoire, gists, lire, appels: () => readFileSync(join(repertoire, "appels"), "utf8") };
}

test("le canal crée un gist secret, en réécrit un fichier sans toucher aux autres, et le relit", async (t) => {
  const github = unGitHub(t);
  const canal = canalGitHub({ gh: FAUX_GH });
  const id = await canal.creer("brigade — station box", { [FICHIER_STATION]: "{}" });
  const [fichier] = github.gists();
  assert.ok(fichier);
  assert.equal(github.lire(fichier).id, id);
  assert.equal(github.lire(fichier).public, false);
  assert.equal(github.lire(fichier).description, "brigade — station box");
  // L'app y ajoute son fichier ; la station réécrit le sien.
  const gist = github.lire(fichier);
  gist.files[FICHIER_APPAIRAGE] = { content: "appairée" };
  writeFileSync(join(github.repertoire, fichier), JSON.stringify(gist));
  assert.equal(await canal.ecrire(id, { [FICHIER_STATION]: '{"signe":2}' }), "ecrit");
  assert.deepEqual(await canal.lire(id), { [FICHIER_STATION]: '{"signe":2}', [FICHIER_APPAIRAGE]: "appairée" });
});

test("un gist supprimé se dit absent ; une panne de GitHub lève, et nomme ce que gh a dit", async (t) => {
  const github = unGitHub(t);
  const canal = canalGitHub({ gh: FAUX_GH });
  assert.equal(await canal.lire("disparu"), null);
  assert.equal(await canal.ecrire("disparu", { [FICHIER_STATION]: "{}" }), "absent");
  writeFileSync(join(github.repertoire, "panne"), "");
  await assert.rejects(canal.lire("disparu"), /error connecting to api\.github\.com/);
  await assert.rejects(canal.creer("x", {}), /error connecting to api\.github\.com/);
});

test("la station réelle affiche son code, publie « aucun projet » sur GitHub, et ne réécrit pas pour son arrêt dans la minute de son écriture", async (t) => {
  const github = unGitHub(t);
  const racine = join(repertoireTemporaire(t), "station");
  mkdirSync(racine);
  const station = lancer(t, STATION, [], { BRIGADE_STATION_DIR: racine, BRIGADE_GH_BIN: FAUX_GH, FAUX_GISTS: github.repertoire, BRIGADE_STATION_NOM: "box", BRIGADE_STATION_VERSION: "1.4.0" });
  await station.attendre("station à appairer");
  const code = /tape ce code dans l'app : ([0-9A-Z]{4}-[0-9A-Z]{4})/.exec(station.sortie())?.[1];
  assert.ok(code, station.sortie());
  const [fichier] = github.gists();
  assert.ok(fichier);
  const document = () => JSON.parse(github.lire(fichier).files[FICHIER_STATION]?.content ?? "null") as DocumentStation;
  assert.equal(document().nom, "box");
  assert.equal(document().version, "1.4.0");
  assert.deepEqual(document().projets, []);
  assert.equal(document().arreteeLe, null);
  assert.equal(document().appairage?.empreinte, empreinte(code));

  station.process.kill("SIGTERM");
  assert.equal(await station.fin, 0);
  // Arrêtée moins d'une minute après son écriture, elle ne la double pas : l'écart
  // minimal l'emporte, et l'heure de l'arrêt s'écrit passé cet écart (presence.test.ts).
  assert.equal(document().arreteeLe, null);
  // Tout est passé par `gh api`, sur les gists du compte, et rien d'autre.
  assert.ok(github.appels().split("\n").filter(Boolean).every((appel) => /^api (-X (POST|PATCH) )?\/gists(\/[a-z0-9]+)?( --input -)?$/.test(appel)), github.appels());
});

test("la station ne joint aucune autre machine : son appairage et sa présence ne passent que par `gh`", () => {
  for (const nom of readdirSync(SOURCES)) {
    const source = readFileSync(join(SOURCES, nom), "utf8");
    for (const interdit of [/node:(net|http|https|dgram|tls)\b/, /\bfetch\(/, /\bWebSocket\b/, /\bssh\b/]) assert.doesNotMatch(source, interdit, `${nom} : ${interdit}`);
  }
});

test("canal.test.ts ne laisse rien dans le répertoire temporaire", rienNeReste);
