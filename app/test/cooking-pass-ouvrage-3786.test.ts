// #3786 : la pass à l'ouvrage se lit d'un ticket en pass seulement, sur une activité « review running since … ».
import assert from "node:assert/strict";
import { test } from "node:test";
import { agentsDe } from "../src/cooking.ts";
import type { Facts } from "../src/facts.ts";

const rail = (state: string, faitEn: string) =>
  [{ ticket: 7, etat: state, titre: "t", url: "u", activite: { fait: "fr", faitEn, cible: null, depuis: "2026-11-21T10:00:00.000Z" }, attente: null }] as unknown as Facts["rail"];

test("un ticket en pass dont la revue tourne est la pass à l'ouvrage ; un ticket qui n'est pas en pass ne l'est pas", () => {
  assert.deepEqual(agentsDe(undefined, rail("en pass", "review running since 10:00")).map((a) => a.ticket), [7]);
  assert.deepEqual(agentsDe(undefined, rail("au travail", "review running since 10:00")), []);
  assert.deepEqual(agentsDe(undefined, rail("en pass", "review failed at 10:00")), []);
});
