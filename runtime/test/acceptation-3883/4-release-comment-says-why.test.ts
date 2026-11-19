// #3883, critère 4 : le commentaire posé dit que le ticket était pris sans cook et sans attente, et qu'il retourne sur le rail.
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
test("the comment on a released ticket says it was taken with no cook and no wait, and that it returns to the rail", async () => {
  const faux = new FauxGitHub();
  tenu(faux, N);
  let instant = T0;
  const mac = faux.station(MAC, { places: 0, maintenant: () => new Date(instant) });
  await mac.tour();
  await mac.calme();
  instant = T0 + 6 * MIN;
  await mac.tour();
  await mac.calme();
  const posts = (faux.commentaires.get(N) ?? []).map((c) => c.body).slice(1);
  const dit = posts.find((corps) => /taken/i.test(corps) && /no cook/i.test(corps) && /no wait/i.test(corps) && /rail/i.test(corps));
  assert.ok(dit !== undefined, `no comment says taken with no cook and no wait, back to the rail:\n${posts.join("\n---\n")}`);
  assert.match(dit, /returns? to the rail|back to the rail|put back on the rail/i);
});
