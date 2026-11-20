// #3883, critère 3 : un ticket `taken`, sans cook sur aucune station et sans attente vivante depuis plus de 5 minutes, perd `taken` et rentre sur le rail.
import assert from "node:assert/strict";
import { test } from "node:test";
import { corpsDePrise } from "../../src/github-etat/prise.ts";
import { LABEL_TAKEN } from "../../src/github-etat/etats.ts";
import { CALIBRE, FauxGitHub } from "../faux-github.ts";

const N = 20;
const BOX = "box";
const MAC = "mac";
const T0 = Date.parse("2026-11-19T14:00:00Z");
const MIN = 60_000;
const ficheDe = (...zone: string[]) => `<!-- brigade:fiche -->\n- awaiting: none\n- zone: ${zone.join(", ")}`;
const attente = (jusqua: number) => `<!-- brigade:attente until=${jusqua} -->\nStation \`${BOX}\`: the cook stopped without a delivery — the station restarted.\n\nThe ticket waits until ${new Date(jusqua).toISOString()}, then is retried.`;
// Un ticket que la station `box` tient (`taken`), sur une attente datée si `jusqua` est donné.
function tenu(faux: FauxGitHub, numero: number, jusqua?: number, ...zone: string[]): void {
  faux.feu(numero, [...CALIBRE, LABEL_TAKEN], "the ticket body");
  if (zone.length > 0) faux.poster(numero, "manager", ficheDe(...zone));
  faux.poster(numero, BOX, corpsDePrise(BOX));
  if (jusqua !== undefined) faux.poster(numero, BOX, attente(jusqua));
}

// Libérer sans cook : la station ne le reprend pas dans la foulée (aucune place).
test("a taken ticket with no cook on any station and no live wait for more than 5 minutes loses taken and returns to the rail", async () => {
  const faux = new FauxGitHub();
  tenu(faux, N);
  let instant = T0;
  // Aucune place : la station qui le libère ne le reprend pas dans la foulée.
  const mac = faux.station(MAC, { places: 0, maintenant: () => new Date(instant) });
  await mac.tour();
  await mac.calme();
  assert.equal(faux.ticket(N).labels.has(LABEL_TAKEN), true, "not released at once: the 5 minutes have not passed");
  instant = T0 + 6 * MIN;
  await mac.tour();
  await mac.calme();
  assert.equal(faux.ticket(N).labels.has(LABEL_TAKEN), false, "taken is removed");
  assert.equal(faux.ticket(N).labels.has("fire"), true, "the ticket is back on the rail");
  assert.equal(faux.ticket(N).state, "open");
});
