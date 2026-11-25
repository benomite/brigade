// Les délais des dernières 24 heures (#4309), hors de la vue jouée : relayés par le suivi de la station, relus par la vue —
// le pire d'abord, les illisibles écartés, jamais un chiffre inventé — et un dépassement qui s'ouvre puis se referme.
import assert from "node:assert/strict";
import { test } from "node:test";
import { lireSuivi } from "../../src/projets/demande.ts";
import { lireLesDelais, tenirLesDelais } from "../../src/vue-delais/delais.js";
import { Faux } from "../aides/fausse-vue.ts";

const doc = { createElement: (balise: string) => new Faux(balise) };
const PARTS = { cook: 1, gates: 2, review: 3, renvois: 4, attentes: 5 };
const pire = (ticket: number, attendu_min: number, reel_min: number, repartition_min: object = PARTS) => ({ ticket, titre: `T${ticket}`, attendu_min, reel_min, modele: "opus", effort: "medium", repartition_min });
const DELAIS = { fenetre_heures: 24, fusionnes: 9, dans_les_temps: 6, part_dans_les_temps: 6 / 9, sans_temps_attendu: 2, pires_depassements: [pire(1, 30, 40), pire(2, 10, 60), pire(3, 5, 30)] };
const suivi = (plus: object) => JSON.stringify({ brigade: "projets-suivi", projets: [{ nom: "parade", etat: "servi", ...plus }] });

test("the station's published follow-up relays `delais` as is, and says nothing of it when absent", () => {
  assert.deepEqual(lireSuivi(suivi({ delais: DELAIS }))[0]?.delais, DELAIS);
  assert.equal("delais" in (lireSuivi(suivi({}))[0] ?? {}), false);
});

test("the overruns come worst first, by minutes over the expected time; an unreadable one is left out", () => {
  const lus = lireLesDelais({ ...DELAIS, pires_depassements: [...DELAIS.pires_depassements, { ticket: 4, titre: "no times" }, pire(5, -1, 9), null] });
  assert.deepEqual(lus?.pires.map(({ ticket }) => ticket), [2, 3, 1]);
  assert.equal(lireLesDelais({ ...DELAIS, pires_depassements: [pire(6, 0, 0)] })?.pires.length, 1, "zero minutes is a reading");
});

test("no readable share, no figure: a missing count or a share that is not a number gives nothing", () => {
  for (const faux of [{ part_dans_les_temps: "0.8" }, { part_dans_les_temps: Number.NaN }, { part_dans_les_temps: -0.1 }, { fusionnes: null }, { dans_les_temps: undefined }]) {
    assert.equal(lireLesDelais({ ...DELAIS, ...faux }), null, JSON.stringify(faux));
  }
  assert.equal(lireLesDelais(undefined), null);
  assert.equal(lireLesDelais({ ...DELAIS, part_dans_les_temps: 0 })?.part, 0, "no ticket on time is a share");
});

test("the block says the share, how many have no expected time, and the window it covers", () => {
  const texte = tenirLesDelais(doc).poser("parade", { ...DELAIS, fenetre_heures: 12 }).textContent;
  assert.match(texte, /^Last 12 hours/);
  assert.match(texte, /67 % merged within their expected time \(6\/9\) · 2 without an expected time/);
  assert.doesNotMatch(tenirLesDelais(doc).poser("parade", { ...DELAIS, sans_temps_attendu: 0 }).textContent, /without an expected time/);
  assert.match(tenirLesDelais(doc).poser("parade", { ...DELAIS, fenetre_heures: undefined, sans_temps_attendu: "x" }).textContent, /^Last 24 hours67 % merged within their expected time \(6\/9\)#2 /);
});

test("an overrun opens on a click, closes on the second, and stays open when the block is posed again", () => {
  const tenus = tenirLesDelais(doc);
  const bouton = () => tenus.poser("parade", DELAIS).children.at(-1)?.children[0]?.children[0] ?? assert.fail("no overrun");
  const premier = bouton();
  assert.equal(premier.ariaExpanded, "false");
  assert.doesNotMatch(premier.parentElement?.textContent ?? "", /Cook:/);
  premier.click();
  assert.equal(premier.ariaExpanded, "true");
  assert.match(premier.parentElement?.textContent ?? "", /Cook: 1 minGates: 2 minReview: 3 minSend-backs: 4 minWaits: 5 min$/);
  const repose = bouton();
  assert.equal(repose.ariaExpanded, "true", "still open after the view is posed again");
  repose.click();
  assert.equal(repose.ariaExpanded, "false");
  assert.doesNotMatch(repose.parentElement?.textContent ?? "", /Cook:/);
  repose.click();
  assert.equal(tenus.poser("cantine", DELAIS).children.at(-1)?.children[0]?.children[0]?.ariaExpanded, "false", "another kitchen's overrun is not opened");
});

test("an overrun whose breakdown is not readable says so when opened, and makes up no minute", () => {
  const bloc = tenirLesDelais(doc).poser("parade", { ...DELAIS, pires_depassements: [pire(7, 5, 50, { cook: 1, gates: 2, review: 3, renvois: 4 })] });
  const bouton = bloc.children.at(-1)?.children[0]?.children[0] ?? assert.fail("no overrun");
  bouton.click();
  assert.match(bouton.parentElement?.textContent ?? "", /Where its time went is not readable\.$/);
});
