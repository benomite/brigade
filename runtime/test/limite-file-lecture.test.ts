// La file des appels (#3833) : sous 1 000 restants, une lecture d'un projet de la moitié basse
// part sans attendre, la même lecture d'un projet de la moitié haute attend le délai linéaire.
import assert from "node:assert/strict";
import { test } from "node:test";
import { etiquetteDe, ouvrirLimite, prendreUnAppel } from "../src/limite-github.ts";
const LIMITE_HORAIRE = 5000;

test("at low quota a read of a bottom-half project goes ahead, the same read of a top-half project waits the linear delay", async (t) => {
  const h = { instant: Date.UTC(2026, 10, 18, 10, 0, 0) };
  const maintenant = () => h.instant;
  const limite = ouvrirLimite({ maintenant, alerter: () => {} });
  t.after(() => limite.fermer());
  const lecture = (projet: string) => etiquetteDe([`repos/o/${projet}/issues`], { projet });
  for (const [projet, n] of [["a", 10], ["b", 2]] as const) {
    for (let i = 0; i < n; i += 1) {
      h.instant += 1000;
      limite.prendre("cuisine", undefined, lecture(projet));
    }
  }
  const reste = 40 * 60_000;
  limite.noter("gh", { restant: 500, plafond: LIMITE_HORAIRE, reset: h.instant + reste });

  const attentes: number[] = [];
  const attendre = (ms: number) => {
    attentes.push(ms);
    return new Promise<void>(() => {});
  };
  let basse = false;
  let haute = false;
  void prendreUnAppel(limite, { gh: "gh", etiquette: lecture("b"), maintenant, attendre }).then(() => (basse = true));
  void prendreUnAppel(limite, { gh: "gh", etiquette: lecture("a"), maintenant, attendre }).then(() => (haute = true));
  await new Promise((suite) => setImmediate(suite));
  assert.equal(basse, true);
  assert.equal(haute, false);
  assert.equal(attentes.length, 1);
  assert.ok(Math.abs(attentes[0]! - reste / 2) <= 2000, `waited ${attentes[0]} ms`);
});
