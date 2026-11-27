// Une mise à jour de l'app ne coupe ni la station ni son cook (#3632) : l'app qui se ferme pour s'installer
// laisse la station en route, l'app rouverte la reprend sans en lancer une seconde, et son arrêt suivant
// l'arrête vraiment. De vrais process : la station d'essai joue l'enveloppe de l'app, comme en production.
import assert from "node:assert/strict";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { test, type TestContext } from "node:test";
import { jusqua, repertoireTemporaire } from "../../../runtime/test/outils.ts";
import { holdStationLocale } from "../../src/workstation/station.ts";
import { resumeTheSurviving } from "../../src/update-background/survival.ts";
import { CACHE_OF_COMPILATION } from "../helpers/cache-of-compilation.ts";
import { WITHOUT_POSIX } from "../helpers/posix.ts";

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

const SURVIVES = "survit-a-l-app";
const alive = (pid: number) => {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
};

function open(t: TestContext, root: string, principal: string, pid: number) {
  const lines: string[] = [];
  const heldOne = holdStationLocale({
    node: process.execPath,
    principal,
    racine: root,
    env: { PATH: process.env.PATH, ...CACHE_OF_COMPILATION },
    dire: (line) => void lines.push(line),
    appairer: () => assert.fail("une station d'essai n'affiche aucun code"),
    pid,
    relanceMs: 50,
    gardeMs: 5_000,
  });
  t.after(() => heldOne.arreter());
  return { tenue: heldOne, dit: () => lines.join("\n") };
}

test("l'app fermée pour sa mise à jour laisse la station en route ; l'app rouverte la reprend sans en lancer une seconde, puis l'arrête", { skip: WITHOUT_POSIX }, async (t) => {
  const machine = repertoireTemporaire(t);
  const root = join(machine, "station");
  const principal = join(machine, "runtime", "src", "station", "main.ts");
  mkdirSync(join(machine, "runtime", "src", "station"), { recursive: true });
  writeFileSync(principal, STATION);
  const enService = () => JSON.parse(readFileSync(join(root, "en-service"), "utf8")) as { pid: number };

  // La première app : la station tourne, puis l'app se ferme pour s'installer.
  const first = open(t, root, principal, 900_001);
  await jusqua(() => first.dit().includes("en service"));
  const pid = enService().pid;
  await first.tenue.arreter({ laisser: true });
  // La station, et son cook avec elle, n'a pas été coupée : l'entrée fermée ne l'arrête plus, ni ses lignes écrites vers l'app partie.
  await new Promise((resolve) => setTimeout(resolve, 600));
  assert.equal(alive(pid), true);

  // La nouvelle app : la même station est reprise, pas de seconde.
  const second = open(t, root, principal, 900_002);
  await jusqua(() => second.dit().includes("kept running while the app updated"));
  assert.equal(second.tenue.tourne(), true);
  assert.equal(enService().pid, pid);

  // Reprise, elle s'arrête à l'arrêt de l'app, comme une autre.
  await second.tenue.arreter();
  assert.equal(alive(pid), false);
});

test("deux mises à jour de l'app de suite : la station reprise reste en route, et la troisième app la reprend encore", { skip: WITHOUT_POSIX }, async (t) => {
  const machine = repertoireTemporaire(t);
  const root = join(machine, "station");
  const principal = join(machine, "runtime", "src", "station", "main.ts");
  mkdirSync(join(machine, "runtime", "src", "station"), { recursive: true });
  writeFileSync(principal, STATION);
  const enService = () => JSON.parse(readFileSync(join(root, "en-service"), "utf8")) as { pid: number };

  const first = open(t, root, principal, 900_011);
  await jusqua(() => first.dit().includes("en service"));
  const pid = enService().pid;
  await first.tenue.arreter({ laisser: true });
  const second = open(t, root, principal, 900_012);
  await jusqua(() => second.dit().includes("kept running while the app updated"));
  // La seconde app, qui n'a que la station reprise, se ferme à son tour pour une mise à jour.
  await second.tenue.arreter({ laisser: true });
  assert.equal(alive(pid), true);
  const third = open(t, root, principal, 900_013);
  await jusqua(() => third.dit().includes("kept running while the app updated"));
  assert.equal(enService().pid, pid);
  await third.tenue.arreter();
  assert.equal(alive(pid), false);
});

test("sans marque, ou sans station vivante derrière elle, rien n'est repris — et la marque se lève", (t: TestContext) => {
  const root = repertoireTemporaire(t);
  assert.equal(resumeTheSurviving(root, () => true), undefined);
  writeFileSync(join(root, SURVIVES), "x\n");
  assert.equal(resumeTheSurviving(root, () => true), undefined);
  writeFileSync(join(root, SURVIVES), "x\n");
  const since = Date.parse("2026-01-01T10:00:00Z");
  writeFileSync(join(root, "en-service"), JSON.stringify({ pid: 4242, depuis: new Date(since).toISOString() }));
  assert.equal(resumeTheSurviving(root, () => false, () => since - 1000), undefined);
  writeFileSync(join(root, SURVIVES), "x\n");
  assert.equal(resumeTheSurviving(root, () => true, () => since - 1000), 4242);
  assert.equal(resumeTheSurviving(root, () => true, () => since - 1000), undefined);
});

test("une marque périmée dont le pid a été réutilisé par un autre process n'est pas reprise (elle ne sera jamais tuée)", (t: TestContext) => {
  const root = repertoireTemporaire(t);
  const since = Date.parse("2026-01-01T10:00:00Z");
  writeFileSync(join(root, "en-service"), JSON.stringify({ pid: 4242, depuis: new Date(since).toISOString() }));
  // Le process vivant sous ce pid a démarré une heure après la station : ce n'est pas elle.
  writeFileSync(join(root, SURVIVES), "x\n");
  assert.equal(resumeTheSurviving(root, () => true, () => since + 3_600_000), undefined);
  // Son âge ne se lit pas : dans le doute, rien n'est repris.
  writeFileSync(join(root, SURVIVES), "x\n");
  assert.equal(resumeTheSurviving(root, () => true, () => undefined), undefined);
});
