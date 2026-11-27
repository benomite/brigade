// #3875 : la lecture de l'alerte « tout mis de côté » dans l'app.
import assert from "node:assert/strict";
import { test } from "node:test";
import { alertsOfRailRead } from "../../src/vue/wait-of-rail/wait-of-rail.ts";

const READ = "2026-11-19T12:00:00.000Z";

test("une alerte tout-mis-de-cote est lue sans cause ; la cause connue d'une autre alerte est gardée", () => {
  const raw = { sorte: "tout-mis-de-cote", phrase: "Nothing is served.", fait: { depuis: READ, ticket: 3 }, geste: "Remove the label.", geree: null };
  assert.deepEqual(alertsOfRailRead([{ ...raw, cause: "tout-mis-de-cote" }]), { alertesDuRail: [raw] });
  assert.deepEqual(alertsOfRailRead([{ ...raw, sorte: "cuisine-muette", cause: "base-rouge" }]), { alertesDuRail: [{ ...raw, sorte: "cuisine-muette", cause: "base-rouge" }] });
});
