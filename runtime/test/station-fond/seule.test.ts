// Une seule station par ordinateur (#3630) : un second process de station sur le même répertoire refuse de démarrer, et
// la première continue de tourner ; partie, la suivante démarre.
import assert from "node:assert/strict";
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { test, type TestContext } from "node:test";
import { garderLaStationSeule } from "../../src/station-fond/seule.ts";
import { ENV_GIT, FAUX_CLAUDE, lancer, repertoireTemporaire, temporaireDuFichier } from "../outils.ts";

const rienNeReste = temporaireDuFichier();
const STATION = join(import.meta.dirname, "../../src/station/main.ts");
const GH_HORS_LIGNE = join(import.meta.dirname, "../aides/gh-hors-ligne.sh");
const REFUS = 2;

function uneMachine(t: TestContext) {
  const machine = repertoireTemporaire(t);
  const racine = join(machine, "station");
  const compte = join(machine, "compte");
  mkdirSync(racine);
  mkdirSync(compte);
  const env = {
    ...ENV_GIT,
    BRIGADE_GH_BIN: GH_HORS_LIGNE,
    HOME: compte,
    BRIGADE_STATION_DIR: racine,
    BRIGADE_STATION_NOM: "ordi",
    BRIGADE_CLAUDE_BIN: FAUX_CLAUDE,
    BRIGADE_MAX_LOAD_PER_CORE: "1000000",
    BRIGADE_MIN_FREE_MEMORY_MB: "0",
    BRIGADE_MIN_FREE_DISK_MB: "0",
  };
  return { racine, env };
}

test("une station tient son répertoire : une seconde prise dit qu'une autre station tourne ; rendue, elle se reprend", (t) => {
  const { racine } = uneMachine(t);
  const premiere = garderLaStationSeule(racine);
  assert.ok(!("refus" in premiere));
  const seconde = garderLaStationSeule(racine);
  assert.ok("refus" in seconde);
  assert.match(seconde.refus, /une autre station tourne déjà sur .*station — une seule par ordinateur/);
  premiere.relacher();
  const reprise = garderLaStationSeule(racine);
  assert.ok(!("refus" in reprise));
  reprise.relacher();
});

// La première station est ce process-ci, qui tient le répertoire comme main.ts le tient : une seule station se lance,
// et la règle des 2 s tient.
test("un process de station sur un répertoire qu'une autre station tient refuse de démarrer, et la première le tient toujours", async (t) => {
  const { racine, env } = uneMachine(t);
  const premiere = garderLaStationSeule(racine);
  assert.ok(!("refus" in premiere));
  t.after(() => premiere.relacher());
  const seconde = lancer(t, STATION, [], env);
  assert.equal(await seconde.fin, REFUS);
  assert.match(seconde.sortie(), /refus de démarrer la station — une autre station tourne déjà sur .* — une seule par ordinateur/);
  assert.doesNotMatch(seconde.sortie(), /station démarrée/);
  assert.ok("refus" in garderLaStationSeule(racine));
});

test("seule.test.ts ne laisse rien dans le répertoire temporaire", rienNeReste);
