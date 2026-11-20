// #3883, critère 6 : un ticket libéré ne bloque plus sa zone : un autre ticket prêt de la même zone passe la porte de prise.
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
test("a released ticket no longer blocks its zone: another ready ticket of the zone is taken", async () => {
  const faux = new FauxGitHub();
  tenu(faux, 1, undefined, "runtime/src/a.ts");
  faux.feu(2, CALIBRE, "the ticket body");
  faux.poster(2, "manager", ficheDe("runtime/src/a.ts"));
  let instant = T0;
  const sauts: string[] = [];
  const mac = faux.station(MAC, { places: 2, maintenant: () => new Date(instant), sauter: (_n, ligne) => void sauts.push(ligne) });
  await mac.tour();
  await mac.calme();
  assert.deepEqual(faux.cuissons, [], "while #1 is held, #2 waits");
  for (const apres of [6, 7, 8]) {
    instant = T0 + apres * MIN;
    await mac.tour();
    await mac.calme();
  }
  assert.ok(faux.cuissons.some(({ issue }) => issue === 2), `#2 passes the claim gate once #1 is released:\n${sauts.join("\n")}`);
});
