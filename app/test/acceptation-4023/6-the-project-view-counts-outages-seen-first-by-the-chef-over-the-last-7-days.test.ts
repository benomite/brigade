import assert from "node:assert/strict";
import { test } from "node:test";
import { vueDesPostMortems } from "../../src/projects/post-mortems.ts";

// #4023 : à côté de la liste, le nombre de pannes vues d'abord par le chef sur 7 jours, lu dans « qui l'a vu en premier ».
const DAY = 24 * 3600 * 1000;
const MAINTENANT = new Date("2026-11-23T12:00:00.000Z");
const il = (ms: number) => new Date(MAINTENANT.getTime() - ms).toISOString();
const pm = (cause: string, vuEnFirst: string, fin: string) => ({ cause, duree: "45 min", vuEnPremier: vuEnFirst, corrige: "restart", ticket: "#1", fin });

test("a post-mortem older than 7 days and one seen first by the system are not counted", () => {
  const vue = vueDesPostMortems(
    [pm("recent chef", "chef", il(1 * DAY)), pm("edge chef", "chef", il(6 * DAY)), pm("old chef", "chef", il(8 * DAY)), pm("recent system", "system", il(2 * DAY))],
    MAINTENANT,
  );
  assert.equal(vue.vusParLeChef, 2);
  assert.equal(vue.lignes.length, 4, "the list still shows all of them");
});
