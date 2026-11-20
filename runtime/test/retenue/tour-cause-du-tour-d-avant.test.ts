// #3761 : entre la lecture des tickets et le passage de la porte de prise, la retenue lit encore ce que la porte a dit au
// tour d'avant — jamais « unknown » ; la porte qui repasse le remplace, attentes comprises, et ce qu'elle ne dit plus tombe.
import assert from "node:assert/strict";
import { test } from "node:test";
import type { GitHubDuTour, TicketLu } from "../../src/brigade-github.ts";
import { suivreLeTour } from "../../src/retenue/tour.ts";

const CALIBRE = ["fire", "model:opus", "effort:high"];
const ticket = (number: number, ...labels: string[]): TicketLu => ({ number, title: `Ticket ${number}`, labels: [...CALIBRE, ...labels], state: "open" });

test("le saut du tour d'avant se lit jusqu'au passage de la porte ; repassée, la porte le remplace, son attente d'avant comprise, et ce qu'elle ne saute plus tombe au tour suivant", async () => {
  const tickets = [ticket(50), ticket(51), ticket(52), ticket(53, "taken")];
  const suivi = suivreLeTour(() => new Date("2026-11-17T10:00:00.000Z"));
  const github = suivi.envelopper({ fires: async () => tickets, commentaires: async () => [] } as unknown as GitHubDuTour);
  await github.fires();
  suivi.sauter(50, "#50: waits for #53", [53]);
  suivi.sauter(51, "#51: zone held by #3700");
  suivi.sauter(52, "#52: waits for #54", [54]);
  assert.deepEqual(suivi.vue().enAttente, [51, 52], "#53 cuit : #50 n'attend pas la cuisine ; #54 ne cuit pas : #52, si");

  await github.fires();
  suivi.sauter(50, "#50: zone held by #3700");
  assert.deepEqual(suivi.vue().enAttente, [50, 51, 52], "#50, sauté pour une autre raison, n'attend plus #53");
  assert.deepEqual(suivi.vue().explications, ["#50: zone held by #3700", "#51: zone held by #3700", "#52: waits for #54"], "#51 et #52, pas encore repassés à ce tour, gardent leur cause");

  await github.fires();
  await github.fires();
  assert.deepEqual(suivi.vue().explications, [], "deux tours sans saut : plus rien n'est dit");
});
