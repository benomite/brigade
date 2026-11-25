// #4217, critère 4 : le compte d'essais n'est remis à zéro ni par une nouvelle prise, ni par une réécriture du manager, ni par une passe du superviseur.
// Test d'acceptation gelé (#3725) : des stations aux cooks qui échouent, sur le faux GitHub ; le compte se lit au `n=` des commentaires d'échec.
import assert from "node:assert/strict";
import { test } from "node:test";
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
  const compte = () =>
    (faux.commentaires.get(TICKET) ?? [])
      .filter((c) => c.body.startsWith("<!-- brigade:echec"))
      .map((c) => Number(/^<!-- brigade:echec n=(\d+)/.exec(c.body)?.[1]));
  return { faux, station, jusqua, compte };
}

test("a new claim by another station goes on counting", async () => {
  const { station, jusqua, compte } = cuisine();
  const a = station("A");
  const b = station("B");
  await jusqua([a], 1);
  await jusqua([b], 2);
  await jusqua([a, b], 3);
  assert.deepEqual(compte(), [1, 2, 3]);
});

test("a manager rewrite does not start the count again", async () => {
  const { faux, station, jusqua, compte } = cuisine();
  const a = station("A");
  await jusqua([a], 2);
  faux.poster(TICKET, "manager", `${MARQUE_DE_LA_REPRISE} choice=rewrite -->\nThe manager rewrote the ticket.`);
  faux.ticket(TICKET).corps = "the ticket, rewritten";
  await jusqua([a], 3);
  assert.deepEqual(compte(), [1, 2, 3], "the third try is the third, not the first");
});

test("a supervisor pass that puts the set-aside ticket back on the rail does not start the count again", async () => {
  const { faux, station, jusqua, compte } = cuisine();
  const a = station("A");
  await jusqua([a], 3);
  assert.ok(faux.ticket(TICKET).labels.has("set-aside:failures"));
  for (const label of ["set-aside:failures", "waiting"]) await faux.pour("supervisor").delabelliser(TICKET, label);
  await jusqua([a], 4);
  assert.deepEqual(compte(), [1, 2, 3, 4], "the fourth try is the fourth, not the first");
});
