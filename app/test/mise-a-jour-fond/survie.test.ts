// Une mise à jour de l'app ne coupe ni la station ni son cook (#3632) : l'app qui se ferme pour s'installer
// laisse la station en route, l'app rouverte la reprend sans en lancer une seconde, et son arrêt suivant
// l'arrête vraiment. De vrais process : la station d'essai joue l'enveloppe de l'app, comme en production.
import assert from "node:assert/strict";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { test, type TestContext } from "node:test";
import { jusqua, repertoireTemporaire } from "../../../runtime/test/outils.ts";
import { tenirStationLocale } from "../../src/poste/station.ts";
import { reprendreLaSurvivante } from "../../src/mise-a-jour-fond/survie.ts";
import { CACHE_DE_COMPILATION } from "../aides/cache-de-compilation.ts";
import { SANS_POSIX } from "../aides/posix.ts";

// Une station d'essai : elle dit son pid dans `en-service`, et ne s'arrête que sur un SIGTERM.
const STATION = `import { renameSync, writeFileSync } from "node:fs";
import { join } from "node:path";
const fichier = join(process.env.BRIGADE_STATION_DIR, "en-service");
writeFileSync(fichier + ".neuf", JSON.stringify({ version: "1", pid: process.pid, depuis: new Date().toISOString(), servis: [], refuses: {} }));
renameSync(fichier + ".neuf", fichier);
console.log("en service");
// Elle continue de parler : l'app partie, ses tuyaux sont fermés (EPIPE), ce qui ne doit pas la couper.
const veille = setInterval(() => { console.log("encore là"); console.error("encore là"); }, 100);
process.on("SIGTERM", () => { clearInterval(veille); process.exit(0); });
`;

const SURVIT = "survit-a-l-app";
const vivant = (pid: number) => {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
};

function ouvrir(t: TestContext, racine: string, principal: string, pid: number) {
  const lignes: string[] = [];
  const tenue = tenirStationLocale({
    node: process.execPath,
    principal,
    racine,
    env: { PATH: process.env.PATH, ...CACHE_DE_COMPILATION },
    dire: (ligne) => void lignes.push(ligne),
    appairer: () => assert.fail("une station d'essai n'affiche aucun code"),
    pid,
    relanceMs: 50,
    gardeMs: 5_000,
  });
  t.after(() => tenue.arreter());
  return { tenue, dit: () => lignes.join("\n") };
}

test("l'app fermée pour sa mise à jour laisse la station en route ; l'app rouverte la reprend sans en lancer une seconde, puis l'arrête", { skip: SANS_POSIX }, async (t) => {
  const machine = repertoireTemporaire(t);
  const racine = join(machine, "station");
  const principal = join(machine, "runtime", "src", "station", "main.ts");
  mkdirSync(join(machine, "runtime", "src", "station"), { recursive: true });
  writeFileSync(principal, STATION);
  const enService = () => JSON.parse(readFileSync(join(racine, "en-service"), "utf8")) as { pid: number };

  // La première app : la station tourne, puis l'app se ferme pour s'installer.
  const premiere = ouvrir(t, racine, principal, 900_001);
  await jusqua(() => premiere.dit().includes("en service"));
  const pid = enService().pid;
  await premiere.tenue.arreter({ laisser: true });
  // La station, et son cook avec elle, n'a pas été coupée : l'entrée fermée ne l'arrête plus, ni ses lignes écrites vers l'app partie.
  await new Promise((resoudre) => setTimeout(resoudre, 600));
  assert.equal(vivant(pid), true);

  // La nouvelle app : la même station est reprise, pas de seconde.
  const seconde = ouvrir(t, racine, principal, 900_002);
  await jusqua(() => seconde.dit().includes("kept running while the app updated"));
  assert.equal(seconde.tenue.tourne(), true);
  assert.equal(enService().pid, pid);

  // Reprise, elle s'arrête à l'arrêt de l'app, comme une autre.
  await seconde.tenue.arreter();
  assert.equal(vivant(pid), false);
});

test("deux mises à jour de l'app de suite : la station reprise reste en route, et la troisième app la reprend encore", { skip: SANS_POSIX }, async (t) => {
  const machine = repertoireTemporaire(t);
  const racine = join(machine, "station");
  const principal = join(machine, "runtime", "src", "station", "main.ts");
  mkdirSync(join(machine, "runtime", "src", "station"), { recursive: true });
  writeFileSync(principal, STATION);
  const enService = () => JSON.parse(readFileSync(join(racine, "en-service"), "utf8")) as { pid: number };

  const premiere = ouvrir(t, racine, principal, 900_011);
  await jusqua(() => premiere.dit().includes("en service"));
  const pid = enService().pid;
  await premiere.tenue.arreter({ laisser: true });
  const seconde = ouvrir(t, racine, principal, 900_012);
  await jusqua(() => seconde.dit().includes("kept running while the app updated"));
  // La seconde app, qui n'a que la station reprise, se ferme à son tour pour une mise à jour.
  await seconde.tenue.arreter({ laisser: true });
  assert.equal(vivant(pid), true);
  const troisieme = ouvrir(t, racine, principal, 900_013);
  await jusqua(() => troisieme.dit().includes("kept running while the app updated"));
  assert.equal(enService().pid, pid);
  await troisieme.tenue.arreter();
  assert.equal(vivant(pid), false);
});

test("sans marque, ou sans station vivante derrière elle, rien n'est repris — et la marque se lève", (t: TestContext) => {
  const racine = repertoireTemporaire(t);
  assert.equal(reprendreLaSurvivante(racine, () => true), undefined);
  writeFileSync(join(racine, SURVIT), "x\n");
  assert.equal(reprendreLaSurvivante(racine, () => true), undefined);
  writeFileSync(join(racine, SURVIT), "x\n");
  const depuis = Date.parse("2026-01-01T10:00:00Z");
  writeFileSync(join(racine, "en-service"), JSON.stringify({ pid: 4242, depuis: new Date(depuis).toISOString() }));
  assert.equal(reprendreLaSurvivante(racine, () => false, () => depuis - 1000), undefined);
  writeFileSync(join(racine, SURVIT), "x\n");
  assert.equal(reprendreLaSurvivante(racine, () => true, () => depuis - 1000), 4242);
  assert.equal(reprendreLaSurvivante(racine, () => true, () => depuis - 1000), undefined);
});

test("une marque périmée dont le pid a été réutilisé par un autre process n'est pas reprise (elle ne sera jamais tuée)", (t: TestContext) => {
  const racine = repertoireTemporaire(t);
  const depuis = Date.parse("2026-01-01T10:00:00Z");
  writeFileSync(join(racine, "en-service"), JSON.stringify({ pid: 4242, depuis: new Date(depuis).toISOString() }));
  // Le process vivant sous ce pid a démarré une heure après la station : ce n'est pas elle.
  writeFileSync(join(racine, SURVIT), "x\n");
  assert.equal(reprendreLaSurvivante(racine, () => true, () => depuis + 3_600_000), undefined);
  // Son âge ne se lit pas : dans le doute, rien n'est repris.
  writeFileSync(join(racine, SURVIT), "x\n");
  assert.equal(reprendreLaSurvivante(racine, () => true, () => undefined), undefined);
});
