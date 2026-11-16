// La station de cet ordinateur tourne en fond (#3630) : l'app qui s'ouvre la lance quand aucune ne tourne, la rejoint
// quand elle tourne — le même process, le même pid —, et en quittant ne l'arrête pas : un cook en cours continue. Une
// seconde station n'est jamais lancée. Contre une station d'essai : de vrais process, ni GitHub ni `claude`.
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, rmSync, utimesSync, writeFileSync } from "node:fs";
import { uptime } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { test, type TestContext } from "node:test";
import { jusqua, repertoireTemporaire } from "../../../runtime/test/outils.ts";
import { PRINCIPAL } from "../../src/poste/role.ts";
import { prendreLaStation, tenantDeLaStation, TENUE_PAR } from "../../src/poste/station.ts";
import { demanderAppairage, HOTE, lireEtatDuFond, rejoindreOuLancer, repondreAuxAppairages } from "../../src/station-fond/fond.ts";
import { tenirLaStationDeFond } from "../../src/station-fond/attache.ts";
import { CACHE_DE_COMPILATION } from "../aides/cache-de-compilation.ts";

const enProcess = promisify(execFile);
// Sous Windows, un SIGTERM tue l'hôte avant qu'il n'arrête sa station : le cook d'essai resterait derrière le test.
const SOUS_POSIX: string | false = process.platform === "win32" ? "on Windows a SIGTERM kills the background host before it stops its station, and the test's cook would outlive the test" : false;
const FAUSSE_APP = join(import.meta.dirname, "fausse-app.ts");
const APPAIRAGE = "fond-appairage.json";

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

const vivant = (pid: number) => {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
};

function unOrdinateur(t: TestContext, station = STATION) {
  const machine = repertoireTemporaire(t);
  const runtime = join(machine, "runtime");
  mkdirSync(join(runtime, "src", "station"), { recursive: true });
  writeFileSync(join(runtime, "package.json"), `${JSON.stringify({ name: "brigade-runtime", version: "1.0.0" })}\n`);
  writeFileSync(join(runtime, PRINCIPAL), station);
  const racine = join(machine, "station");
  // La station de fond, arrêtée en fin de test comme « Quit the station » l'arrête, et son cook avec elle.
  t.after(async () => {
    const hote = tenantDeLaStation(racine);
    if (hote !== undefined) process.kill(hote, "SIGTERM");
    await jusqua(() => hote === undefined || !vivant(hote), 2_000);
    const cook = Number(readFileSync(join(racine, "cook.pid"), { encoding: "utf8", flag: "a+" }));
    if (cook > 0 && vivant(cook)) process.kill(cook, "SIGKILL");
  });
  return { racine, embarque: join(runtime, PRINCIPAL) };
}

const ouvrirLApp = async ({ racine, embarque }: { racine: string; embarque: string }) => {
  const { stdout } = await enProcess(process.execPath, [FAUSSE_APP, racine, embarque], { env: { ...process.env, ...CACHE_DE_COMPILATION } });
  return JSON.parse(stdout) as { lancee?: number; rejointe?: number; refus?: string };
};

test("sans station qui tourne, l'app la lance en fond ; quittée, la station et son cook continuent ; rouverte, l'app rejoint le même process", { skip: SOUS_POSIX }, async (t) => {
  const ordi = unOrdinateur(t);
  const premiere = await ouvrirLApp(ordi);
  assert.equal(typeof premiere.lancee, "number", JSON.stringify(premiere));
  const pid = premiere.lancee ?? 0;
  // L'app est partie : la station tourne, et son cook a écrit son travail, qui reste.
  await jusqua(() => existsSync(join(ordi.racine, "cook.pid")) && existsSync(join(ordi.racine, "worktree", "travail.txt")), 2_000);
  const cook = Number(readFileSync(join(ordi.racine, "cook.pid"), "utf8"));
  assert.ok(vivant(pid), "la station de fond tourne l'app partie");
  assert.ok(vivant(cook), "son cook n'est pas interrompu");
  assert.equal(readFileSync(join(ordi.racine, "worktree", "travail.txt"), "utf8"), "travail non commité");

  const seconde = await ouvrirLApp(ordi);
  assert.deepEqual(seconde, { rejointe: pid });
  assert.ok(vivant(cook));
  assert.equal(lireEtatDuFond(ordi.racine)?.pid, pid);
});

test("une seconde station de fond lancée pendant que la première tourne s'en va sans rien lancer", { skip: SOUS_POSIX }, async (t) => {
  const ordi = unOrdinateur(t);
  const premiere = await ouvrirLApp(ordi);
  const pid = premiere.lancee ?? assert.fail(JSON.stringify(premiere));
  const { stdout } = await enProcess(process.execPath, [HOTE, ordi.racine, ordi.embarque], { env: { ...process.env, ...CACHE_DE_COMPILATION } });
  assert.match(stdout, new RegExp(`this computer's station already runs \\(pid ${pid}\\) — no second one is started`));
  assert.equal(tenantDeLaStation(ordi.racine), pid);
});

test("« Quit the station » arrête l'hôte, qui rend sa marque : un pid mort que le système redonnerait n'empêche pas la station suivante", { skip: SOUS_POSIX }, async (t) => {
  const ordi = unOrdinateur(t);
  const pid = (await ouvrirLApp(ordi)).lancee ?? assert.fail("not launched");
  await jusqua(() => existsSync(join(ordi.racine, "cook.pid")), 2_000);
  process.kill(pid, "SIGTERM");
  await jusqua(() => !vivant(pid), 2_000);
  assert.equal(existsSync(join(ordi.racine, TENUE_PAR)), false);
  assert.equal(lireEtatDuFond(ordi.racine)?.etat, "arretee");
});

// Une station qui refuse de démarrer la première fois (une autre tient encore le répertoire), puis démarre.
const REFUSE_UNE_FOIS = `import { existsSync as existe, writeFileSync as ecrire } from "node:fs";
import { join as chemin } from "node:path";
const essai = chemin(process.env.BRIGADE_STATION_DIR, "..", "essai");
if (!existe(essai)) { ecrire(essai, "x"); console.log("une autre station tourne déjà"); process.exit(2); }
${STATION}`;

test("une station qui refuse de démarrer n'emporte pas l'hôte : il le dit dans fond.json et la retente d'elle-même, jusqu'à ce qu'elle démarre (mise à jour à chaud, #3701)", { skip: SOUS_POSIX }, async (t) => {
  const ordi = unOrdinateur(t, REFUSE_UNE_FOIS);
  process.env.BRIGADE_HOTE_RELANCE_MS = "300";
  t.after(() => delete process.env.BRIGADE_HOTE_RELANCE_MS);
  const ouverte = await ouvrirLApp(ordi);
  // Selon la course, l'app voit la station lancée ou déjà refusée : dans les deux cas, l'hôte reste.
  assert.ok(ouverte.lancee !== undefined || /refused to start — .*une autre station tourne déjà/.test(ouverte.refus ?? ""), JSON.stringify(ouverte));
  await jusqua(() => lireEtatDuFond(ordi.racine)?.etat === "refusee", 2_000);
  const hote = lireEtatDuFond(ordi.racine)?.pid ?? assert.fail("no state");
  assert.match(lireEtatDuFond(ordi.racine)?.motif ?? "", /une autre station tourne déjà/);
  assert.ok(vivant(hote), "l'hôte reste là");
  // Sans geste : la station est retentée, et démarre.
  await jusqua(() => existsSync(join(ordi.racine, "cook.pid")), 2_000);
  assert.ok(vivant(hote));
  assert.equal(lireEtatDuFond(ordi.racine)?.etat, "relancee");
});

test("l'hôte qui tourne reprend sa marque quand elle disparaît", { skip: SOUS_POSIX }, async (t) => {
  const ordi = unOrdinateur(t);
  const pid = (await ouvrirLApp(ordi)).lancee ?? assert.fail("not launched");
  rmSync(join(ordi.racine, TENUE_PAR));
  await jusqua(() => tenantDeLaStation(ordi.racine) === pid, 2_000);
});

test("une marque écrite avant le démarrage du système ne tient rien, même quand son pid a été redonné à un process vivant", (t) => {
  const racine = repertoireTemporaire(t);
  // Un process vivant qui n'est pas la station : le parent de ce test.
  writeFileSync(join(racine, TENUE_PAR), `${process.ppid}\n`);
  assert.equal(tenantDeLaStation(racine), process.ppid);
  const avant = new Date(Date.now() - uptime() * 1000 - 60_000);
  utimesSync(join(racine, TENUE_PAR), avant, avant);
  assert.equal(tenantDeLaStation(racine), undefined);
  assert.equal(prendreLaStation(racine, process.pid), undefined);
  assert.equal(readFileSync(join(racine, TENUE_PAR), "utf8"), `${process.pid}\n`);
});

test("l'app rejoint la station qui tient le répertoire, quelle qu'elle soit, sans rien lancer ni l'arrêter en fermant", async (t) => {
  const racine = repertoireTemporaire(t);
  // Ce process-ci tient la station, comme le lanceur de l'installeur la tient.
  assert.equal(prendreLaStation(racine, process.pid), undefined);
  const lignes: string[] = [];
  const station = tenirLaStationDeFond({ racine, inscrire: async () => ({ par: "aucune" }), lancer: () => assert.fail("rien à lancer"), appairer: async () => ({ refus: "-" }), dire: (ligne) => lignes.push(ligne), pasMs: 10 });
  assert.deepEqual(await station.pret, { rejointe: process.pid });
  await jusqua(() => station.tourne(), 2_000);
  assert.equal(station.etat(), "tenue-ailleurs");
  assert.equal(station.pid(), process.pid);
  station.fermer();
  assert.equal(tenantDeLaStation(racine), process.pid);
  assert.match(lignes.join("\n"), /already runs in the background \(pid \d+\) — the app attaches to it/);
});

test("une station lancée qui refuse de démarrer, ou qui ne tient pas son répertoire à temps, est un refus qui dit pourquoi", async (t) => {
  const racine = repertoireTemporaire(t);
  const refusee = await rejoindreOuLancer({ racine, lancer: () => writeFileSync(join(racine, "fond.json"), JSON.stringify({ pid: 4242, etat: "refusee", redemarrage: null, motif: "its configuration is wrong" })), pasMs: 5 });
  assert.deepEqual(refusee, { refus: "the background station refused to start — its configuration is wrong" });
  const muette = await rejoindreOuLancer({ racine: repertoireTemporaire(t), lancer: () => {}, attenteMs: 50, pasMs: 5 });
  assert.match("refus" in muette ? muette.refus : "", /did not start within 0 s — its log: .*fond\.log/);
  const cassee = await rejoindreOuLancer({ racine, lancer: () => { throw new Error("no node"); } });
  assert.deepEqual(cassee, { refus: "the background station could not be launched — no node" });
});

test("l'appairage passe par l'app : la station demande son code, l'app le tape et répond, la station relit la réponse", async (t) => {
  const racine = repertoireTemporaire(t);
  assert.deepEqual(demanderAppairage(racine, "ABCD-1234"), { refus: "the app has not typed its code yet — open the app on this computer" });
  const tapes: string[] = [];
  await repondreAuxAppairages(racine, async (code) => {
    tapes.push(code);
    return { appairee: "ordi" };
  });
  assert.deepEqual(tapes, ["ABCD-1234"]);
  // Déjà répondue : l'app ne la retape pas.
  await repondreAuxAppairages(racine, async () => assert.fail("déjà répondue"));
  assert.deepEqual(demanderAppairage(racine, "ABCD-1234"), { appairee: "ordi" });
  assert.equal(existsSync(join(racine, APPAIRAGE)), false);
  // Une demande illisible n'est tapée par personne ; la station la réécrit à son essai suivant.
  writeFileSync(join(racine, APPAIRAGE), "{pas du json");
  await repondreAuxAppairages(racine, async () => assert.fail("illisible"));
  assert.ok("refus" in demanderAppairage(racine, "EFGH-5678"));
  assert.equal(JSON.parse(readFileSync(join(racine, APPAIRAGE), "utf8")).code, "EFGH-5678");
  // Un geste qui lève est une réponse de refus, que la station relit.
  await repondreAuxAppairages(racine, async () => {
    throw new Error("gh is missing");
  });
  assert.deepEqual(demanderAppairage(racine, "EFGH-5678"), { refus: "gh is missing" });
});

test("l'app tient la station de cet ordinateur par la station de fond, et en quittant cesse seulement de la regarder", () => {
  const main = readFileSync(join(import.meta.dirname, "../../src/main.ts"), "utf8");
  assert.match(main, /const stationLocale =\n {2}role\.role === "station" && !installeeAuLancement\n {4}\? tenirLaStationDeFond\(/);
  assert.match(main, /lancer: \(\) => lancerLeFond\(/);
  const quitter = main.slice(main.indexOf('app.on("will-quit"'));
  assert.match(quitter, /stationLocale\?\.fermer\(\);/);
  assert.doesNotMatch(main, /stationLocale\?\.arreter\(\)|tenirProcessDeStation/);
});
