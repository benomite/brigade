// #4162, critère 3 : un ticket qui demande des captures, dans un projet qui les déclare, reçoit l'outil de capture, avec le même genre de cook que tout autre ticket.
import assert from "node:assert/strict";
import { test } from "node:test";
import { outilsDuCook } from "../../src/outils-du-cook.ts";

test("a ticket needing screenshots gets the screenshot tool, and the cook kind is the one of a ticket without tools", () => {
  const projet = { tools: ["screenshots", "browser"] };
  const avec = outilsDuCook({ projet, corpsDuTicket: "## Context\n\nx\n\nTools: screenshots\n" });
  const sans = outilsDuCook({ projet, corpsDuTicket: "## Context\n\nx\n" });
  assert.ok(avec.outils.includes("screenshots"));
  assert.deepEqual(avec.manquants, []);
  assert.ok(avec.genreDeCook, "a cook kind is returned");
  assert.equal(avec.genreDeCook, sans.genreDeCook);
});
