// #3883, critère 5 : un ticket `taken` avec une attente vivante, ou avec un cook qui tourne, n'est pas libéré — un orphelin, lui, l'est.
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
test("a taken ticket with a live wait, or with a running cook, is not released; an orphan beside them is", async (t) => {
  const faux = new FauxGitHub();
  tenu(faux, 20, T0 + 120 * MIN); // attente vivante
  faux.feu(21, [...CALIBRE, "fire"], "the ticket body"); // un cook tourne dessus, sur cette station
  tenu(faux, 22); // orphelin : sans cook ni attente
  let fin: () => void = () => {};
  t.after(() => fin());
  const bloque = new Promise<{ branche: string }>((resolu) => (fin = () => resolu({ branche: "cook/21" })));
  let instant = T0;
  const mac = faux.station(MAC, { places: 1, maintenant: () => new Date(instant), cuisiner: () => bloque });
  await mac.tour();
  assert.deepEqual(mac.enCuisine(), [21], "a cook runs on #21");
  for (const apres of [10, 20]) {
    instant = T0 + apres * MIN;
    await mac.tour();
  }
  assert.equal(faux.ticket(22).labels.has(LABEL_TAKEN), false, "the orphan is released");
  assert.equal(faux.ticket(20).labels.has(LABEL_TAKEN), true, "the ticket on a live wait keeps taken");
  assert.equal(faux.ticket(21).labels.has(LABEL_TAKEN), true, "the ticket with a running cook keeps taken");
});
