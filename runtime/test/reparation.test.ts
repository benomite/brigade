// La réparation d'une base rouge (`reparation.ts`, #3945) : le ticket `fix` que le superviseur ouvre pour un check
// rouge porte la marque de sa cause, `check:<le check>` ; c'est elle, avec la priorité des réparations, qui fait de
// lui une réparation — la seule livraison qu'une base rouge laisse merger, et ce que la qualité compte.
import assert from "node:assert/strict";
import { test } from "node:test";
import { causeDuCheck, checksRepares, estUneReparation, marqueDeCause, PRIO_REPARATION } from "../src/reparation.ts";

test("the cause mark names the cause, and a cause cannot close the HTML comment that carries it", () => {
  assert.equal(marqueDeCause(causeDuCheck("tests (linux)")), "<!-- brigade:supervisor-cause check:tests (linux) -->");
  assert.equal(marqueDeCause("a --> b"), "<!-- brigade:supervisor-cause a --\\u003e b -->");
});

test("the red checks a body repairs are read from its cause marks, one per line; another cause names no check", () => {
  const corps = ["## Context", "", marqueDeCause(causeDuCheck("tests (linux)")), marqueDeCause("journal-read-twice"), `text ${marqueDeCause(causeDuCheck("inline"))}`, marqueDeCause(causeDuCheck("types (app)"))].join("\n");
  assert.deepEqual(checksRepares(corps), ["tests (linux)", "types (app)"]);
  assert.deepEqual(checksRepares("<!-- brigade:base-rouge sha=abc -->"), []);
});

test("a repair carries the repairs' priority and the mark of a red check; either alone is not one", () => {
  const corps = marqueDeCause(causeDuCheck("tests (linux)"));
  assert.equal(estUneReparation(corps, ["fire", PRIO_REPARATION]), true);
  assert.equal(estUneReparation(corps, ["fire", "prio:1"]), false);
  assert.equal(estUneReparation(marqueDeCause("journal-read-twice"), ["fire", PRIO_REPARATION]), false);
});
