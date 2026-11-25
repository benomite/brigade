// #4242 : le saut d'une zone tenue par une PR porte son code, `zone-held`, et le numéro de la PR : le superviseur le
// garde avec la ligne, pour les seuls cuisinables qu'il dit, et la porte qui repasse sans code l'efface.
import assert from "node:assert/strict";
import { test } from "node:test";
import type { GitHubDuTour, TicketLu } from "../../src/brigade-github.ts";
import { suivreLeTour } from "../../src/superviseur/tour.ts";

const CALIBRE = ["fire", "model:opus", "effort:medium"];
const ticket = (number: number, ...labels: string[]): TicketLu => ({ number, title: `Ticket ${number}`, labels: [...CALIBRE, ...labels], state: "open" });

test("the skip record keeps `zone-held` and the PR number of the cookable tickets it says, and a skip without a code drops it", async () => {
  const suivi = suivreLeTour(() => new Date("2026-11-25T12:00:00.000Z"));
  const github = suivi.envelopper({ fires: async () => [ticket(61), ticket(62), ticket(63), ticket(64, "taken")], commentaires: async () => [] } as unknown as GitHubDuTour);
  await github.fires();
  suivi.sauter(61, "#61: zone held by open PR #4077 (last activity …)", undefined, { code: "zone-held", pr: 4077 });
  suivi.sauter(62, "#62: no station provides `gpu`");
  suivi.sauter(63, "#63: waits for #64", [64], { code: "zone-held", pr: 4080 });
  suivi.sauter(70, "#70: zone held by open PR #4081", undefined, { code: "zone-held", pr: 4081 });
  assert.deepEqual(suivi.raisonsDesSauts(), [{ ticket: 61, code: "zone-held", pr: 4077 }], "#62 has no code, #63 waits only for the kitchen, #70 is not cookable");

  await github.fires();
  suivi.sauter(61, "#61: no station provides `gpu`");
  assert.deepEqual(suivi.raisonsDesSauts(), [], "skipped again for another reason, #61 carries no code");
});
