// #4008 : le déclencheur « pris 3 fois sans livrer » compte aussi les relances où le cook n'a rien
// ajouté sur une CI rouge (le commentaire de la station, sans `n=`), sans compter une relance deux fois.
import assert from "node:assert/strict";
import { test } from "node:test";
import type { GitHubDuTour, TicketLu } from "../../src/brigade-github.ts";
import { PRISES_SANS_LIVRER, reveil } from "../../src/superviseur/declencheur.ts";
import { suivreLeTour } from "../../src/superviseur/tour.ts";

const ticket = (number: number): TicketLu => ({ number, title: `Ticket ${number}`, labels: ["fire", "model:opus", "effort:medium"], state: "open" });
const A_VIDE = (pr: number) =>
  `Station \`box/claude\`: the cook added nothing, and the delivery still has work left — the CI of PR #${pr} is red. The ticket is given back; this is not counted as a failed cook.`;

test("les relances à vide sur une CI rouge comptent dans les prises sans livrer, sans double compte avec un échec", async () => {
  const tour = suivreLeTour(() => new Date("2026-11-20T10:00:00.000Z"));
  const client = {
    fires: async () => [ticket(7)],
    checksDeLaBase: async () => [],
    merger: async () => ({ fait: true }),
    commenter: async () => undefined,
  } as unknown as GitHubDuTour;
  const github = tour.envelopper(client);
  await github.fires();
  await github.commenter(7, A_VIDE(70));
  await github.commenter(7, A_VIDE(70));
  assert.deepEqual(tour.faits().prises, [{ ticket: 7, prises: 2 }]);
  await github.commenter(7, A_VIDE(70));
  assert.deepEqual(tour.faits().prises, [{ ticket: 7, prises: 3 }]);
  assert.deepEqual(reveil(tour.faits(), new Date("2026-11-20T10:01:00.000Z")), { cause: "takes", takes: PRISES_SANS_LIVRER, ticket: 7 });
  // Un échec compté (`n=`) qui suit : le compte de la station fait foi, la relance n'est pas comptée deux fois.
  await github.commenter(7, "<!-- brigade:echec n=4 -->\nStation `box/claude`: the cook stopped without a delivery — boom");
  assert.deepEqual(tour.faits().prises, [{ ticket: 7, prises: 4 }]);
});
