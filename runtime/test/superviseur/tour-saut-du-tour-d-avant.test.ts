// #3761 : entre la lecture des tickets et le passage de la porte de prise, ce que le superviseur lit des sauts dit encore
// ce que la porte a dit au tour d'avant — jamais rien ; la porte qui repasse le remplace, attentes comprises, et ce
// qu'elle ne dit plus tombe au tour suivant.
import assert from "node:assert/strict";
import { test } from "node:test";
import type { GitHubDuTour, TicketLu } from "../../src/brigade-github.ts";
import { direSaut } from "../../src/attente-ticket/attente-ticket.ts";
import { suivreLeTour } from "../../src/superviseur/tour.ts";

const CALIBRE = ["fire", "model:opus", "effort:medium"];
const ticket = (number: number, ...labels: string[]): TicketLu => ({ number, title: `Ticket ${number}`, labels: [...CALIBRE, ...labels], state: "open" });

test("the same ticket skipped for the same reason says the same cause on every turn, even read between the tickets and the gate; a new reason changes it", async () => {
  const suivi = suivreLeTour(() => new Date("2026-11-17T10:00:00.000Z"));
  const github = suivi.envelopper({ fires: async () => [ticket(3734)], commentaires: async () => [] } as unknown as GitHubDuTour);
  const tour = async (raison: string) => {
    await github.fires();
    const entre = suivi.sauts(); // le superviseur lit entre la lecture des tickets et la porte de prise
    suivi.sauter(3734, direSaut(3734, raison));
    return { entre, apres: suivi.sauts() };
  };
  const premier = await tour("zone held by #3700");
  assert.deepEqual(premier.apres, [direSaut(3734, "zone held by #3700")]);
  for (let i = 0; i < 3; i++) assert.deepEqual(await tour("zone held by #3700"), { entre: premier.apres, apres: premier.apres });
  const autre = await tour("its calibration (model, effort) is incomplete");
  assert.deepEqual(autre.apres, [direSaut(3734, "its calibration (model, effort) is incomplete")]);
});

test("a skip of the previous turn is read until the gate passes again; passed again, the gate replaces it, its previous wait included, and what it skips no more drops at the next turn", async () => {
  const suivi = suivreLeTour(() => new Date("2026-11-17T10:00:00.000Z"));
  const github = suivi.envelopper({ fires: async () => [ticket(50), ticket(51), ticket(52), ticket(53, "taken")], commentaires: async () => [] } as unknown as GitHubDuTour);
  await github.fires();
  suivi.sauter(50, "#50: waits for #53", [53]);
  suivi.sauter(51, "#51: zone held by #3700");
  suivi.sauter(52, "#52: waits for #54", [54]);
  assert.deepEqual(suivi.sauts(), ["#51: zone held by #3700", "#52: waits for #54"], "#53 cooks: #50 waits only for the kitchen");

  await github.fires();
  suivi.sauter(50, "#50: zone held by #3700");
  assert.deepEqual(suivi.sauts(), ["#50: zone held by #3700", "#51: zone held by #3700", "#52: waits for #54"], "#50 no longer waits for #53; #51 and #52 keep their cause");
  assert.deepEqual(suivi.faits().cuisinables.map(({ ticket }) => ticket), [50, 51, 52]);

  await github.fires();
  await github.fires();
  assert.deepEqual(suivi.sauts(), [], "two turns without a skip: nothing is said");
  assert.deepEqual(suivi.faits().cuisinables.map(({ ticket }) => ticket), [50, 51, 52]);
});
