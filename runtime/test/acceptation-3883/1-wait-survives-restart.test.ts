// #3883, critère 1 : un ticket en attente datée dont la station a redémarré avant la date est relancé après cette date.
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
test("a ticket on a timed wait is retried after its date although its station restarted before it", async () => {
  const faux = new FauxGitHub();
  const jusqua = T0 + 31 * MIN;
  tenu(faux, N, jusqua);
  // La station `box`, qui tient le ticket, redémarre avant la date et ne revient pas : seule `mac` tourne.
  let instant = T0 + 10 * MIN;
  const mac = faux.station(MAC, { places: 1, maintenant: () => new Date(instant) });
  await mac.tour();
  await mac.calme();
  assert.deepEqual(faux.cuissons, [], "no cook before the wait date");
  for (const apres of [1, 7, 8]) {
    instant = jusqua + apres * MIN;
    await mac.tour();
    await mac.calme();
  }
  assert.deepEqual(faux.cuissons.map(({ issue }) => issue), [N], "retried after the date");
});
