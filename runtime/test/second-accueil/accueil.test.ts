// L'accueil du second sur un projet neuf : le mot, l'échec de la préparation,
// l'onboarding fini, et une seule fois par ouverture.
import assert from "node:assert/strict";
import { test } from "node:test";
import { etatDOnboarding, type Entrees, type FaitsDePreparation } from "../../src/onboarding/etat.ts";
import { Accueil, motDAccueil } from "../../src/second-accueil/accueil.ts";

const base: Entrees = {
  projet: "gadgets",
  depot: "ACME-tech/gadgets",
  station: "macbook",
  suivi: { etat: "servi", dit: "served by macbook", autoriser: [] },
  clone: true,
  sansBacASable: false,
  decision: null,
  preparation: null,
  premierTicket: null,
  dejaServi: false,
};
const URL = "https://github.com/ACME-tech/gadgets/issues/433";
const preparation = (faits: Partial<FaitsDePreparation>): FaitsDePreparation => ({ ticket: 433, rail: null, sort: null, pass: null, ...faits });

const neuf = etatDOnboarding({ ...base, preparation: preparation({ rail: { etat: "taken", station: "macbook", raison: null, retour: null, url: URL } }) });
const rate = etatDOnboarding({ ...base, preparation: preparation({ rail: { etat: "86", station: "macbook", raison: "quota", retour: null, url: URL } }) });
const fini = etatDOnboarding({ ...base, preparation: preparation({ sort: { issue: "served", raison: null } }) });

test("projet neuf : nomme le projet, propose l'état de la préparation et les premiers tickets", () => {
  const mot = motDAccueil("gadgets", neuf);
  assert.ok(mot !== null);
  assert.match(mot, /gadgets/);
  assert.match(mot, /where the preparation stands/);
  assert.match(mot, /write your first tickets/);
  assert.doesNotMatch(mot, /failed/);
});

test("préparation en échec : une phrase de plus, qui le dit", () => {
  const mot = motDAccueil("gadgets", rate);
  assert.ok(mot !== null);
  assert.match(mot, /where the preparation stands/);
  assert.match(mot, /The preparation failed: the account's quota is used up\./);
});

test("onboarding fini : pas d'accueil", () => {
  assert.equal(fini.termine, true);
  assert.equal(motDAccueil("gadgets", fini), null);
  assert.equal(new Accueil().saluer("gadgets", "o1", fini), null);
});

test("une seule fois par ouverture, pas à chaque rafraîchissement", () => {
  const accueil = new Accueil();
  assert.ok(accueil.saluer("gadgets", "o1", neuf) !== null);
  assert.equal(accueil.saluer("gadgets", "o1", neuf), null);
  assert.equal(accueil.saluer("gadgets", "o1", rate), null);
  // Une autre ouverture, ou un autre projet, salue.
  assert.ok(accueil.saluer("gadgets", "o2", neuf) !== null);
  assert.ok(accueil.saluer("autre", "o1", neuf) !== null);
  accueil.oublier("gadgets", "o1");
  assert.ok(accueil.saluer("gadgets", "o1", neuf) !== null);
});
