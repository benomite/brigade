// #4307 : le temps attendu d'un ticket — ce que la consigne en dit, ce qu'en
// garde un ticket joint, et un ticket né avant lui, qui n'en a pas.
import assert from "node:assert/strict";
import { test } from "node:test";
import { consigneDeDecoupage, corpsDuTicket, joindre } from "../../src/decouper.ts";
import type { TicketPrevu } from "../../src/events/manager.ts";
import { lireTempsAttendu } from "../../src/temps-attendu/temps-attendu.ts";

const EPIQUE = { number: 30, title: "Epic", body: "corps", labels: ["epic"], association: "OWNER", state: "open" } as never;
const prevu = (zone: string, expectedMinutes?: number): TicketPrevu => ({
  title: zone,
  context: "",
  criteria: ["c"],
  waitsFor: [],
  zone: [zone],
  model: "sonnet",
  effort: "low",
  calibration: "c",
  ...(expectedMinutes === undefined ? {} : { expectedMinutes }),
});

test("la consigne du découpage fait poser `temps_attendu` avec le guide de taille, et son exemple JSON le porte", () => {
  const consigne = consigneDeDecoupage({ depot: "acme/brigade", issue: EPIQUE, commentaires: [], fichiers: [] });
  assert.match(consigne, /`temps_attendu` : le temps, en minutes entières de 1 à 120/);
  assert.match(consigne, /environ 2 minutes.*environ 10 minutes.*environ 60 minutes/);
  assert.match(consigne, /La plupart des tickets tiennent en 10 minutes ou moins/);
  assert.match(consigne, /Au-delà de 10 minutes, ton `calibrage` dit pourquoi/);
  assert.match(consigne, /"effort": "medium", "temps_attendu": 10, "calibrage"/);
});

test("un ticket joint attend la somme des temps des siens, bornée à 120 ; inconnue si l'un n'en a pas", () => {
  assert.equal(joindre([prevu("a.ts", 7), prevu("a.ts", 8)])[0]?.expectedMinutes, 15);
  assert.equal(joindre([prevu("a.ts", 100), prevu("a.ts", 50)])[0]?.expectedMinutes, 120);
  const sansTemps = joindre([prevu("a.ts", 7), prevu("a.ts")])[0];
  assert.ok(sansTemps && !("expectedMinutes" in sansTemps), JSON.stringify(sansTemps));
});

test("un ticket né avant #4307, sans temps attendu, montre son modèle et son effort seuls", () => {
  assert.match(corpsDuTicket(30, 1, prevu("a.ts")), /Calibrated `sonnet` \/ `low` — c This/);
});

test("une raison se dit en anglais ou en français ; un mot qui en contient un ne compte pas", () => {
  for (const calibrage of ["It touches every judgement, so 30 minutes.", "Because the engine changes.", "Long puisqu'il touche tout."]) {
    assert.ok("minutes" in lireTempsAttendu(30, calibrage), calibrage);
  }
  for (const calibrage of ["Some solution.", "A scary card."]) {
    assert.ok("refus" in lireTempsAttendu(30, calibrage), calibrage);
  }
});
