// Le contrat d'un hôte de stations cloud (#2228), tenu par le fournisseur en
// mémoire des tests : démarrer une station pour un projet, l'arrêter, lister
// celles qui tournent.
import assert from "node:assert/strict";
import { test } from "node:test";
import { fournisseurFactice, nomDeStationCloud } from "../../src/stations-cloud/fournisseur.ts";

const NEUF_HEURES = new Date("2026-11-04T09:00:00Z");

test("une station démarrée pour un projet tourne, à l'heure de son démarrage, sous un id et un nom qui lui sont propres", async () => {
  const { fournisseur, gestes } = fournisseurFactice(() => NEUF_HEURES);
  assert.deepEqual(await fournisseur.lister("brigade"), []);
  const premiere = await fournisseur.demarrer("brigade");
  const seconde = await fournisseur.demarrer("brigade");
  assert.notEqual(premiere.id, seconde.id);
  assert.deepEqual(premiere, { id: premiere.id, projet: "brigade", nom: nomDeStationCloud(premiere.id), depuis: NEUF_HEURES.toISOString() });
  assert.equal(premiere.nom, `cloud/${premiere.id}`);
  assert.deepEqual((await fournisseur.lister("brigade")).map((station) => station.id), [premiere.id, seconde.id]);
  assert.deepEqual(gestes, [`demarrer brigade ${premiere.id}`, `demarrer brigade ${seconde.id}`]);
});

test("la liste se restreint au projet demandé", async () => {
  const { fournisseur } = fournisseurFactice();
  const brigade = await fournisseur.demarrer("brigade");
  const autre = await fournisseur.demarrer("autre");
  assert.deepEqual((await fournisseur.lister("brigade")).map((station) => station.id), [brigade.id]);
  assert.deepEqual((await fournisseur.lister("autre")).map((station) => station.id), [autre.id]);
  assert.deepEqual(await fournisseur.lister("personne"), []);
});

test("une station arrêtée ne tourne plus ; l'arrêt se rejoue sans erreur", async () => {
  const { fournisseur, gestes } = fournisseurFactice();
  const station = await fournisseur.demarrer("brigade");
  const restante = await fournisseur.demarrer("brigade");
  await fournisseur.arreter(station.id);
  assert.deepEqual((await fournisseur.lister("brigade")).map((enCours) => enCours.id), [restante.id]);
  await fournisseur.arreter(station.id);
  await fournisseur.arreter("inconnue");
  assert.deepEqual(gestes.slice(2), [`arreter ${station.id}`, `arreter ${station.id}`, "arreter inconnue"]);
  // Un id n'est jamais rendu deux fois, même après un arrêt.
  assert.notEqual((await fournisseur.demarrer("brigade")).id, station.id);
});

test("ce que rend le fournisseur est une copie : la modifier ne change pas ce qui tourne", async () => {
  const { fournisseur } = fournisseurFactice(() => NEUF_HEURES);
  const station = await fournisseur.demarrer("brigade");
  station.projet = "autre";
  station.depuis = "2000-01-01T00:00:00.000Z";
  const [listee] = await fournisseur.lister("brigade");
  assert.deepEqual(listee, { id: station.id, projet: "brigade", nom: nomDeStationCloud(station.id), depuis: NEUF_HEURES.toISOString() });
});
