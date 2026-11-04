// Le relevé de GitHub de `measures` : les minutes limitées et le pic d'écritures
// à la minute, sur sept jours, d'un historique synthétique.
import assert from "node:assert/strict";
import { join } from "node:path";
import { test } from "node:test";
import { direLeReleveGitHub, mesuresGitHubDeLaStation, releveGitHubDeLaStation } from "../src/mesures-github.ts";
import { repertoireTemporaire } from "./outils.ts";

const MINUTE = 60_000;
const JOUR = 24 * 60 * MINUTE;
// Au milieu d'une minute : un épisode y touche chaque minute qu'il traverse.
const DEPART = Date.parse("2026-10-15T12:00:30Z");
const MINUTE_PLEINE = Date.parse("2026-10-15T12:00:00Z");

function unePhase(t: Parameters<typeof repertoireTemporaire>[0]) {
  const racine = repertoireTemporaire(t);
  let horloge = DEPART;
  const mesures = mesuresGitHubDeLaStation(racine, { maintenant: () => horloge });
  t.after(() => mesures.fermer());
  return { racine, mesures, avancer: (ms: number) => (horloge += ms), maintenant: () => horloge };
}

test("measures: no limit recorded, zero rate-limited minutes", (t) => {
  const { racine, mesures, maintenant } = unePhase(t);
  mesures.noterEcriture();
  assert.equal(releveGitHubDeLaStation(racine, maintenant())?.minutesLimitees, 0);
  assert.equal(releveGitHubDeLaStation(join(racine, "absent"), maintenant()), null);
});

test("measures: a 5-minute limit episode counts 5 rate-limited minutes", (t) => {
  const { racine, mesures, maintenant } = unePhase(t);
  mesures.noterLimite(MINUTE_PLEINE, MINUTE_PLEINE + 5 * MINUTE);
  // Redite du même épisode : les minutes ne se comptent pas deux fois.
  mesures.noterLimite(MINUTE_PLEINE, MINUTE_PLEINE + 5 * MINUTE);
  const releve = releveGitHubDeLaStation(racine, maintenant() + 6 * MINUTE);
  assert.equal(releve?.minutesLimitees, 5);
  assert.deepEqual(direLeReleveGitHub(releve!)[0], "GitHub, last 7 days: 5 rate-limited minutes");
});

test("measures: the peak writes per minute is the busiest minute of the window", (t) => {
  const { racine, mesures, avancer, maintenant } = unePhase(t);
  for (const dans of [3, 7, 4]) {
    for (let i = 0; i < dans; i++) mesures.noterEcriture();
    avancer(MINUTE);
  }
  assert.equal(releveGitHubDeLaStation(racine, maintenant())?.pointEcritures, 7);
  assert.equal(direLeReleveGitHub({ minutesLimitees: 0, pointEcritures: 7 })[1], "GitHub, last 7 days: peak of 7 writes per minute");
});

test("measures: what is older than 7 days leaves the report", (t) => {
  const { racine, mesures, avancer, maintenant } = unePhase(t);
  for (let i = 0; i < 9; i++) mesures.noterEcriture();
  mesures.noterLimite(DEPART, DEPART + 2 * MINUTE);
  avancer(8 * JOUR);
  mesures.noterEcriture();
  assert.deepEqual(releveGitHubDeLaStation(racine, maintenant()), { minutesLimitees: 0, pointEcritures: 1 });
});
