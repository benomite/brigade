// Le temps de l'ajout d'un projet à son premier ticket servi, sur sa page (#1401, épique 1393) : le temps qui court
// tant qu'aucun ticket n'est servi, la durée figée que la station publie ensuite. Le délai est relu par `lireSuivi` comme l'app relit le suivi d'une
// station ; la vue est jouée contre le faux pont (helpers/false-vue.ts).
import assert from "node:assert/strict";
import { describe, test } from "node:test";

import { readTracking } from "../../../src/projects/request.ts";
import { durationInClear } from "../../../src/vue/project/delay.js";
import { Fake } from "../../helpers/false-vue.ts";

const doc = { createElement: (balise: string) => new Fake(balise) };
const ADDITION = "2026-10-22T10:00:00.000Z";
const SERVED = "2026-10-22T12:34:56.789Z";
const HOUR = 3600_000;

// Ce que l'app relit du suivi d'une station qui publie ce délai.
const reread = (delay: object | undefined) => readTracking(JSON.stringify({ brigade: "projets-suivi", projets: [{ nom: "parade", etat: "servi", ...(delay === undefined ? {} : { delai: delay }) }] }))[0]?.delai;

describe("la ligne, posée par le module", () => {
  test("une durée se dit en clair", () => {
    assert.equal(durationInClear(30_000), "under a minute");
    assert.equal(durationInClear(12 * 60_000), "12 min");
    assert.equal(durationInClear(2 * HOUR), "2 h");
    assert.equal(durationInClear(2 * HOUR + 34 * 60_000), "2 h 34 min");
    assert.equal(durationInClear(76 * HOUR), "3 d 4 h");
  });



});

