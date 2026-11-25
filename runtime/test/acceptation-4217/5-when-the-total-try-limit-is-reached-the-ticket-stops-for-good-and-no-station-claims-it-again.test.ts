// #4217, critère 5 : à la limite totale d'essais, le ticket s'arrête pour de bon et aucune station ne le reprend.
// Test d'acceptation gelé (#3725) : la limite est celle du rejeu de mirrorlab #923 (critère 7) — 5 essais, 3 puis 2, au total.
// Chaque fois que le ticket est mis de côté, le manager le réécrit et le remet sur le rail, comme la cuisine le fait.
import assert from "node:assert/strict";
import { test } from "node:test";
import { MARQUE_DE_LA_REPRISE } from "../../src/reprise-du-manager.ts";
import { FauxGitHub } from "../faux-github.ts";

const TICKET = 923;
const LIMITE = 5;
const JOUR_MS = 24 * 3_600_000;

test("a ticket whose tries are spent over and over, rewrites and supervisor passes included, stops at the limit and no station takes it again", async () => {
  const faux = new FauxGitHub();
  faux.feu(TICKET);
  let maintenant = new Date("2026-11-24T10:00:00Z").getTime();
  let n = 0;
  const stations = ["A", "B"].map((nom) => faux.station(nom, { cuisiner: async () => ({ echec: `reason ${(n += 1)}` }), maintenant: () => new Date(maintenant), avertir: () => {} }));
  const tourner = async () => {
    for (const station of stations) {
      await station.tour();
      await station.calme();
    }
  };
  for (let tour = 0; tour < 30; tour += 1) {
    const avant = faux.cuissons.length;
    await tourner();
    // Mis de côté : le manager réécrit le ticket, le superviseur le remet sur le rail.
    if (faux.ticket(TICKET).labels.has("set-aside:failures")) {
      faux.poster(TICKET, "manager", `${MARQUE_DE_LA_REPRISE} choice=rewrite -->\nThe manager rewrote the ticket.`);
      faux.ticket(TICKET).corps = `the ticket, rewritten ${tour}`;
      for (const label of ["set-aside:failures", "waiting"]) if (faux.ticket(TICKET).labels.has(label)) await faux.pour("supervisor").delabelliser(TICKET, label);
    }
    if (faux.cuissons.length === avant && tour > 2) break;
  }
  assert.equal(faux.cuissons.length, LIMITE, "the total of tries is bounded, whatever resets were tried");
  // Pour de bon : ni le temps, ni un fait nouveau, ni une réécriture ne le remettent à un cook.
  maintenant += 30 * JOUR_MS;
  faux.poster(TICKET, "client", "A new fact: the client sent the missing key.");
  faux.poster(TICKET, "manager", `${MARQUE_DE_LA_REPRISE} choice=rewrite -->\nThe manager rewrote the ticket once more.`);
  for (let i = 0; i < 4; i += 1) await tourner();
  for (const nom of ["A", "B"]) assert.equal((await faux.prise(faux.pour(nom), nom).prendre({ number: TICKET, labels: [...faux.ticket(TICKET).labels] })).prise, false, `station ${nom} must not claim a stopped ticket`);
  assert.equal(faux.cuissons.length, LIMITE, "no cook leaves after the stop");
});
