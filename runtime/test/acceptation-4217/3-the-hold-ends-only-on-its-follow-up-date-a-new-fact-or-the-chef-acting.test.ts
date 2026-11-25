// #4217, critère 3 : la retenue ne tombe que sur trois événements — sa date de relance passée, un fait nouveau sur le ticket, un geste du chef.
// Test d'acceptation gelé (#3725) : le contrôle de prise (`prendre`) sur le faux GitHub.
import assert from "node:assert/strict";
import { test } from "node:test";
import { corpsDeLAttente } from "../../src/attente-github/attente-github.ts";
import { CALIBRE, FauxGitHub } from "../faux-github.ts";

const HEURE_MS = 3_600_000;
const SEMAINE_MS = 7 * HEURE_MS * 24;

function retenu(relance: number) {
  const faux = new FauxGitHub();
  faux.feu(923, [...CALIBRE, "set-aside:failures", "waiting"]);
  faux.poster(923, "A", "<!-- brigade:echec n=1 -->\nStation `A`: the cook stopped without a delivery — the cook committed nothing");
  faux.poster(923, "A", corpsDeLAttente({ what: "the station stopped its relaunch loop", who: "the supervisor", followUp: new Date(relance).toISOString(), backOnFollowUp: true, whileSetAside: true }));
  return faux;
}
const prend = async (faux: FauxGitHub, nom: string) => (await faux.prise(faux.pour(nom), nom).prendre({ number: 923, labels: [...faux.ticket(923).labels] })).prise;

test("while nothing of the three has happened, the hold stays: a refused claim, another station's refused claim and the passing of the clock end nothing", async () => {
  const faux = retenu(Date.now() + SEMAINE_MS);
  assert.equal(await prend(faux, "A"), false);
  assert.equal(await prend(faux, "B"), false);
  assert.equal(await prend(faux, "A"), false, "a refused claim does not end the hold");
});

test("its follow-up date passes: the ticket can be claimed again", async () => {
  const faux = retenu(Date.now() + SEMAINE_MS);
  assert.equal(await prend(faux, "A"), false, "held before its date");
  const apres = retenu(Date.now() - HEURE_MS);
  assert.equal(await prend(apres, "A"), true, "its date is past");
});

test("a new fact is added on the ticket: it can be claimed again", async () => {
  const faux = retenu(Date.now() + SEMAINE_MS);
  assert.equal(await prend(faux, "A"), false, "held before the fact");
  faux.poster(923, "client", "The client sent the missing API key: it is in the shared vault, entry `mirrorlab-prod`.");
  assert.equal(await prend(faux, "A"), true, "a new fact is on the ticket");
});

test("the chef acts: it can be claimed again", async () => {
  const faux = retenu(Date.now() + SEMAINE_MS);
  assert.equal(await prend(faux, "A"), false, "held before the chef acts");
  await faux.pour("chef").delabelliser(923, "set-aside:failures");
  await faux.pour("chef").delabelliser(923, "waiting");
  assert.equal(await prend(faux, "A"), true, "the chef lifted the hold");
});
