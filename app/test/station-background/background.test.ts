// La station de cet ordinateur tourne en fond (#3630) : l'app qui s'ouvre la lance quand aucune ne tourne, la rejoint
// quand elle tourne — le même process, le même pid —, et en quittant ne l'arrête pas : un cook en cours continue. Une
// seconde station n'est jamais lancée. Contre une station d'essai : de vrais process, ni GitHub ni `claude`.
import assert from "node:assert/strict";
import { execFile, spawn } from "node:child_process";
import { copyFileSync, existsSync, mkdirSync, readFileSync, rmSync, utimesSync, writeFileSync } from "node:fs";
import { uptime } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { test, type TestContext } from "node:test";
import { jusqua, repertoireTemporaire } from "../../../runtime/test/outils.ts";
import { PRINCIPAL } from "../../src/workstation/role.ts";
import { takeTheStation, holdingOfTheStation, HELD_BY } from "../../src/workstation/station.ts";
import { askPairing, HOST, readStateOfBackground, joinOrLaunch, answerAtPairings } from "../../src/station-background/background.ts";
import { holdTheStationOfBackground } from "../../src/station-background/attached.ts";
import { CACHE_OF_COMPILATION } from "../helpers/cache-of-compilation.ts";

const inProcess = promisify(execFile);
// Sous Windows, un SIGTERM tue l'hôte avant qu'il n'arrête sa station : le cook d'essai resterait derrière le test.
const UNDER_POSIX: string | false = process.platform === "win32" ? "on Windows a SIGTERM kills the background host before it stops its station, and the test's cook would outlive the test" : false;
const FALSE_APP = join(import.meta.dirname, "false-app.ts");
const PAIRING = "fond-appairage.json";

// Une station d'essai : elle lance un « cook » — un process qui écrit dans son worktree tant qu'il vit —, et tourne
// jusqu'au SIGTERM que son enveloppe lui donne.
const STATION = `import { spawn } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
const worktree = join(process.env.BRIGADE_STATION_DIR, "worktree");
mkdirSync(worktree, { recursive: true });
const cook = spawn(process.execPath, ["-e", "require('node:fs').writeFileSync(process.argv[1], 'travail non commité'); setInterval(() => {}, 60000)", join(worktree, "travail.txt")], { stdio: "ignore" });
writeFileSync(join(process.env.BRIGADE_STATION_DIR, "cook.pid"), String(cook.pid));
const veille = setInterval(() => {}, 60_000);
process.on("SIGTERM", () => { clearInterval(veille); cook.kill(); process.exit(0); });
`;

const alive = (pid: number) => {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
};

function oneComputer(t: TestContext, station = STATION) {
  const machine = repertoireTemporaire(t);
  const runtime = join(machine, "runtime");
  mkdirSync(join(runtime, "src", "kitchen"), { recursive: true });
  writeFileSync(join(runtime, "package.json"), `${JSON.stringify({ name: "brigade-runtime", version: "1.0.0" })}\n`);
  writeFileSync(join(runtime, PRINCIPAL), station);
  const root = join(machine, "station");
  // La station de fond, arrêtée en fin de test comme « Quit the station » l'arrête, et son cook avec elle.
  t.after(async () => {
    const host = holdingOfTheStation(root);
    if (host !== undefined) process.kill(host, "SIGTERM");
    await jusqua(() => host === undefined || !alive(host), 2_000);
    const cook = Number(readFileSync(join(root, "cook.pid"), { encoding: "utf8", flag: "a+" }));
    if (cook > 0 && alive(cook)) process.kill(cook, "SIGKILL");
  });
  return { racine: root, embarque: join(runtime, PRINCIPAL) };
}

const openTheApp = async ({ racine: root, embarque: embedded }: { racine: string; embarque: string }) => {
  const { stdout } = await inProcess(process.execPath, [FALSE_APP, root, embedded], { env: { ...process.env, ...CACHE_OF_COMPILATION } });
  return JSON.parse(stdout) as { lancee?: number; rejointe?: number; refus?: string };
};

test("sans station qui tourne, l'app la lance en fond ; quittée, la station et son cook continuent ; rouverte, l'app rejoint le même process", { skip: UNDER_POSIX }, async (t) => {
  const ordi = oneComputer(t);
  const first = await openTheApp(ordi);
  assert.equal(typeof first.lancee, "number", JSON.stringify(first));
  const pid = first.lancee ?? 0;
  // L'app est partie : la station tourne, et son cook a écrit son travail, qui reste.
  await jusqua(() => existsSync(join(ordi.racine, "cook.pid")) && existsSync(join(ordi.racine, "worktree", "travail.txt")), 2_000);
  const cook = Number(readFileSync(join(ordi.racine, "cook.pid"), "utf8"));
  assert.ok(alive(pid), "la station de fond tourne l'app partie");
  assert.ok(alive(cook), "son cook n'est pas interrompu");
  assert.equal(readFileSync(join(ordi.racine, "worktree", "travail.txt"), "utf8"), "travail non commité");

  const second = await openTheApp(ordi);
  assert.deepEqual(second, { rejointe: pid });
  assert.ok(alive(cook));
  assert.equal(readStateOfBackground(ordi.racine)?.pid, pid);
});

test("une seconde station de fond lancée pendant que la première tourne s'en va sans rien lancer", { skip: UNDER_POSIX }, async (t) => {
  const ordi = oneComputer(t);
  const first = await openTheApp(ordi);
  const pid = first.lancee ?? assert.fail(JSON.stringify(first));
  const { stdout } = await inProcess(process.execPath, [HOST, ordi.racine, ordi.embarque], { env: { ...process.env, ...CACHE_OF_COMPILATION } });
  assert.match(stdout, new RegExp(`this computer's station already runs \\(pid ${pid}\\) — no second one is started`));
  assert.equal(holdingOfTheStation(ordi.racine), pid);
});

test("« Quit the station » arrête l'hôte, qui rend sa marque : un pid mort que le système redonnerait n'empêche pas la station suivante", { skip: UNDER_POSIX }, async (t) => {
  const ordi = oneComputer(t);
  const pid = (await openTheApp(ordi)).lancee ?? assert.fail("not launched");
  await jusqua(() => existsSync(join(ordi.racine, "cook.pid")), 2_000);
  process.kill(pid, "SIGTERM");
  await jusqua(() => !alive(pid), 2_000);
  assert.equal(existsSync(join(ordi.racine, HELD_BY)), false);
  assert.equal(readStateOfBackground(ordi.racine)?.etat, "arretee");
});

// Une station qui refuse de démarrer la première fois (une autre tient encore le répertoire), puis démarre.
const REFUSES_ONE_TIMES = `import { existsSync as existe, writeFileSync as ecrire } from "node:fs";
import { join as chemin } from "node:path";
const essai = chemin(process.env.BRIGADE_STATION_DIR, "..", "essai");
if (!existe(essai)) { ecrire(essai, "x"); console.log("une autre station tourne déjà"); process.exit(2); }
${STATION}`;

test("une station qui refuse de démarrer n'emporte pas l'hôte : il le dit dans fond.json et la retente d'elle-même, jusqu'à ce qu'elle démarre (mise à jour à chaud, #3701)", { skip: UNDER_POSIX }, async (t) => {
  const ordi = oneComputer(t, REFUSES_ONE_TIMES);
  process.env.BRIGADE_HOTE_RELANCE_MS = "300";
  t.after(() => delete process.env.BRIGADE_HOTE_RELANCE_MS);
  const openOne = await openTheApp(ordi);
  // Selon la course, l'app voit la station lancée ou déjà refusée : dans les deux cas, l'hôte reste.
  assert.ok(openOne.lancee !== undefined || /refused to start — .*une autre station tourne déjà/.test(openOne.refus ?? ""), JSON.stringify(openOne));
  await jusqua(() => readStateOfBackground(ordi.racine)?.etat === "refusee", 2_000);
  const host = readStateOfBackground(ordi.racine)?.pid ?? assert.fail("no state");
  assert.match(readStateOfBackground(ordi.racine)?.motif ?? "", /une autre station tourne déjà/);
  assert.ok(alive(host), "l'hôte reste là");
  // Sans geste : la station est retentée, et démarre.
  await jusqua(() => existsSync(join(ordi.racine, "cook.pid")), 2_000);
  assert.ok(alive(host));
  assert.equal(readStateOfBackground(ordi.racine)?.etat, "relancee");
});

test("l'hôte qui tourne reprend sa marque quand elle disparaît", { skip: UNDER_POSIX }, async (t) => {
  const ordi = oneComputer(t);
  const pid = (await openTheApp(ordi)).lancee ?? assert.fail("not launched");
  rmSync(join(ordi.racine, HELD_BY));
  await jusqua(() => holdingOfTheStation(ordi.racine) === pid, 2_000);
});

test("une marque écrite avant le démarrage du système ne tient rien, même quand son pid a été redonné à un process vivant", (t) => {
  const root = repertoireTemporaire(t);
  // Un process vivant qui n'est pas la station : le parent de ce test.
  writeFileSync(join(root, HELD_BY), `${process.ppid}\n`);
  assert.equal(holdingOfTheStation(root), process.ppid);
  const before = new Date(Date.now() - uptime() * 1000 - 60_000);
  utimesSync(join(root, HELD_BY), before, before);
  assert.equal(holdingOfTheStation(root), undefined);
  assert.equal(takeTheStation(root, process.pid), undefined);
  assert.equal(readFileSync(join(root, HELD_BY), "utf8"), `${process.pid}\n`);
});

test("l'app rejoint la station qui tient le répertoire, quelle qu'elle soit, sans rien lancer ni l'arrêter en fermant", async (t) => {
  const root = repertoireTemporaire(t);
  // Ce process-ci tient la station, comme le lanceur de l'installeur la tient.
  assert.equal(takeTheStation(root, process.pid), undefined);
  const lines: string[] = [];
  const station = holdTheStationOfBackground({ racine: root, inscrire: async () => ({ par: "aucune" }), lancer: () => assert.fail("rien à lancer"), appairer: async () => ({ refus: "-" }), dire: (line) => lines.push(line), pasMs: 10 });
  assert.deepEqual(await station.pret, { rejointe: process.pid });
  await jusqua(() => station.tourne(), 2_000);
  assert.equal(station.etat(), "tenue-ailleurs");
  assert.equal(station.pid(), process.pid);
  station.fermer();
  assert.equal(holdingOfTheStation(root), process.pid);
  assert.match(lines.join("\n"), /already runs in the background \(pid \d+\) — the app attaches to it/);
});

test("une station lancée qui refuse de démarrer, ou qui ne tient pas son répertoire à temps, est un refus qui dit pourquoi", async (t) => {
  const root = repertoireTemporaire(t);
  const refused = await joinOrLaunch({ racine: root, lancer: () => writeFileSync(join(root, "fond.json"), JSON.stringify({ pid: 4242, etat: "refusee", redemarrage: null, motif: "its configuration is wrong" })), pasMs: 5 });
  assert.deepEqual(refused, { refus: "the background station refused to start — its configuration is wrong" });
  const silentOne = await joinOrLaunch({ racine: repertoireTemporaire(t), lancer: () => {}, attenteMs: 50, pasMs: 5 });
  assert.match("refus" in silentOne ? silentOne.refus : "", /did not start within 0 s — its log: .*fond\.log/);
  const broken = await joinOrLaunch({ racine: root, lancer: () => { throw new Error("no node"); } });
  assert.deepEqual(broken, { refus: "the background station could not be launched — no node" });
});

test("l'appairage passe par l'app : la station demande son code, l'app le tape et répond, la station relit la réponse", async (t) => {
  const root = repertoireTemporaire(t);
  assert.deepEqual(askPairing(root, "ABCD-1234"), { refus: "the app has not typed its code yet — open the app on this computer" });
  const tapes: string[] = [];
  await answerAtPairings(root, async (code) => {
    tapes.push(code);
    return { appairee: "ordi" };
  });
  assert.deepEqual(tapes, ["ABCD-1234"]);
  // Déjà répondue : l'app ne la retape pas.
  await answerAtPairings(root, async () => assert.fail("déjà répondue"));
  assert.deepEqual(askPairing(root, "ABCD-1234"), { appairee: "ordi" });
  assert.equal(existsSync(join(root, PAIRING)), false);
  // Une demande illisible n'est tapée par personne ; la station la réécrit à son essai suivant.
  writeFileSync(join(root, PAIRING), "{pas du json");
  await answerAtPairings(root, async () => assert.fail("illisible"));
  assert.ok("refus" in askPairing(root, "EFGH-5678"));
  assert.equal(JSON.parse(readFileSync(join(root, PAIRING), "utf8")).code, "EFGH-5678");
  // Un geste qui lève est une réponse de refus, que la station relit.
  await answerAtPairings(root, async () => {
    throw new Error("gh is missing");
  });
  assert.deepEqual(askPairing(root, "EFGH-5678"), { refus: "gh is missing" });
});

test("l'app tient la station de cet ordinateur par la station de fond, et en quittant cesse seulement de la regarder", () => {
  const main = readFileSync(join(import.meta.dirname, "../../src/main.ts"), "utf8");
  assert.match(main, /const stationLocale =\n {2}role\.role === "station" && !installedAtLaunch\n {4}\? holdTheStationOfBackground\(/);
  assert.match(main, /lancer: \(\) => launchTheBackground\(/);
  const quit = main.slice(main.indexOf('app.on("will-quit"'));
  assert.match(quit, /stationLocale\?\.fermer\(\);/);
  assert.doesNotMatch(main, /stationLocale\?\.arreter\(\)|tenirProcessDeStation/);
});

test("l'hôte dont le node a disparu (mise à jour de l'app) s'en va avec un code d'échec au lieu de relancer en ENOENT : launchd le relance (#4400)", { skip: UNDER_POSIX }, async (t) => {
  const ordi = oneComputer(t, "process.exit(1);\n");
  const copy = join(repertoireTemporaire(t), "node");
  copyFileSync(process.execPath, copy);
  const host = spawn(copy, [HOST, ordi.racine, ordi.embarque], { env: { ...process.env, ...CACHE_OF_COMPILATION, BRIGADE_HOTE_RELANCE_MS: "300" }, stdio: ["ignore", "pipe", "ignore"] });
  let output = "";
  host.stdout.on("data", (piece) => (output += piece));
  const finished = new Promise<number | null>((ok) => host.on("exit", ok));
  t.after(() => host.kill("SIGKILL"));
  await jusqua(() => holdingOfTheStation(ordi.racine) === host.pid, 2_000);
  rmSync(copy);
  assert.equal(await finished, 1);
  assert.match(output, /its node binary .* no longer exists/);
  assert.equal(existsSync(join(ordi.racine, HELD_BY)), false);
});
