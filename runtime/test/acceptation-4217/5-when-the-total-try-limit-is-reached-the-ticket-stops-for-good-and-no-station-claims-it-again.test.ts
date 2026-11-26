// #4217, critère 5 : à la limite totale d'essais, le ticket s'arrête pour de bon et aucune station ne le reprend.
// La limite est `ESSAIS_AU_TOTAL`, cinq : celle du rejeu de mirrorlab #923 (critère 7) — 3 essais, puis 2.
// Chaque fois que le ticket est parqué par ses échecs, le manager le réécrit et le superviseur le remet sur le rail,
// comme la cuisine le faisait sur #923.
import assert from "node:assert/strict";
import { test } from "node:test";
import { ESSAIS_AU_TOTAL } from "../../src/claim-hold/essais.ts";
import { MARQUE_DE_LA_REPRISE } from "../../src/reprise-du-manager.ts";
import { FauxGitHub } from "../faux-github.ts";

const TICKET = 923;
const JOUR_MS = 24 * 3_600_000;

test("a ticket whose tries are spent over and over, rewrites and supervisor passes included, stops at the limit and no station takes it again", async () => {
  assert.equal(ESSAIS_AU_TOTAL, 5);
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
    // Parqué : le manager réécrit le ticket, le superviseur le remet sur le rail.
    if (faux.ticket(TICKET).labels.has("parked")) {
      faux.poster(TICKET, "manager", `${MARQUE_DE_LA_REPRISE} station=A choice=rewrite -->\nThe manager rewrote the ticket.`);
      faux.ticket(TICKET).corps = `the ticket, rewritten ${tour}`;
      await faux.pour("supervisor").delabelliser(TICKET, "parked");
    }
    if (faux.cuissons.length === avant && tour > 2) break;
  }
  assert.equal(faux.cuissons.length, ESSAIS_AU_TOTAL, "the total of tries is bounded, whatever resets were tried");
  assert.ok(faux.ticket(TICKET).labels.has("chef-todo"), "stopped, it is parked for the chef");
  // Pour de bon : ni le temps, ni un fait nouveau, ni une réécriture, ni une passe qui retire `parked` ne le remettent à un cook.
  maintenant += 30 * JOUR_MS;
  faux.poster(TICKET, "client", "A new fact: the client sent the missing key.");
  faux.poster(TICKET, "manager", `${MARQUE_DE_LA_REPRISE} station=A choice=rewrite -->\nThe manager rewrote the ticket once more.`);
  for (let i = 0; i < 4; i += 1) await tourner();
  for (const nom of ["A", "B"]) {
    const prise = await faux.prise(faux.pour(nom), nom).prendre({ number: TICKET, labels: [...faux.ticket(TICKET).labels] });
    assert.equal(prise.prise, false, `station ${nom} must not claim a stopped ticket`);
  }
  // Même sans son label — retiré par un autre que le chef avant que l'arrêt ne soit posté, ou mal lu —, l'arrêt tient
  // tant que `chef-todo` n'a pas été retiré après lui.
  const sansLabel = [...faux.ticket(TICKET).labels].filter((label) => label !== "chef-todo");
  assert.equal((await faux.prise(faux.pour("A"), "A").prendre({ number: TICKET, labels: sansLabel })).prise, false, "the stop mark holds the claim");
  assert.equal(faux.cuissons.length, ESSAIS_AU_TOTAL, "no cook leaves after the stop");
});

test("the chef acts on a stopped ticket: it can be claimed again, with a new budget counted from the stop", async () => {
  const faux = new FauxGitHub();
  faux.feu(TICKET);
  let n = 0;
  const station = faux.station("A", { cuisiner: async () => ({ echec: `reason ${(n += 1)}` }), avertir: () => {} });
  for (let i = 0; i < 30 && !faux.ticket(TICKET).labels.has("chef-todo"); i += 1) {
    await station.tour();
    await station.calme();
    if (faux.ticket(TICKET).labels.has("parked")) await faux.pour("supervisor").delabelliser(TICKET, "parked");
  }
  assert.equal(faux.cuissons.length, ESSAIS_AU_TOTAL);
  await faux.pour("chef").delabelliser(TICKET, "chef-todo");
  await station.tour();
  await station.calme();
  assert.equal(faux.cuissons.length, ESSAIS_AU_TOTAL + 1, "the chef's gesture gives it back to a cook");
  assert.ok(!faux.ticket(TICKET).labels.has("chef-todo"), "one failure after the chef acted does not stop it again");
});
