// #3914, critère 2 : un seul tour de superviseur par projet à la fois — un second déclenchement pendant un tour ne
// lance rien.
import assert from "node:assert/strict";
import { test } from "node:test";
import { superviseurDuProjet } from "../../src/superviseur/un-seul.ts";

test("a second trigger during a run starts nothing", async () => {
  const superviseur = superviseurDuProjet();
  let lances = 0;
  let finir = () => {};
  const enCours = new Promise<void>((resoudre) => (finir = resoudre));
  const tour = async () => {
    lances++;
    await enCours;
  };
  const premier = superviseur.declencher("brigade", tour);
  const second = await superviseur.declencher("brigade", tour);
  assert.equal(second, "deja-en-cours");
  assert.equal(lances, 1);
  finir();
  assert.equal(await premier, "lance");
  assert.equal(await superviseur.declencher("brigade", async () => void lances++), "lance", "once the run is over, a new one can start");
  assert.equal(lances, 2);
});

test("the guard is per project: another project's run is not blocked", async () => {
  const superviseur = superviseurDuProjet();
  let finir = () => {};
  const enCours = new Promise<void>((resoudre) => (finir = resoudre));
  const premier = superviseur.declencher("brigade", () => enCours);
  let autre = 0;
  assert.equal(await superviseur.declencher("mirrorlab", async () => void autre++), "lance");
  assert.equal(autre, 1);
  finir();
  await premier;
});
