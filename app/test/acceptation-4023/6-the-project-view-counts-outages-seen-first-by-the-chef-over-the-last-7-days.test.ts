import assert from "node:assert/strict";
import { test } from "node:test";
import { vueOfPostMortems } from "../../src/projects/post-mortems.ts";

// #4023 : à côté de la liste, le nombre de pannes vues d'abord par le chef sur 7 jours, lu dans « qui l'a vu en premier ».
const DAY = 24 * 3600 * 1000;
const NOW = new Date("2026-11-23T12:00:00.000Z");
const it = (ms: number) => new Date(NOW.getTime() - ms).toISOString();
const pm = (cause: string, seenInFirst: string, end: string) => ({ cause, duree: "45 min", vuEnPremier: seenInFirst, corrige: "restart", ticket: "#1", fin: end });

test("a post-mortem older than 7 days and one seen first by the system are not counted", () => {
  const vue = vueOfPostMortems(
    [pm("recent chef", "chef", it(1 * DAY)), pm("edge chef", "chef", it(6 * DAY)), pm("old chef", "chef", it(8 * DAY)), pm("recent system", "system", it(2 * DAY))],
    NOW,
  );
  assert.equal(vue.vusParLeChef, 2);
  assert.equal(vue.lignes.length, 4, "the list still shows all of them");
});
