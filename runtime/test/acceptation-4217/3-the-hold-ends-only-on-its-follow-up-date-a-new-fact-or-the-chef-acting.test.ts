// #4217, critère 3 : la retenue ne tombe que sur trois événements — sa date de relance passée, un fait nouveau sur le
// ticket, un geste du chef. Après chacun, le ticket se prend de nouveau : au contrôle de prise (`prendre`), et au tour
// d'une station, qui le cuit.
import assert from "node:assert/strict";
import { test } from "node:test";
import { corpsDuParking } from "../../src/attente-github/attente-github.ts";
import { CALIBRE, FauxGitHub } from "../faux-github.ts";

const HEURE_MS = 3_600_000;
const SEMAINE_MS = 7 * HEURE_MS * 24;

function retenu(relance: number) {
  const faux = new FauxGitHub();
  faux.feu(923, [...CALIBRE, "parked"]);
  faux.poster(923, "A", "<!-- brigade:echec n=1 -->\nStation `A`: the cook stopped without a delivery — the cook committed nothing");
  faux.poster(923, "A", corpsDuParking({ what: "the client's API key", who: "the client", followUp: new Date(relance).toISOString() }));
  return faux;
}
const prend = async (faux: FauxGitHub, nom: string) => (await faux.prise(faux.pour(nom), nom).prendre({ number: 923, labels: [...faux.ticket(923).labels] })).prise;
// Le tour d'une station : le cuit-elle ?
const cuit = async (faux: FauxGitHub) => {
  const station = faux.station("A", { cuisiner: async () => ({ echec: "reason" }), avertir: () => {} });
  await station.tour();
  await station.calme();
  return faux.cuissons.length > 0;
};

test("while nothing of the three has happened, the hold stays: a refused claim, another station's refused claim, a kitchen comment and a turn end nothing", async () => {
  const faux = retenu(Date.now() + SEMAINE_MS);
  assert.equal(await prend(faux, "A"), false);
  assert.equal(await prend(faux, "B"), false);
  faux.poster(923, "manager", "<!-- brigade:reprise-du-manager station=A choice=rewrite -->\nThe manager rewrote the ticket.");
  assert.equal(await prend(faux, "A"), false, "a refused claim or a manager rewrite does not end the hold");
  assert.equal(await cuit(faux), false);
  assert.ok(faux.ticket(923).labels.has("parked"));
});

test("its follow-up date passes: the ticket can be claimed again", async () => {
  assert.equal(await prend(retenu(Date.now() + SEMAINE_MS), "A"), false, "held before its date");
  const apres = retenu(Date.now() - HEURE_MS);
  assert.equal(await prend(apres, "A"), true, "its date is past");
  assert.ok(!apres.ticket(923).labels.has("parked"), "the claim lifts the label of the ended hold");
  assert.equal(await cuit(retenu(Date.now() - HEURE_MS)), true, "a station's turn takes it");
});

test("a new fact is added on the ticket: it can be claimed again", async () => {
  const faux = retenu(Date.now() + SEMAINE_MS);
  assert.equal(await prend(faux, "A"), false, "held before the fact");
  faux.poster(923, "client", "The client sent the missing API key: it is in the shared vault, entry `mirrorlab-prod`.");
  assert.equal(await prend(faux, "A"), true, "a new fact is on the ticket");
  const autre = retenu(Date.now() + SEMAINE_MS);
  autre.poster(923, "client", "The client sent the missing API key.");
  assert.equal(await cuit(autre), true, "a station's turn takes it");
});

test("the chef acts: it can be claimed again", async () => {
  const faux = retenu(Date.now() + SEMAINE_MS);
  assert.equal(await prend(faux, "A"), false, "held before the chef acts");
  await faux.pour("chef").delabelliser(923, "parked");
  assert.equal(await prend(faux, "A"), true, "the chef lifted the hold");
  const autre = retenu(Date.now() + SEMAINE_MS);
  await autre.pour("chef").delabelliser(923, "parked");
  assert.equal(await cuit(autre), true, "a station's turn takes it");
});
