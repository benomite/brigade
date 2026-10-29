// La vraie station (`station/main.ts`) s'enregistre sous le compte GitHub de
// sa machine dès son démarrage, sans aucune commande (#1705) ; arrêtée, l'app
// la lit indisponible ; redémarrée, de nouveau disponible, sous le même gist.
// GitHub est la doublure des gists du compte, lue comme l'app la lit.
import assert from "node:assert/strict";
import { existsSync, mkdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { test, type TestContext } from "node:test";
import { FICHIER_LOCAL } from "../../src/enregistrement-station/enregistrer.ts";
import { lireLesStationsDuCompte, type StationEnregistree } from "../../src/enregistrement-station/stations-du-compte.ts";
import { ENV_GIT, FAUX_CLAUDE, lancer, repertoireTemporaire, temporaireDuFichier } from "../outils.ts";
import { FAUX_GH_GISTS } from "../appairage/doublure-des-gists.ts";
import { posixOnly } from "../support/plateforme.ts";

const rienNeReste = temporaireDuFichier();

const STATION = join(import.meta.dirname, "../../src/station/main.ts");

function uneMachine(t: TestContext) {
  const machine = repertoireTemporaire(t);
  const racine = join(machine, "station");
  const compte = join(machine, "compte");
  // GitHub, hors de la machine.
  const gists = repertoireTemporaire(t);
  mkdirSync(racine);
  mkdirSync(compte);
  const env = {
    ...ENV_GIT,
    BRIGADE_GH_BIN: FAUX_GH_GISTS,
    FAUX_GISTS: gists,
    HOME: compte,
    BRIGADE_STATION_DIR: racine,
    BRIGADE_STATION_NOM: "box",
    BRIGADE_STATION_VERSION: "1.4.0",
    BRIGADE_CLAUDE_BIN: FAUX_CLAUDE,
    BRIGADE_MAX_LOAD_PER_CORE: "1000000",
    BRIGADE_MIN_FREE_MEMORY_MB: "0",
    BRIGADE_MIN_FREE_DISK_MB: "0",
  };
  // Les stations du compte, telles que l'app connectée au même compte les lit.
  const stations = async (): Promise<StationEnregistree[]> => {
    const lu = await lireLesStationsDuCompte({ gh: FAUX_GH_GISTS, env: { ...process.env, FAUX_GISTS: gists } });
    assert.equal(lu.state, "listed", JSON.stringify(lu));
    return lu.state === "listed" ? lu.stations : [];
  };
  return { racine, env, stations };
}

const plateforme = process.platform === "darwin" ? "macos" : process.platform === "win32" ? "windows" : process.platform;

// Lit les stations du compte jusqu'à ce que l'une remplisse la condition : la station écrit de son
// côté, sans rien dire au test. La garde est large (le délai du test est de 120 s) mais elle nomme
// ce qu'elle a vu : une attente muette jusqu'au délai du test ne dit pas laquelle des écritures manque.
const GARDE_MS = 90_000;
// Les attentes d'avant : sous Windows (job « tests (4/4) », runs 40777165597 et 40773811989), ce test restait muet
// jusqu'à ses 120 s, sans dire laquelle de ses attentes ne venait pas. Chacune nomme maintenant ce qu'elle attendait.
const ATTENTE_MS = 60_000;

async function avecGarde<T>(attente: Promise<T>, quoi: string, station: { sortie: () => string }): Promise<T> {
  let minuteur: NodeJS.Timeout | undefined;
  const garde = new Promise<never>((_, rejeter) => {
    minuteur = setTimeout(() => rejeter(new Error(`${quoi} : rien en ${ATTENTE_MS / 1000} s\n${station.sortie()}`)), ATTENTE_MS);
  });
  try {
    return await Promise.race([attente, garde]);
  } finally {
    clearTimeout(minuteur);
  }
}

async function attendreStation(stations: () => Promise<StationEnregistree[]>, condition: (station: StationEnregistree) => boolean, station: { process: { exitCode: number | null }; sortie: () => string }) {
  const limite = Date.now() + GARDE_MS;
  for (;;) {
    const [lue] = await stations();
    if (lue !== undefined && condition(lue)) return lue;
    assert.equal(station.process.exitCode, null, station.sortie());
    assert.ok(Date.now() < limite, `la station n'a pas écrit ce que le test attend : ${JSON.stringify(lue)}\n${station.sortie()}`);
    await new Promise((resoudre) => setTimeout(resoudre, 50));
  }
}

test("démarrée, la station est enregistrée sous le compte sans aucune commande ; redémarrée, elle rafraîchit le même gist", { timeout: 300_000 }, async (t) => {
  const { racine, env, stations } = uneMachine(t);

  const premiere = lancer(t, STATION, [], env);
  await avecGarde(premiere.attendre("station enregistrée sous le compte GitHub de sa machine"), "la première station ne dit pas qu'elle est enregistrée", premiere);
  const [enregistree, ...autres] = await stations();
  assert.deepEqual(autres, []);
  assert.ok(enregistree);
  assert.equal(enregistree.name, "box");
  assert.equal(enregistree.version, "1.4.0");
  assert.equal(enregistree.platform, plateforme);
  assert.equal(enregistree.available, true);
  assert.equal(enregistree.stoppedAt, null);
  assert.match(premiere.sortie(), new RegExp(`\\(gist ${enregistree.id}\\)`));
  assert.ok(existsSync(join(racine, FICHIER_LOCAL)));

  // Tuée net — sur toute plateforme : elle n'écrit rien de son arrêt.
  premiere.process.kill("SIGKILL");
  await avecGarde(premiere.fin, "la première station tuée ne ferme pas ses tuyaux", premiere);

  const seconde = lancer(t, STATION, [], env);
  await avecGarde(seconde.attendre("station démarrée"), "la seconde station ne dit pas qu'elle a démarré", seconde);
  // Elle ne s'annonce pas de nouveau : elle reprend son gist, et le rafraîchit.
  const reprise = await attendreStation(stations, (station) => station.lastSeen !== enregistree.lastSeen, seconde);
  assert.equal(reprise.id, enregistree.id);
  assert.equal(reprise.available, true);
  assert.equal(reprise.registeredAt, enregistree.registeredAt);
  assert.equal((await stations()).length, 1);
  assert.equal(JSON.parse(readFileSync(join(racine, FICHIER_LOCAL), "utf8")).gist, enregistree.id);
  assert.doesNotMatch(seconde.sortie(), /station enregistrée sous le compte/);
});

// Sous Windows, `kill("SIGTERM")` termine le process sans que son gestionnaire tourne : l'arrêt
// propre de la station n'y est pas un signal.
test("arrêtée proprement, la station est indisponible à la lecture suivante ; redémarrée, de nouveau disponible sous le même gist", { skip: posixOnly("stops the registered station with SIGTERM and expects it to write itself unavailable with its stop time, then restarts it under the same gist; on Windows kill('SIGTERM') ends the station without running its handler, so it writes nothing of its stop") }, async (t) => {
  const { env, stations } = uneMachine(t);

  const premiere = lancer(t, STATION, [], env);
  await premiere.attendre("station enregistrée sous le compte GitHub de sa machine");
  const [enregistree] = await stations();
  assert.ok(enregistree);

  premiere.process.kill("SIGTERM");
  assert.equal(await premiere.fin, 0);
  const [arretee] = await stations();
  assert.equal(arretee?.id, enregistree.id);
  assert.equal(arretee?.available, false);
  assert.ok(arretee?.stoppedAt);

  const seconde = lancer(t, STATION, [], env);
  await seconde.attendre("station démarrée");
  const reprise = await attendreStation(stations, (station) => station.available, seconde);
  assert.equal(reprise.id, enregistree.id);
  assert.equal(reprise.stoppedAt, null);
  assert.equal((await stations()).length, 1);
  seconde.process.kill("SIGTERM");
  assert.equal(await seconde.fin, 0);
});

test("station.test.ts ne laisse rien dans le répertoire temporaire", rienNeReste);
