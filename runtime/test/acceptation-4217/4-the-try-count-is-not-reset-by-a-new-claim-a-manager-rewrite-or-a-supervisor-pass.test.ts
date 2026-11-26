// #4217, critère 4 : le compte d'essais n'est remis à zéro ni par une nouvelle prise, ni par une réécriture du manager, ni par une passe du superviseur.
// Des stations aux cooks qui échouent, sur le faux GitHub. Le compte se lit au `n=` des commentaires d'échec que la
// station écrit, et par la lecture du runtime (`essaisDuTicket`), celle qui arrête le ticket à sa limite.
import assert from "node:assert/strict";
import { test } from "node:test";
import { essaisDuTicket } from "../../src/claim-hold/essais.ts";
import { MARQUE_DE_LA_REPRISE } from "../../src/reprise-du-manager.ts";
import { FauxGitHub } from "../faux-github.ts";

const TICKET = 923;

function cuisine() {
  const faux = new FauxGitHub();
  faux.feu(TICKET);
  let n = 0;
  const station = (nom: string) => faux.station(nom, { cuisiner: async () => ({ echec: `reason ${(n += 1)}` }), avertir: () => {} });
  const jusqua = async (stations: ReturnType<typeof station>[], essais: number) => {
    for (let i = 0; i < 12 && faux.cuissons.length < essais; i += 1) {
      for (const s of stations) {
        await s.tour();
        await s.calme();
      }
    }
  };
  const commentaires = () => faux.commentaires.get(TICKET) ?? [];
  const compte = () => commentaires().filter((c) => c.body.startsWith("<!-- brigade:echec")).map((c) => Number(/^<!-- brigade:echec n=(\d+)/.exec(c.body)?.[1]));
  const lu = () => essaisDuTicket(commentaires());
  return { faux, station, jusqua, compte, lu };
}

test("a new claim by another station goes on counting", async () => {
  const { station, jusqua, compte, lu } = cuisine();
  const a = station("A");
  const b = station("B");
  await jusqua([a], 1);
  await jusqua([b], 2);
  await jusqua([a, b], 3);
  assert.deepEqual(compte(), [1, 2, 3]);
  assert.deepEqual(lu(), { total: 3, depuisLArret: ["reason 1", "reason 2", "reason 3"] });
});

test("a manager rewrite does not start the count again", async () => {
  const { faux, station, jusqua, compte, lu } = cuisine();
  const a = station("A");
  await jusqua([a], 2);
  faux.poster(TICKET, "manager", `${MARQUE_DE_LA_REPRISE} station=A choice=rewrite -->\nThe manager rewrote the ticket.`);
  faux.ticket(TICKET).corps = "the ticket, rewritten";
  await jusqua([a], 3);
  assert.deepEqual(compte(), [1, 2, 3], "the third try is the third, not the first");
  assert.equal(lu().total, 3);
  assert.equal(lu().depuisLArret.length, 3, "the rewrite does not take a try off the total");
});

test("a supervisor pass that puts the parked ticket back on the rail does not start the count again", async () => {
  const { faux, station, jusqua, compte, lu } = cuisine();
  const a = station("A");
  await jusqua([a], 3);
  assert.ok(faux.ticket(TICKET).labels.has("parked"), "parked by its failure count");
  await faux.pour("supervisor").delabelliser(TICKET, "parked");
  await jusqua([a], 4);
  assert.deepEqual(compte(), [1, 2, 3, 4], "the fourth try is the fourth, not the first");
  assert.equal(lu().depuisLArret.length, 4);
});
