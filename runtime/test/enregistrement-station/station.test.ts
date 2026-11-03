// La vraie station (`station/main.ts`) s'enregistre sous le compte GitHub de
// sa machine dès son démarrage, sans aucune commande (#1705) ; arrêtée, l'app
// la lit indisponible ; redémarrée, de nouveau disponible, sous le même gist.
// GitHub est la doublure des gists du compte, lue comme l'app la lit.
// La station tuée net est un vrai process (`lancer`) ; les autres sont jouées
// dans le process du test (`jouerLaStation`) : leur démarrage par leur fichier,
// un vrai SIGTERM et le code de leur sortie se prouvent dans `station/main.test.ts`.
import assert from "node:assert/strict";
import { existsSync, mkdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { test, type TestContext } from "node:test";
import { FICHIER_LOCAL } from "../../src/enregistrement-station/enregistrer.ts";
import { lireLesStationsDuCompte, type StationEnregistree } from "../../src/enregistrement-station/stations-du-compte.ts";
import { ENV_GIT, FAUX_CLAUDE, jouerLaStation, lancer, repertoireTemporaire, temporaireDuFichier, type StationIci } from "../outils.ts";
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
// Elle ne le dit pas au bout d'un délai : une garde de 60 s de vraie horloge échouait (runs 41488425275, 41487125966,
// 41495763603) sur un runner Windows chargé, où la station mettait plus d'une minute à démarrer sans être en faute.
// L'attente finit par un fait — la ligne attendue, ou la mort de la station, que `attendre` rejette — ou, à défaut, par
// le délai du test, qui interrompt `t.signal` : la garde dit alors ce qu'elle attendait, avec la sortie de la station.
async function avecGarde<T>(t: TestContext, attente: Promise<T>, quoi: string, station: { sortie: () => string }): Promise<T> {
  const interrompu = () => console.error(`${quoi} : rien avant la fin du délai du test\n${station.sortie()}`);
  t.signal.addEventListener("abort", interrompu, { once: true });
  try {
    return await attente;
  } finally {
    t.signal.removeEventListener("abort", interrompu);
  }
}

async function attendreStation(stations: () => Promise<StationEnregistree[]>, condition: (station: StationEnregistree) => boolean, station: StationIci) {
  const limite = Date.now() + GARDE_MS;
  let finie = false;
  void station.fin.then(() => (finie = true));
  for (;;) {
    const [lue] = await stations();
    if (lue !== undefined && condition(lue)) return lue;
    assert.equal(finie, false, station.sortie());
    assert.ok(Date.now() < limite, `la station n'a pas écrit ce que le test attend : ${JSON.stringify(lue)}\n${station.sortie()}`);
    await new Promise((resoudre) => setTimeout(resoudre, 50));
  }
}

test("démarrée, la station est enregistrée sous le compte sans aucune commande ; redémarrée, elle rafraîchit le même gist", { timeout: 300_000 }, async (t) => {
  const { racine, env, stations } = uneMachine(t);

  const premiere = lancer(t, STATION, [], env);
  await avecGarde(t, premiere.attendre("station enregistrée sous le compte GitHub de sa machine"), "la première station ne dit pas qu'elle est enregistrée", premiere);
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
  await avecGarde(t, premiere.fin, "la première station tuée ne ferme pas ses tuyaux", premiere);

  const seconde = jouerLaStation(t, env);
  await avecGarde(t, seconde.attendre("station démarrée"), "la seconde station ne dit pas qu'elle a démarré", seconde);
  // Elle ne s'annonce pas de nouveau : elle reprend son gist, et le rafraîchit.
  const reprise = await attendreStation(stations, (station) => station.lastSeen !== enregistree.lastSeen, seconde);
  assert.equal(reprise.id, enregistree.id);
  assert.equal(reprise.available, true);
  assert.equal(reprise.registeredAt, enregistree.registeredAt);
  assert.equal((await stations()).length, 1);
  assert.equal(JSON.parse(readFileSync(join(racine, FICHIER_LOCAL), "utf8")).gist, enregistree.id);
  assert.doesNotMatch(seconde.sortie(), /station enregistrée sous le compte/);
});

// Le faux `gh` des gists est un script shell, que la station reçoit par une
// enveloppe `sh` (`jouerLaStation`).
test("arrêtée proprement, la station est indisponible à la lecture suivante ; redémarrée, de nouveau disponible sous le même gist", { skip: posixOnly("stops the registered station as on SIGTERM and expects it to write itself unavailable with its stop time, then restarts it under the same gist; the station is played in the test's process, and its gh reaches the shell fake of the gists through a sh wrapper") }, async (t) => {
  const { env, stations } = uneMachine(t);

  const premiere = jouerLaStation(t, env);
  await premiere.attendre("station enregistrée sous le compte GitHub de sa machine");
  const [enregistree] = await stations();
  assert.ok(enregistree);

  premiere.signaler("SIGTERM");
  assert.equal(await premiere.fin, 0);
  const [arretee] = await stations();
  assert.equal(arretee?.id, enregistree.id);
  assert.equal(arretee?.available, false);
  assert.ok(arretee?.stoppedAt);

  const seconde = jouerLaStation(t, env);
  await seconde.attendre("station démarrée");
  const reprise = await attendreStation(stations, (station) => station.available, seconde);
  assert.equal(reprise.id, enregistree.id);
  assert.equal(reprise.stoppedAt, null);
  assert.equal((await stations()).length, 1);
  seconde.signaler("SIGTERM");
  assert.equal(await seconde.fin, 0);
});

test("station.test.ts ne laisse rien dans le répertoire temporaire", rienNeReste);
