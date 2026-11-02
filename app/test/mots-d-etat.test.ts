// Chaque mot d'état que l'app affiche se dit en anglais (ticket 1967) : l'étape d'un ticket sur sa carte, l'état de la
// cuisine sur sa pilule. Une seule table (vue/mots-d-etat.js) les traduit ; un mot que le runtime écrit et qu'elle ne
// connaît pas ferait échouer ce test, plutôt que de s'afficher en français.
import assert from "node:assert/strict";
import { describe, test } from "node:test";
import type { Etat } from "../../runtime/src/projections/rail.ts";
import { BLOQUE, nomEtat, nomEtatEn } from "../../runtime/src/rail.ts";
import { ETATS_DE_PROJET } from "../../runtime/src/etat.ts";
import { MOTS_DE_CUISINE, MOTS_DE_TICKET, motDeCuisine, motDeTicket } from "../src/vue/mots-d-etat.js";

// Chaque étape d'un ticket que le runtime connaît : en oublier une ici ne compile pas.
const ETAPES: Record<Etat, true> = { waiting: true, taken: true, pass: true, served: true, "86": true };

// Un mot anglais : sans accent, et aucun des mots français du runtime.
const FRANCAIS = new Set([...Object.keys(MOTS_DE_TICKET), ...Object.keys(MOTS_DE_CUISINE)].filter((mot) => mot !== "86"));
const enAnglais = (mot: string) => /^[A-Za-z ]+$/.test(mot) && !FRANCAIS.has(mot);

describe("le mot d'état que l'app affiche est en anglais", () => {
  test("chaque étape d'un ticket, telle que `faits` l'écrit, se dit comme `status` la dit en anglais — « 86 » en mots simples", () => {
    for (const etape of Object.keys(ETAPES) as Etat[]) {
      const dit = motDeTicket(nomEtat(etape));
      assert.ok(enAnglais(dit), `« ${nomEtat(etape)} » s'affiche « ${dit} »`);
      assert.equal(dit, etape === "86" ? "set aside" : nomEtatEn(etape));
    }
    assert.equal(motDeTicket(BLOQUE), "BLOCKED");
  });

  test("chaque état de la cuisine d'un projet se dit avec le mot du glossaire", () => {
    const dits = ETATS_DE_PROJET.map((etat) => motDeCuisine(etat));
    for (const dit of dits) assert.ok(enAnglais(dit), `« ${dit} » n'est pas en anglais`);
    assert.deepEqual(dits, ["off", "stopped", "held", "open"]);
  });

  test("un mot que les tables ne connaissent pas s'affiche tel quel — même le nom d'une propriété d'objet", () => {
    for (const mot of ["WAITING", "unreadable", "un mot inconnu", "constructor", "toString"]) {
      assert.equal(motDeTicket(mot), mot);
      assert.equal(motDeCuisine(mot), mot);
    }
  });
});
