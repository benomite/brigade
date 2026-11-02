// Chaque mot d'état que l'app affiche vient d'une seule table (bon.ts) : tout état connu y a son mot
// anglais, aucun mot français ne s'affiche, et la vue comme le rail publié n'en gardent pas de copie.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, test } from "node:test";
import { MOTS_DE_CARTE, MOTS_DE_CUISINE, motDEtat } from "../src/bon.ts";
import { rangerLeRailPublie, TONS_DE_PROJET, TONS_DE_TICKET } from "../src/faits.ts";

const FRANCAIS = ["pris", "en attente", "en pass", "servi", "ouverte", "retenue", "arrêtée", "éteinte"];
const VUE = join(import.meta.dirname, "../src/vue");

describe("les mots d'état, en anglais, d'une seule table", () => {
  test("tout état connu d'une carte ou d'une cuisine a son mot anglais", () => {
    for (const etat of TONS_DE_TICKET.keys()) assert.ok(MOTS_DE_CARTE[etat] !== undefined, `« ${etat} » n'a pas de mot`);
    for (const etat of TONS_DE_PROJET.keys()) assert.ok(MOTS_DE_CUISINE[etat] !== undefined, `« ${etat} » n'a pas de mot`);
    for (const etat of [...Object.keys(MOTS_DE_CARTE), ...Object.keys(MOTS_DE_CUISINE)]) {
      const mot = motDEtat(etat);
      assert.ok(!FRANCAIS.includes(mot) && /^[A-Za-z0-9 ]+$/.test(mot), `« ${etat} » s'affiche « ${mot} »`);
    }
    assert.equal(motDEtat("pris"), "taken");
    assert.equal(motDEtat("ouverte"), "open");
    assert.equal(motDEtat("un mot inconnu"), "un mot inconnu");
  });

  test("le rail publié pose le mot anglais de chaque état connu", () => {
    const etats = [...TONS_DE_TICKET.keys()];
    const { colonnes, hors } = rangerLeRailPublie(etats.map((state, rang) => ({ ticket: rang + 1, state, title: "t", url: "https://github.com/o/r/issues/1" })));
    const cartes = [...colonnes.flatMap(({ cartes }) => cartes), ...hors];
    assert.equal(cartes.length, etats.length);
    for (const { etat, mot } of cartes) {
      assert.equal(mot, motDEtat(etat));
      assert.ok(!FRANCAIS.includes(mot ?? etat), `« ${etat} » s'afficherait « ${mot} »`);
    }
  });

  test("la vue et le rail publié ne gardent aucune copie de la table", () => {
    for (const fichier of ["vue.js", "rail-publie.js"]) {
      const source = readFileSync(join(VUE, fichier), "utf8");
      assert.ok(!/["'`](pris|en attente|en pass|servi|ouverte|retenue|arrêtée|éteinte)["'`]\s*[:)]?\s*[?:]\s*["'`](taken|queued|open)/.test(source), fichier);
      assert.ok(!/"86"\s*\?\s*"set aside"/.test(source), `${fichier} traduit « 86 »`);
    }
  });
});
