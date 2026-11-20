// #3883, critère 2 : une date d'attente passée pendant le redémarrage est relancée au démarrage, pas perdue.
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
test("a wait date that passed during the restart is retried at start, not lost", async () => {
  const faux = new FauxGitHub();
  tenu(faux, N, T0 + 31 * MIN);
  // La station repart deux heures après la date, sans rien savoir de l'attente.
  let instant = T0 + 150 * MIN;
  const mac = faux.station(MAC, { places: 1, maintenant: () => new Date(instant) });
  for (const apres of [0, 6, 7]) {
    instant = T0 + (150 + apres) * MIN;
    await mac.tour();
    await mac.calme();
  }
  assert.deepEqual(faux.cuissons.map(({ issue }) => issue), [N], "the ticket is retried, not lost");
});
