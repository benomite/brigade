// L'app d'un ordinateur est une station : elle lance la cuisine de la machine (runtime/src/kitchen/main.ts, #4603), tient son
// process, le relance, l'arrête avec elle. Un projet qu'on lui ajoute (kitchen/projects) y est servi par cette cuisine.
// Contre des doublures de `gh` et de `claude` : ni réseau, ni quota.
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { test, type TestContext } from "node:test";
import { jusqua, repertoireTemporaire } from "../../../runtime/test/outils.ts";
import { roleOf } from "../../src/workstation/role.ts";
import { holdStationLocale, HELD_BY, type OptionsStationLocale } from "../../src/workstation/station.ts";
import { CACHE_OF_COMPILATION } from "../helpers/cache-of-compilation.ts";
import { WITHOUT_POSIX } from "../helpers/posix.ts";

const ENVELOPE = join(import.meta.dirname, "../../src/workstation/envelope.ts");
const RUNTIME = join(import.meta.dirname, "../../../runtime");
const role = roleOf({ plateforme: "darwin", runtime: RUNTIME, env: {} });
const PRINCIPAL = role.role === "station" ? role.principal : assert.fail("la station n'est pas à côté de l'app");

// L'app qui tient la station, arrêtée en fin de test si le test ne l'a pas fait.
function hold(t: TestContext, options: Omit<OptionsStationLocale, "dire"> & { dire?: (line: string) => void }) {
  const lines: string[] = [];
  const station = holdStationLocale({ dire: (line) => lines.push(line), ...options });
  t.after(() => station.arreter());
  return { station, lignes: lines, dit: () => lines.join("\n") };
}

test("l'app lance la vraie cuisine de la machine : elle lit kitchen/projects du répertoire de la station, et s'arrête avec l'app (#4603)", { skip: WITHOUT_POSIX }, async (t) => {
  assert.match(PRINCIPAL, /runtime[\\/]src[\\/]kitchen[\\/]main\.ts$/);
  const root = join(repertoireTemporaire(t), "station");
  mkdirSync(join(root, "kitchen"), { recursive: true });
  // Un projet que cette machine sert : la cuisine le dit à son tour (refusé faute de bac à sable, ou son tour échoue sur `gh`).
  writeFileSync(join(root, "kitchen", "projects"), "brigade acme/brigade main\n");
  const { station, dit: said } = hold(t, { node: process.execPath, principal: PRINCIPAL, racine: root, env: { ...CACHE_OF_COMPILATION, BRIGADE_GH_BIN: "/nulle/part/gh", BRIGADE_KITCHEN_TURN_SECONDS: "3600" }, appairer: () => assert.fail("la cuisine ne s'appaire pas"), reessaiMs: 200 });
  await jusqua(() => /^\S+ brigade: /m.test(said()));
  assert.equal(station.etat(), "demarree");
  assert.doesNotMatch(said(), /Cannot find module|MODULE_NOT_FOUND/);
  assert.equal(readFileSync(join(root, HELD_BY), "utf8"), `${process.pid}\n`);
  await station.arreter();
  assert.equal(station.etat(), "arretee");
  assert.equal(existsSync(join(root, HELD_BY)), false);
});

test("l'app tuée net : l'entrée de sa station se ferme, et la cuisine s'arrête comme sur un SIGTERM (#4603)", { skip: WITHOUT_POSIX }, async (t) => {
  const root = join(repertoireTemporaire(t), "station");
  mkdirSync(root, { recursive: true });
  const marker = join(root, "arretee");
  const principal = onePrincipal(t, `import { writeFileSync } from "node:fs";\nprocess.on("SIGTERM", () => { writeFileSync(${JSON.stringify(marker)}, "x"); process.exit(0); });\nsetInterval(() => {}, 1000);\nconsole.log("prête");`);
  const child = spawn(process.execPath, [ENVELOPE, principal], { env: { ...CACHE_OF_COMPILATION, BRIGADE_STATION_DIR: root }, stdio: ["pipe", "pipe", "pipe"] });
  t.after(() => void child.kill("SIGKILL"));
  let output = "";
  child.stdout.on("data", (piece: Buffer) => (output += piece.toString()));
  const end = new Promise<number | null>((resolve) => child.on("close", (code) => resolve(code)));
  await jusqua(() => output.includes("prête"));

  // Le process de l'app meurt : ses bouts des tuyaux se ferment tous d'un coup — plus personne ne lit.
  child.stdout.destroy();
  child.stderr.destroy();
  child.stdin.destroy();
  assert.equal(await end, 0);
  assert.equal(existsSync(marker), true);
});

// Une station d'essai, plus simple que la vraie : ce qu'elle fait à chaque lancement est écrit
// dans le test — dire une ligne, sortir, attendre son SIGTERM.
function onePrincipal(t: TestContext, body: string): string {
  const folder = repertoireTemporaire(t);
  // La place du point d'entrée dans le runtime : `<runtime>/src/kitchen/main.ts`.
  mkdirSync(join(folder, "src", "kitchen"), { recursive: true });
  const principal = join(folder, "src", "kitchen", "main.ts");
  writeFileSync(principal, body);
  return principal;
}

const WAIT_SIGTERM = `
const veille = setInterval(() => {}, 1000);
console.log("prête");
process.on("SIGTERM", () => { console.log("arrêtée"); clearInterval(veille); });
`;

test("la station refusée (code 2) est retentée d'elle-même avec un délai qui double, et le refus est dit ; morte d'elle-même, elle est relancée", async (t) => {
  const root = join(repertoireTemporaire(t), "station");
  const refused = hold(t, { node: process.execPath, principal: onePrincipal(t, `console.error("brigade : refus de démarrer la station — BRIGADE_PROXY_PORT n'est pas un port"); process.exit(2);`), racine: root, env: { ...CACHE_OF_COMPILATION }, appairer: () => assert.fail(), relanceMs: 10 });
  await jusqua(() => refused.station.etat() === "refusee");
  assert.match(refused.dit(), /this computer's station refused to start — brigade : refus de démarrer la station — BRIGADE_PROXY_PORT n'est pas un port; trying again in 10 ms/);
  assert.doesNotMatch(refused.dit(), /until the app restarts/);
  // Rendue entre deux essais : une autre app pourra la tenter.
  await refused.station.arreter();
  assert.equal(existsSync(join(root, HELD_BY)), false);

  const other = join(repertoireTemporaire(t), "station");
  const account = join(other, "..", "lancements");
  const fallen = hold(t, {
    node: process.execPath,
    principal: onePrincipal(t, `import { appendFileSync, readFileSync } from "node:fs";\nappendFileSync(${JSON.stringify(account)}, "x");\nif (readFileSync(${JSON.stringify(account)}, "utf8").length === 1) process.exit(1);\n${WAIT_SIGTERM}`),
    racine: other,
    env: { ...CACHE_OF_COMPILATION },
    appairer: () => assert.fail(),
    relanceMs: 10,
  });
  await jusqua(() => fallen.station.etat() === "relancee");
  assert.match(fallen.dit(), /this computer's station stopped \(code 1\) — relaunched in 0 s/);
  // Son point d'entrée est un process à lui : il reçoit le SIGTERM une fois démarré.
  await jusqua(() => fallen.dit().includes("prête"));
  await fallen.station.arreter();
  await jusqua(() => /arrêtée/.test(fallen.dit()));
});

test("une station refusée parce qu'une autre tient encore le répertoire démarre d'elle-même dès que l'autre est partie (mise à jour à chaud)", async (t) => {
  const root = join(repertoireTemporaire(t), "station");
  const account = join(root, "..", "essais");
  const { station, dit: said } = hold(t, {
    node: process.execPath,
    principal: onePrincipal(t, `import { appendFileSync, readFileSync } from "node:fs";\nappendFileSync(${JSON.stringify(account)}, "x");\nif (readFileSync(${JSON.stringify(account)}, "utf8").length < 3) { console.error("une autre station tourne déjà"); process.exit(2); }\n${WAIT_SIGTERM}`),
    racine: root,
    env: { ...CACHE_OF_COMPILATION },
    appairer: () => assert.fail(),
    relanceMs: 10,
  });
  await jusqua(() => existsSync(account) && readFileSync(account, "utf8").length === 3 && station.etat() === "relancee" && station.tourne());
  assert.match(said(), /refused to start — une autre station tourne déjà; trying again in 10 ms/);
  await station.arreter();
});

test("les essais d'une station refusée restent à plat tant que la première minute dure, puis leur délai double", async (t) => {
  const refuses = `console.error("une autre station tourne déjà"); process.exit(2);`;
  const plate = hold(t, { node: process.execPath, principal: onePrincipal(t, refuses), racine: join(repertoireTemporaire(t), "station"), env: { ...CACHE_OF_COMPILATION }, appairer: () => assert.fail(), relanceMs: 10 });
  await jusqua(() => (plate.dit().match(/trying again in 10 ms/g) ?? []).length >= 3);
  assert.doesNotMatch(plate.dit(), /trying again in 20 ms/);
  await plate.station.arreter();
  const doubled = hold(t, { node: process.execPath, principal: onePrincipal(t, refuses), racine: join(repertoireTemporaire(t), "station"), env: { ...CACHE_OF_COMPILATION }, appairer: () => assert.fail(), relanceMs: 10, platMs: 0 });
  await jusqua(() => /trying again in 80 ms/.test(doubled.dit()));
  assert.match(doubled.dit(), /trying again in 20 ms[\s\S]*trying again in 40 ms[\s\S]*trying again in 80 ms/);
  await doubled.station.arreter();
});

test("un répertoire qu'on ne peut pas écrire n'arrête pas la station jusqu'au redémarrage de l'app : elle est retentée", async (t) => {
  const folder = repertoireTemporaire(t);
  const file = join(folder, "fichier");
  writeFileSync(file, "");
  const { station, dit: said } = hold(t, { node: process.execPath, principal: onePrincipal(t, WAIT_SIGTERM), racine: join(file, "station"), env: { ...CACHE_OF_COMPILATION }, appairer: () => assert.fail(), relanceMs: 10 });
  assert.equal(station.etat(), "refusee");
  assert.match(said(), /cannot be written.*trying again in 10 ms/);
  rmSync(file);
  await jusqua(() => station.tourne());
  await station.arreter();
});

test("le code refusé — GitHub ne montre pas encore la station — est retapé jusqu'à être appairé, et le refus n'est dit qu'une fois", async (t) => {
  const root = join(repertoireTemporaire(t), "station");
  const tapes: string[] = [];
  let refusal = 2;
  const { station, dit: said } = hold(t, {
    node: process.execPath,
    principal: onePrincipal(t, `console.log("brigade : station à appairer — tape ce code dans l'app : AAAA-BBBB (valable jusqu'à 14:32)");\n${WAIT_SIGTERM}`),
    racine: root,
    env: { ...CACHE_OF_COMPILATION },
    appairer: async (code) => {
      tapes.push(code);
      return refusal-- > 0 ? { refus: "no station shows this code: check it on the station, it is 8 letters and digits" } : { appairee: "ordi" };
    },
    reessaiMs: 10,
  });
  await jusqua(() => /paired with the app, as “ordi”/.test(said()));
  assert.deepEqual(tapes, ["AAAA-BBBB", "AAAA-BBBB", "AAAA-BBBB"]);
  // Le refus est dit une fois, pas à chaque essai.
  assert.equal(said().match(/not paired yet/g)?.length, 1);
  await station.arreter();
});

test("la station dit si elle tourne, et le dit à l'app à chaque changement : lancée, arrêtée — rien entre deux", async (t) => {
  const root = join(repertoireTemporaire(t), "station");
  const changes: boolean[] = [];
  const { station, dit: said } = hold(t, {
    node: process.execPath,
    principal: onePrincipal(t, `console.log("lancée");\n${WAIT_SIGTERM}`),
    racine: root,
    env: { ...CACHE_OF_COMPILATION },
    appairer: () => assert.fail(),
    surChangement: () => changes.push(station.tourne()),
  });
  assert.equal(station.tourne(), true);
  await jusqua(() => said().includes("lancée"));
  await station.arreter();
  assert.equal(station.tourne(), false);
  await jusqua(() => changes.length === 2);
  assert.deepEqual(changes, [true, false]);
});

test("une deuxième app ouverte ne lance pas une deuxième station : elle le dit, et la reprend quand la première se ferme", async (t) => {
  const root = join(repertoireTemporaire(t), "station");
  mkdirSync(root, { recursive: true });
  // La première app : un process vivant, dont le pid tient la station.
  const first = spawn(process.execPath, ["-e", "setInterval(() => {}, 1000)"], { stdio: "ignore" });
  t.after(() => void first.kill("SIGKILL"));
  writeFileSync(join(root, HELD_BY), `${first.pid}\n`);
  const principal = onePrincipal(t, `console.log("lancée");\n${WAIT_SIGTERM}`);
  const second = hold(t, { node: process.execPath, principal, racine: root, env: { ...CACHE_OF_COMPILATION }, appairer: () => assert.fail(), reessaiMs: 10 });

  assert.equal(second.station.etat(), "tenue-ailleurs");
  assert.match(second.dit(), new RegExp(`this computer's station is run by another app \\(pid ${first.pid}\\)`));
  first.kill("SIGKILL");
  await jusqua(() => second.dit().includes("lancée"));
  assert.equal(second.station.etat(), "demarree");
  assert.equal(readFileSync(join(root, HELD_BY), "utf8"), `${process.pid}\n`);
  // Dit une fois, pas à chaque essai.
  assert.equal(second.dit().match(/run by another app/g)?.length, 1);
  await second.station.arreter();
});

test("un répertoire de station qu'on ne peut pas écrire : l'app s'ouvre quand même, sans station, et le dit", async (t) => {
  const file = join(repertoireTemporaire(t), "un-fichier");
  writeFileSync(file, "");
  const { station, dit: said } = hold(t, { node: process.execPath, principal: onePrincipal(t, WAIT_SIGTERM), racine: join(file, "station"), env: { ...CACHE_OF_COMPILATION }, appairer: () => assert.fail() });
  assert.equal(station.etat(), "refusee");
  assert.match(said(), /this computer's station is not launched — its directory .*un-fichier[\\/]station cannot be written: /);
  await station.arreter();
});
