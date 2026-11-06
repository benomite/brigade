// La décision de relance de la station sur une version publiée : par lots,
// au plus une par intervalle, sauf une version urgente (#2585).
import assert from "node:assert/strict";
import { test } from "node:test";
import { deciderLaRelance, INTERVALLE_MS } from "../../../src/mise-a-jour/lot/fenetre.ts";

const T0 = Date.parse("2026-11-06T10:00:00.000Z");
const a = (minutes: number) => new Date(T0 + minutes * 60_000);

test("par défaut, l'intervalle entre deux relances est d'une heure", () => {
  assert.equal(INTERVALLE_MS, 60 * 60_000);
});

test("deux versions non urgentes publiées à vingt minutes d'écart : une seule relance, à la fin de l'heure", () => {
  // La station s'est relancée à T0 ; une version paraît à +10 min, une autre à +30 min.
  // Un minuteur regarde toutes les dix minutes : chaque regard décide.
  const relances: number[] = [];
  let derniereRelance = a(0);
  for (let minute = 10; minute <= 120; minute += 10) {
    const decision = deciderLaRelance({ derniereRelance, urgente: false, maintenant: a(minute) });
    if (decision.quoi === "relancer") {
      relances.push(minute);
      derniereRelance = a(minute);
      // Le lot installé contenait les deux versions : plus rien n'attend.
      break;
    }
    assert.deepEqual(decision, { quoi: "attendre", jusqua: a(60) });
  }
  assert.deepEqual(relances, [60]);
});

test("une version non urgente ne relance jamais la station avant la fin de l'intervalle", () => {
  for (const minute of [0, 1, 30, 59, 59.99]) assert.deepEqual(deciderLaRelance({ derniereRelance: a(0), urgente: false, maintenant: a(minute) }), { quoi: "attendre", jusqua: a(60) }, `à +${minute} min`);
  assert.deepEqual(deciderLaRelance({ derniereRelance: a(0), urgente: false, maintenant: a(60) }), { quoi: "relancer", pourquoi: "fenetre-passee" });
});

test("l'intervalle est un réglage : à trente minutes, la fenêtre se ferme à trente minutes", () => {
  const intervalleMs = 30 * 60_000;
  assert.deepEqual(deciderLaRelance({ derniereRelance: a(0), urgente: false, maintenant: a(20), intervalleMs }), { quoi: "attendre", jusqua: a(30) });
  assert.deepEqual(deciderLaRelance({ derniereRelance: a(0), urgente: false, maintenant: a(30), intervalleMs }), { quoi: "relancer", pourquoi: "fenetre-passee" });
  // Avec le défaut, à +30 min, elle attend encore.
  assert.equal(deciderLaRelance({ derniereRelance: a(0), urgente: false, maintenant: a(30) }).quoi, "attendre");
});

test("une version urgente s'installe tout de suite, même relancée il y a une minute", () => {
  assert.deepEqual(deciderLaRelance({ derniereRelance: a(0), urgente: true, maintenant: a(1) }), { quoi: "relancer", pourquoi: "urgente" });
});

test("sans relance passée, la version s'installe tout de suite", () => {
  assert.deepEqual(deciderLaRelance({ derniereRelance: null, urgente: false, maintenant: a(0) }), { quoi: "relancer", pourquoi: "premiere" });
  assert.deepEqual(deciderLaRelance({ derniereRelance: new Date(Number.NaN), urgente: false, maintenant: a(0) }), { quoi: "relancer", pourquoi: "premiere" });
});
