// La boucle de la station et la pause de GitHub (#3448) : un tour que la pause
// arrête reprend à sa fin, pas à l'intervalle. Sur BOBL-tech/espace, des
// tickets prenables attendaient leur prise jusqu'au tour d'après la pause :
// cette attente comptait en entier dans leur temps perdu. L'horloge est celle
// du test : rien n'attend le temps réel.
import assert from "node:assert/strict";
import { test, type TestContext } from "node:test";
import { brancherBrigadeGithub, REPRISE_MIN_MS, type StationGitHub } from "../src/brigade-github.ts";
import { LimiteGitHubAtteinte, ouvrirLimite } from "../src/limite-github.ts";

const INTERVALLE_MS = 120_000;

// Une station dont chaque tour prend un appel au compteur, comme le premier
// sondage d'un vrai tour : pendant la pause, il lève `LimiteGitHubAtteinte`.
// Rend les instants (en secondes depuis l'ouverture) des tours qui ont pu appeler GitHub.
// `pauseMs` : la pause posée avant le premier tour, et sa durée.
function boucle(t: TestContext, pauseMs: number) {
  t.mock.timers.enable({ apis: ["setTimeout", "Date"] });
  const limite = ouvrirLimite();
  t.after(() => limite.fermer());
  limite.suspendre(Date.now() + pauseMs);
  const appels: number[] = [];
  const tours: number[] = [];
  const station: StationGitHub = {
    tour: async () => {
      tours.push(Date.now() / 1000);
      limite.prendre();
      appels.push(Date.now() / 1000);
    },
    enCuisine: () => [],
    calme: async () => {},
    relu: async () => {},
  };
  const avertis: string[] = [];
  const ouvert = brancherBrigadeGithub({ station: () => station, intervalleMs: INTERVALLE_MS, avertir: (texte) => void avertis.push(texte) });
  t.after(() => ouvert.arreter());
  const fini = async () => {
    for (let i = 0; i < 10; i += 1) await new Promise<void>((resoudre) => queueMicrotask(resoudre));
  };
  const avancer = async (ms: number) => {
    t.mock.timers.tick(ms);
    await fini();
  };
  return { appels, tours, avertis, fini, avancer };
}

test("a turn stopped by GitHub's pause takes the next one at the pause's end, not at the interval: the next turn calls GitHub at 50 s, not at 120 s (#3448)", async (t) => {
  // La pause est posée avant le premier tour, et finit 50 s plus tard.
  const b = boucle(t, 50_000);
  await b.fini();
  assert.deepEqual(b.tours, [0]);
  assert.deepEqual(b.appels, [], "the first turn is held by the pause");
  await b.avancer(49_000);
  assert.deepEqual(b.tours, [0]);
  await b.avancer(1_000);
  assert.deepEqual(b.appels, [50], "the turn after the pause calls GitHub at its end");
  // Un tour qui passe reprend l'intervalle.
  await b.avancer(INTERVALLE_MS);
  assert.deepEqual(b.appels, [50, 170]);
  // La pause est dite au journal par la limite, pas par la boucle.
  assert.deepEqual(b.avertis.filter((texte) => !/GitHub-only state/.test(texte)), []);
});

test("a pause longer than the interval: turns keep the interval while it lasts, never later than before, and the last one comes at its end (#3448)", async (t) => {
  const b = boucle(t, 5 * 60_000);
  await b.fini();
  await b.avancer(INTERVALLE_MS);
  assert.deepEqual(b.tours, [0, 120]);
  await b.avancer(INTERVALLE_MS);
  assert.deepEqual(b.tours, [0, 120, 240]);
  assert.deepEqual(b.appels, []);
  await b.avancer(60_000);
  assert.deepEqual(b.appels, [300], "the turn at the pause's end calls GitHub");
});

test("a pause already over when it is said (`retry-after: 0`) brings the next turn after REPRISE_MIN_MS, not at once (#3448)", async (t) => {
  t.mock.timers.enable({ apis: ["setTimeout", "Date"] });
  const tours: number[] = [];
  const station: StationGitHub = {
    tour: async () => {
      tours.push(Date.now() / 1000);
      throw new LimiteGitHubAtteinte(Date.now(), 0);
    },
    enCuisine: () => [],
    calme: async () => {},
    relu: async () => {},
  };
  const ouvert = brancherBrigadeGithub({ station: () => station, intervalleMs: INTERVALLE_MS, avertir: () => {} });
  t.after(() => ouvert.arreter());
  const fini = async () => {
    for (let i = 0; i < 10; i += 1) await new Promise<void>((resoudre) => queueMicrotask(resoudre));
  };
  await fini();
  t.mock.timers.tick(REPRISE_MIN_MS - 1);
  await fini();
  assert.deepEqual(tours, [0]);
  t.mock.timers.tick(1);
  await fini();
  assert.deepEqual(tours, [0, REPRISE_MIN_MS / 1000]);
});
