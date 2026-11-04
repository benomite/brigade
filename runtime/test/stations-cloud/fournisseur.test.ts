// Le contrat d'un hôte de stations cloud (#2228), tenu par le faux hôte en
// mémoire des tests : démarrer une station pour un projet, l'arrêter, lister
// celles qui tournent.
import assert from "node:assert/strict";
import { test } from "node:test";
import { fauxFournisseur } from "../../src/stations-cloud/fournisseur.ts";

const NEUF_HEURES = new Date("2026-11-04T09:00:00Z");

test("une station démarrée pour un projet tourne, à l'heure de son démarrage, sous un id qui lui est propre", async () => {
  const hote = fauxFournisseur({ maintenant: () => NEUF_HEURES });
  assert.equal(hote.nom, "faux");
  assert.deepEqual(await hote.lister(), []);
  const premiere = await hote.demarrer("brigade");
  const seconde = await hote.demarrer("brigade");
  assert.notEqual(premiere.id, seconde.id);
  assert.deepEqual(premiere, { id: premiere.id, projet: "brigade", demarreeLe: NEUF_HEURES });
  assert.deepEqual((await hote.lister()).map((station) => station.id), [premiere.id, seconde.id]);
});

test("la liste se restreint au projet demandé", async () => {
  const hote = fauxFournisseur();
  const brigade = await hote.demarrer("brigade");
  const autre = await hote.demarrer("autre");
  assert.deepEqual((await hote.lister("brigade")).map((station) => station.id), [brigade.id]);
  assert.deepEqual((await hote.lister("autre")).map((station) => station.id), [autre.id]);
  assert.deepEqual(await hote.lister("personne"), []);
  assert.equal((await hote.lister()).length, 2);
});

test("une station arrêtée ne tourne plus ; l'arrêt se rejoue sans erreur, et dit si elle tournait", async () => {
  const hote = fauxFournisseur();
  const station = await hote.demarrer("brigade");
  const restante = await hote.demarrer("brigade");
  assert.equal(await hote.arreter(station.id), true);
  assert.deepEqual((await hote.lister("brigade")).map((enCours) => enCours.id), [restante.id]);
  assert.equal(await hote.arreter(station.id), false);
  assert.equal(await hote.arreter("inconnue"), false);
  // Un id n'est jamais rendu deux fois, même après un arrêt.
  assert.ok(!(await hote.lister()).some((enCours) => enCours.id === station.id));
  assert.notEqual((await hote.demarrer("brigade")).id, station.id);
});

test("une station ne démarre pas sans projet", async () => {
  const hote = fauxFournisseur();
  await assert.rejects(hote.demarrer(""), /for a project/);
  await assert.rejects(hote.demarrer("  "), /for a project/);
  assert.deepEqual(await hote.lister(), []);
});

test("ce que rend l'hôte est une copie : la modifier ne change pas ce qui tourne", async () => {
  const hote = fauxFournisseur({ maintenant: () => NEUF_HEURES });
  const station = await hote.demarrer("brigade");
  station.projet = "autre";
  station.demarreeLe.setUTCHours(0);
  const [listee] = await hote.lister();
  assert.deepEqual(listee, { id: station.id, projet: "brigade", demarreeLe: NEUF_HEURES });
  assert.equal(NEUF_HEURES.toISOString(), "2026-11-04T09:00:00.000Z");
});
