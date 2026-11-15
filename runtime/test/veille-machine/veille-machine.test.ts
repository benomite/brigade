// La station garde le Mac éveillé tant qu'un cook cuit (#3642) : l'assertion prise et relâchée au compte des cooks, le
// réglage éteint puis rallumé, rien hors d'un Mac, et aucune assertion qui survive à la station. `caffeinate` n'existe
// que sur un Mac : un faux (aides/faux-caffeinate.ts) le joue, avec son `-w`.
import { test, type TestContext } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { assertionTenue, ecrireEtat, ecrireReglage, ETAT, lireReglage, lireVeille, REGLAGE } from "../../src/veille-machine/contrat.ts";
import { tenirLaVeille, type OptionsDeLaVeille } from "../../src/veille-machine/veille.ts";
import { aArreter, ENV_ENFANT, jusqua, repertoireTemporaire, vivant } from "../outils.ts";

const FAUX = join(import.meta.dirname, "aides", "faux-caffeinate.ts");
const STATION = join(import.meta.dirname, "aides", "station-qui-tient.ts");

const lancements = (temoin: string): { pid: number; args: string[] }[] =>
  existsSync(temoin) ? readFileSync(temoin, "utf8").trim().split("\n").filter(Boolean).map((ligne) => JSON.parse(ligne)) : [];

// Une veille sur le faux, que le test regarde à la main : son intervalle ne vient jamais pendant le test.
function veille(t: TestContext, cooks: () => number, plus: Partial<OptionsDeLaVeille> = {}) {
  const racine = repertoireTemporaire(t);
  const temoin = join(racine, "lancements");
  const dits: string[] = [];
  const tenue = tenirLaVeille({ racine, plateforme: "darwin", cooks, dire: (ligne) => dits.push(ligne), commande: [process.execPath, FAUX, temoin], intervalleMs: 3_600_000, ...plus });
  aArreter(t, () => tenue.arreter());
  return { racine, temoin, dits, tenue };
}

const dernier = (temoin: string) => {
  const tous = lancements(temoin);
  return tous[tous.length - 1]?.pid;
};

test("deux cooks : la fin de l'un garde l'assertion, la fin du second la relâche", async (t) => {
  let cooks = 2;
  const { racine, temoin, tenue } = veille(t, () => cooks);
  await jusqua(() => lancements(temoin).length === 1);
  const [lance] = lancements(temoin);
  assert.deepEqual(lance?.args, ["-i", "-w", String(process.pid)]);
  assert.equal(tenue.tenue(), true);
  assert.equal(assertionTenue(racine), true);

  cooks = 1;
  tenue.regarder();
  assert.equal(tenue.tenue(), true);
  assert.equal(lancements(temoin).length, 1, "un cook qui reste ne relance rien");
  assert.ok(vivant(lance?.pid));

  cooks = 0;
  tenue.regarder();
  assert.equal(tenue.tenue(), false);
  assert.equal(assertionTenue(racine), false);
  await jusqua(() => !vivant(lance?.pid));
  assert.equal(lireVeille(racine, "darwin").sorte === "mac" && (lireVeille(racine, "darwin") as { tenue: boolean }).tenue, false);
});

test("aucun cook : rien n'est tenu ; un cook qui part la reprend", async (t) => {
  let cooks = 0;
  const { racine, temoin, tenue } = veille(t, () => cooks);
  assert.equal(tenue.tenue(), false);
  assert.equal(lancements(temoin).length, 0);
  assert.deepEqual(JSON.parse(readFileSync(join(racine, ETAT), "utf8")), { tenue: false });
  cooks = 1;
  tenue.regarder();
  assert.equal(tenue.tenue(), true);
  await jusqua(() => lancements(temoin).length === 1);
});

test("le réglage éteint relâche l'assertion d'un cook qui cuit, survit à une relance, et rallumé la reprend", async (t) => {
  const { racine, temoin, tenue } = veille(t, () => 1);
  await jusqua(() => lancements(temoin).length === 1);
  const premier = dernier(temoin);

  assert.deepEqual(ecrireReglage(racine, false), { fait: true });
  tenue.regarder();
  assert.equal(tenue.tenue(), false);
  assert.equal(assertionTenue(racine), false);
  await jusqua(() => !vivant(premier));
  tenue.arreter();

  // La station relancée lit le réglage où il a été laissé : rien n'est pris.
  const temoin2 = join(racine, "lancements-2");
  const relancee = tenirLaVeille({ racine, plateforme: "darwin", cooks: () => 1, dire: () => {}, commande: [process.execPath, FAUX, temoin2], intervalleMs: 3_600_000 });
  aArreter(t, () => relancee.arreter());
  assert.deepEqual(lireReglage(racine), { garderEveille: false });
  assert.equal(relancee.tenue(), false);

  assert.deepEqual(ecrireReglage(racine, true), { fait: true });
  relancee.regarder();
  assert.equal(relancee.tenue(), true);
  await jusqua(() => lancements(temoin2).length === 1);
  assert.equal(assertionTenue(racine), true);
});

test("le réglage : allumé par défaut, illisible il n'est pas écrasé et la station garde le dernier lu", async (t) => {
  const { racine, temoin, tenue, dits } = veille(t, () => 1);
  assert.deepEqual(lireReglage(racine), { garderEveille: true });
  await jusqua(() => lancements(temoin).length === 1);
  writeFileSync(join(racine, REGLAGE), "{ pas du json");
  tenue.regarder();
  tenue.regarder();
  assert.equal(tenue.tenue(), true);
  assert.equal(dits.filter((ligne) => ligne.includes("illisible")).length, 1, "dit une fois");
  const refus = ecrireReglage(racine, false);
  assert.ok("refus" in refus);
  assert.equal(readFileSync(join(racine, REGLAGE), "utf8"), "{ pas du json");
});

test("hors d'un Mac : rien ne se lance, rien ne s'écrit, et l'app ne lit rien", (t) => {
  const { racine, temoin, tenue } = veille(t, () => 3, { plateforme: "linux" });
  tenue.regarder();
  assert.equal(tenue.tenue(), false);
  assert.equal(lancements(temoin).length, 0);
  assert.equal(existsSync(join(racine, ETAT)), false);
  assert.deepEqual(lireVeille(racine, "linux"), { sorte: "sans" });
  assert.deepEqual(lireVeille(racine, "win32"), { sorte: "sans" });
});

test("la station arrêtée relâche l'assertion tout de suite", async (t) => {
  const { racine, temoin, tenue } = veille(t, () => 1);
  await jusqua(() => lancements(temoin).length === 1);
  const lance = dernier(temoin);
  tenue.arreter();
  assert.equal(assertionTenue(racine), false);
  await jusqua(() => !vivant(lance));
});

test("la station tuée (SIGKILL) ne laisse aucune assertion derrière elle", async (t) => {
  const racine = repertoireTemporaire(t);
  const temoin = join(racine, "lancements");
  const station = spawn(process.execPath, [STATION, racine, FAUX, temoin], { env: ENV_ENFANT, stdio: "ignore" });
  aArreter(t, () => station.kill("SIGKILL"));
  await jusqua(() => assertionTenue(racine) && lancements(temoin).length === 1);
  const lance = dernier(temoin);
  assert.deepEqual(lancements(temoin)[0]?.args, ["-i", "-w", String(station.pid)]);
  station.kill("SIGKILL");
  await jusqua(() => !vivant(lance));
  // L'état dit encore « tenue », écrit par une station morte : l'app n'y lit aucune assertion.
  assert.equal(JSON.parse(readFileSync(join(racine, ETAT), "utf8")).tenue, true);
  assert.equal(assertionTenue(racine), false);
  assert.deepEqual(lireVeille(racine, "darwin"), { sorte: "mac", reglage: { garderEveille: true }, tenue: false });
});

test("l'app lit l'état : tenue seulement si la station et son caffeinate vivent", (t) => {
  const racine = repertoireTemporaire(t);
  assert.equal(assertionTenue(racine), false, "aucun état : rien de tenu");
  ecrireEtat(racine, { tenue: true, caffeinate: 11, station: 12 });
  assert.equal(assertionTenue(racine, () => true), true);
  assert.equal(assertionTenue(racine, (pid) => pid !== 11), false);
  assert.equal(assertionTenue(racine, (pid) => pid !== 12), false);
  writeFileSync(join(racine, ETAT), "illisible");
  assert.equal(assertionTenue(racine, () => true), false);
});
