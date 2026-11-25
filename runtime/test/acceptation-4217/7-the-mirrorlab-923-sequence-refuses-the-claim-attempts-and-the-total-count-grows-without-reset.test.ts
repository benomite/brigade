// #4217, critère 7 : le rejeu de mirrorlab #923 (24 novembre 2026) — 3 échecs, WAITING, mis de côté, tentative de prise, réécriture, 2 échecs, tentative de prise.
// Test d'acceptation gelé (#3725) : une station aux cooks qui échouent, une horloge fixée, le faux GitHub.
import assert from "node:assert/strict";
import { test } from "node:test";
import { MARQUE_DE_LA_REPRISE } from "../../src/reprise-du-manager.ts";
import { FauxGitHub } from "../faux-github.ts";

const TICKET = 923;
const MINUTE_MS = 60_000;

test("#923 on 2026-11-24: both claim attempts are refused and the count goes 1, 2, 3, 4, 5 with no reset", async () => {
  const faux = new FauxGitHub();
  faux.feu(TICKET);
  let maintenant = new Date("2026-11-24T10:00:00Z").getTime();
  let n = 0;
  const station = faux.station("A", { cuisiner: async () => ({ echec: `reason ${(n += 1)}` }), maintenant: () => new Date(maintenant), avertir: () => {} });
  const tentative = async () => {
    await station.tour();
    await station.calme();
    return (await faux.prise(faux.pour("A"), "A").prendre({ number: TICKET, labels: [...faux.ticket(TICKET).labels] })).prise;
  };
  const compte = () =>
    (faux.commentaires.get(TICKET) ?? [])
      .filter((c) => c.body.startsWith("<!-- brigade:echec"))
      .map((c) => Number(/^<!-- brigade:echec n=(\d+)/.exec(c.body)?.[1]));

  // 3 failures: WAITING and set aside.
  for (let i = 0; i < 12 && faux.cuissons.length < 3; i += 1) {
    await station.tour();
    await station.calme();
  }
  assert.equal(faux.cuissons.length, 3);
  assert.ok(faux.ticket(TICKET).labels.has("set-aside:failures"));
  assert.ok(faux.ticket(TICKET).labels.has("waiting"));

  // The claim attempt one minute later is refused.
  maintenant += MINUTE_MS;
  const cuissonsAvant = faux.cuissons.length;
  assert.equal(await tentative(), false, "the first claim attempt is refused");
  assert.equal(faux.cuissons.length, cuissonsAvant, "no cook leaves on the first attempt");

  // The manager rewrites the ticket and puts it back on the rail.
  faux.poster(TICKET, "manager", `${MARQUE_DE_LA_REPRISE} choice=rewrite -->\nThe manager rewrote the ticket.`);
  faux.ticket(TICKET).corps = "the ticket, rewritten";
  for (const label of ["set-aside:failures", "waiting"]) await faux.pour("manager").delabelliser(TICKET, label);

  // 2 failures.
  for (let i = 0; i < 12 && faux.cuissons.length < 5; i += 1) {
    await station.tour();
    await station.calme();
  }
  assert.equal(faux.cuissons.length, 5);
  assert.deepEqual(compte(), [1, 2, 3, 4, 5], "the total count grows, the rewrite does not reset it");

  // The second claim attempt is refused.
  maintenant += MINUTE_MS;
  assert.equal(await tentative(), false, "the second claim attempt is refused");
  assert.equal(faux.cuissons.length, 5, "no sixth cook leaves");
  assert.deepEqual(compte(), [1, 2, 3, 4, 5]);
});
