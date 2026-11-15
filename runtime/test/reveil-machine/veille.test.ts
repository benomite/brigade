// La veille de la machine (#3643) : ce qui voit l'ordinateur dormir, et la
// minuterie d'inactivité qui retranche ce sommeil du silence d'un cook. Les
// horloges sont celles du test : un sommeil de dix minutes est un saut.
import assert from "node:assert/strict";
import { test, type TestContext } from "node:test";
import { guetterLeSilence, veilleMachine, type Sommeil } from "../../src/reveil-machine/veille.ts";

const DIX_MINUTES = 600_000;

function machine(t: TestContext) {
  const horloges = { mono: 1_000, mur: Date.parse("2026-11-15T10:00:00Z") };
  const veille = veilleMachine({ periodeMs: 5_000, seuilMs: 60_000, horloges: { mono: () => horloges.mono, mur: () => horloges.mur } });
  t.after(() => veille.arreter());
  const reveils: Sommeil[] = [];
  veille.surReveil((sommeil) => reveils.push(sommeil));
  // Le temps passe éveillé (les deux horloges), ou endormi : l'horloge murale
  // saute toujours, la monotone selon la machine.
  const passer = (ms: number) => {
    horloges.mono += ms;
    horloges.mur += ms;
  };
  const dormir = (ms: number, { monotoneAussi = true } = {}) => {
    if (monotoneAussi) horloges.mono += ms;
    horloges.mur += ms;
  };
  return { veille, reveils, horloges, passer, dormir };
}

test("une minuterie qui tombe à l'heure, ou un peu en retard, ne voit aucun sommeil", (t) => {
  const { veille, reveils, horloges, passer } = machine(t);
  const ne = horloges.mono;
  passer(5_000);
  veille.regarder();
  passer(30_000);
  veille.regarder();

  assert.deepEqual(reveils, []);
  assert.equal(veille.dormiDepuis(ne), 0);
});

test("un saut de dix minutes de l'horloge murale est un sommeil : son écart est dit au réveil", (t) => {
  const { veille, reveils, dormir } = machine(t);

  dormir(DIX_MINUTES, { monotoneAussi: false });
  veille.regarder();

  assert.equal(reveils.length, 1);
  assert.equal(reveils[0]?.gapMs, DIX_MINUTES);
});

test("une machine dont l'horloge monotone compte aussi le sommeil le voit de même", (t) => {
  const { veille, reveils, dormir } = machine(t);

  dormir(DIX_MINUTES);
  veille.regarder();

  assert.deepEqual(reveils.map((s) => s.gapMs), [DIX_MINUTES]);
});

test("le temps dormi depuis un instant ne compte que la part du sommeil qui le suit", (t) => {
  const { veille, horloges, passer, dormir } = machine(t);
  const avant = horloges.mono;
  passer(2_000);
  veille.regarder();
  const juste = horloges.mono;

  dormir(DIX_MINUTES);
  veille.regarder();
  const apres = horloges.mono;
  passer(3_000);

  assert.equal(veille.dormiDepuis(avant), DIX_MINUTES);
  assert.equal(veille.dormiDepuis(juste), DIX_MINUTES);
  // Né pendant l'intervalle où la machine s'est endormie : seule la suite compte.
  assert.equal(veille.dormiDepuis(juste + 1_000), DIX_MINUTES - 1_000);
  assert.equal(veille.dormiDepuis(apres), 0);
});

test("le réveil récent est celui d'un sommeil qui a coupé la vie du process, et seulement dans la fenêtre qui le suit", (t) => {
  const { veille, horloges, passer, dormir } = machine(t);
  const ne = horloges.mono;

  dormir(DIX_MINUTES);
  veille.regarder();
  const reveille = horloges.mono;

  assert.equal(veille.reveilRecent(ne, 60_000)?.gapMs, DIX_MINUTES);
  // Lancé après le réveil : le sommeil n'a rien coupé.
  assert.equal(veille.reveilRecent(reveille + 1, 60_000), null);
  passer(61_000);
  assert.equal(veille.reveilRecent(ne, 60_000), null);
});

test("le sommeil se voit sur-le-champ, sans attendre la minuterie : celle d'un cook peut tomber avant elle", (t) => {
  const { veille, horloges, dormir, reveils } = machine(t);
  const ne = horloges.mono;

  dormir(DIX_MINUTES);

  assert.equal(veille.dormiDepuis(ne), DIX_MINUTES);
  assert.equal(reveils.length, 1);
});

test("la minuterie d'inactivité retranche le sommeil du silence, puis tombe sur un vrai silence", (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  const { veille, passer, dormir } = machine(t);
  const silences: number[] = [];
  guetterLeSilence(veille, 1_000, (silence) => silences.push(silence));

  // La minuterie de la veille bat pendant l'éveil, et dès le réveil ; le
  // sommeil la fait taire.
  passer(100);
  veille.regarder();
  dormir(DIX_MINUTES);
  veille.regarder();
  passer(800);
  t.mock.timers.tick(1_000);
  assert.deepEqual(silences, [], "le sommeil n'est pas un silence");

  passer(100);
  t.mock.timers.tick(100);
  assert.equal(silences.length, 1, "un vrai silence, au-delà du seuil, l'arrête comme avant");
  assert.ok((silences[0] ?? 0) >= 1_000);
});

test("sans sommeil, la minuterie d'inactivité tombe à son heure, comme avant", (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  const { veille } = machine(t);
  const silences: number[] = [];
  guetterLeSilence(veille, 1_000, (silence) => silences.push(silence));

  t.mock.timers.tick(999);
  assert.deepEqual(silences, []);
  t.mock.timers.tick(1);
  assert.equal(silences.length, 1);
});

test("annulée, la minuterie d'inactivité ne tombe plus", (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  const { veille } = machine(t);
  const silences: number[] = [];
  guetterLeSilence(veille, 1_000, (silence) => silences.push(silence)).annuler();

  t.mock.timers.tick(2_000);
  assert.deepEqual(silences, []);
});
