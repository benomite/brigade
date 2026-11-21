// #3833, critère 3 : le délai croît linéairement avec la baisse du quota — 0 à 1 000 restants, le temps jusqu'au reset à 0 restant.
import assert from "node:assert/strict";
import { test } from "node:test";
import { etiquetteDe, ouvrirLimite, prendreUnAppel } from "../../src/limite-github.ts";

const DEBUT = Date.UTC(2026, 10, 18, 10, 0, 0);
const RESTE_MS = 40 * 60_000;
const lectureDe = (projet: string) => etiquetteDe([`repos/benomite/${projet}/issues`], { projet });
const horloge = () => {
  const h = { instant: DEBUT, maintenant: () => h.instant };
  return h;
};
const faireDesAppels = (limite: ReturnType<typeof ouvrirLimite>, h: { instant: number }, projet: string, n: number) => {
  for (let i = 0; i < n; i++) {
    h.instant += 1000;
    limite.prendre("cuisine", undefined, lectureDe(projet));
  }
};
// Le délai que la file impose à un appel : 0 s'il part sans attendre, sinon la première attente demandée.
const delaiDe = async (limite: ReturnType<typeof ouvrirLimite>, h: { maintenant: () => number }, projet: string): Promise<number> => {
  const attentes: number[] = [];
  const attendre = (ms: number) => {
    attentes.push(ms);
    return new Promise<void>(() => {});
  };
  let parti = false;
  void prendreUnAppel(limite, { gh: "gh", etiquette: lectureDe(projet), maintenant: h.maintenant, attendre }).then(() => (parti = true));
  await new Promise((suite) => setImmediate(suite));
  return parti ? 0 : (attentes[0] ?? Number.POSITIVE_INFINITY);
};

test("the delay of a slowed project is 0 at 1000 remaining, half the time to reset at 500, all of it at 0", async () => {
  const h = horloge();
  const limite = ouvrirLimite({ maintenant: h.maintenant, alerter: () => {} });
  faireDesAppels(limite, h, "brigade", 10);
  const reset = h.instant + RESTE_MS;
  const attendu: Array<[number, number]> = [
    [1000, 0],
    [500, RESTE_MS / 2],
    [0, RESTE_MS],
  ];
  for (const [restant, ms] of attendu) {
    limite.noter("gh", { restant, plafond: 5000, reset });
    const delai = await delaiDe(limite, h, "brigade");
    assert.ok(Math.abs(delai - ms) <= 2000, `at ${restant} remaining: ${delai} ms, expected ${ms} ms`);
  }
  limite.fermer();
});

test("the delay is linear in between: 750 remaining is a quarter of the time to reset", async () => {
  const h = horloge();
  const limite = ouvrirLimite({ maintenant: h.maintenant, alerter: () => {} });
  faireDesAppels(limite, h, "brigade", 10);
  limite.noter("gh", { restant: 750, plafond: 5000, reset: h.instant + RESTE_MS });
  assert.ok(Math.abs((await delaiDe(limite, h, "brigade")) - RESTE_MS / 4) <= 2000);
  limite.fermer();
});
