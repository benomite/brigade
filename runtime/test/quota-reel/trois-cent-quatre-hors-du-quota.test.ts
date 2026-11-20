// #3833, critère 5 : un appel répondu 304 ne compte toujours pas contre le quota réel, donc ne classe pas un projet parmi les plus actifs.
import assert from "node:assert/strict";
import { test } from "node:test";
import { etiquetteDe, ouvrirLimite, prendreUnAppel } from "../../src/limite-github.ts";

const DEBUT = Date.UTC(2026, 10, 18, 10, 0, 0);
const lectureDe = (projet: string) => etiquetteDe([`repos/benomite/${projet}/issues`], { projet });
const horloge = () => {
  const h = { instant: DEBUT, maintenant: () => h.instant };
  return h;
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

test("calls answered 304 are given back: they do not count in the hour, and do not rank their project as busy", async () => {
  const h = horloge();
  const limite = ouvrirLimite({ maintenant: h.maintenant, alerter: () => {} });
  for (let i = 0; i < 40; i++) {
    h.instant += 1000;
    limite.rendre(limite.prendre("cuisine", undefined, lectureDe("conditionnel")));
  }
  for (const [projet, n] of [["brigade", 10], ["secondes", 5]] as const) {
    for (let i = 0; i < n; i++) {
      h.instant += 1000;
      limite.prendre("cuisine", undefined, lectureDe(projet));
    }
  }
  assert.equal(limite.appels(), 15);
  limite.noter("gh", { restant: 500, plafond: 5000, reset: h.instant + 40 * 60_000 });
  assert.ok((await delaiDe(limite, h, "brigade")) > 0);
  assert.ok((await delaiDe(limite, h, "secondes")) > 0);
  assert.equal(await delaiDe(limite, h, "conditionnel"), 0, "forty calls, all 304: the least busy");
  limite.fermer();
});
