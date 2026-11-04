// Le détecteur de la cuisine retenue (#2281), sans E/S : rien de servi depuis
// 30 min alors que des tickets attendent, et la cause, avec le geste qui la
// lève quand il y en a un.
import assert from "node:assert/strict";
import { test } from "node:test";
import { cleDeCause, detecterRetenue, diagnostiquer, direRetenueEn, GESTE_DE_LA_BASE, GESTE_DU_DISJONCTEUR, RETENUE_APRES_MS, SANS_SIGNAL, type Observation, type Signaux } from "../../src/retenue/retenue.ts";

const A = (hhmmss: string) => `2026-11-04T${hhmmss}.000Z`;
const MAINTENANT = new Date(A("03:00:00"));

// Une cuisine ouverte à minuit, dont le dernier service date de 02:30, et où
// deux tickets attendent depuis 01:00.
const OBSERVATION: Observation = { eteinte: false, enAttente: [12, 13], attenteDepuis: A("01:00:00"), dernierService: A("02:30:00"), ouverture: A("00:00:00") };

test("rien de servi depuis 30 min alors que des tickets attendent : la cuisine est retenue ; à 29 min, ou sans ticket qui attend, elle ne l'est pas", () => {
  assert.equal(RETENUE_APRES_MS, 30 * 60_000);
  const retenue = detecterRetenue(OBSERVATION, SANS_SIGNAL, MAINTENANT);
  assert.deepEqual(retenue, { since: A("02:30:00"), tickets: [12, 13], cause: { kind: "unknown" }, gesture: null });
  assert.equal(detecterRetenue({ ...OBSERVATION, dernierService: A("02:31:00") }, SANS_SIGNAL, MAINTENANT), null);
  assert.equal(detecterRetenue(OBSERVATION, SANS_SIGNAL, new Date(A("02:59:59"))), null);
  assert.equal(detecterRetenue({ ...OBSERVATION, enAttente: [] }, SANS_SIGNAL, MAINTENANT), null);
});

test("le compte part du plus récent des repères : un ticket arrivé sur un rail vide n'a pas attendu les heures où rien n'était à servir", () => {
  // Rien servi depuis la veille, mais le ticket n'attend que depuis 02:45.
  const arrive = { ...OBSERVATION, dernierService: A("00:10:00"), attenteDepuis: A("02:45:00") };
  assert.equal(detecterRetenue(arrive, SANS_SIGNAL, MAINTENANT), null);
  assert.equal(detecterRetenue(arrive, SANS_SIGNAL, new Date(A("03:15:00")))?.since, A("02:45:00"));
  // Une cuisine rouverte à 02:40 recommence son compte.
  assert.equal(detecterRetenue({ ...OBSERVATION, ouverture: A("02:40:00") }, SANS_SIGNAL, MAINTENANT), null);
  // Jamais rien servi : l'ouverture et l'attente comptent seules.
  assert.equal(detecterRetenue({ ...OBSERVATION, dernierService: null }, SANS_SIGNAL, MAINTENANT)?.since, A("01:00:00"));
});

test("une cuisine que le chef a arrêtée ou éteinte n'est pas retenue : elle n'a pas à servir", () => {
  assert.equal(detecterRetenue({ ...OBSERVATION, eteinte: true }, SANS_SIGNAL, MAINTENANT), null);
});

const signaux = (pose: Partial<Signaux>): Signaux => ({ ...SANS_SIGNAL, ...pose });

test("cause : la base rouge, avec les checks qui y échouent, et le geste qui la répare", () => {
  const retenue = detecterRetenue(OBSERVATION, signaux({ baseRouge: { sha: "0123456789abcdef", checks: ["test (windows-latest)", "lint"] } }), MAINTENANT);
  assert.deepEqual(retenue?.cause, { kind: "base-red", sha: "0123456789abcdef", checks: ["test (windows-latest)", "lint"] });
  assert.equal(retenue?.gesture, GESTE_DE_LA_BASE);
  assert.match(retenue?.gesture ?? "", /fix the base by hand/);
  const ligne = direRetenueEn(retenue!);
  assert.match(ligne, /^HELD: nothing served while 2 tickets wait \(#12, #13\) — cause: the base is red on 0123456, failing: test \(windows-latest\), lint — to lift: fix the base by hand/);
});

test("cause : le budget des écritures GitHub, qui se lève seul — aucun geste", () => {
  const retenue = detecterRetenue(OBSERVATION, signaux({ ecritures: { writes: 450, nextAt: A("03:20:00") } }), MAINTENANT);
  assert.deepEqual(retenue?.cause, { kind: "write-pacer", writes: 450, nextAt: A("03:20:00") });
  assert.equal(retenue?.gesture, null);
  assert.match(direRetenueEn(retenue!), /cause: the GitHub write budget holds the kitchen's writes, 450 of 450 in the last hour, next write at \d\d:\d\d — nothing to do: it lifts on its own around \d\d:\d\d$/);
});

test("cause : la limite de GitHub, qui se lève seule à sa reprise — aucun geste", () => {
  const retenue = detecterRetenue(OBSERVATION, signaux({ limiteGitHub: { limit: "secondary-writes", backAt: A("03:32:00") } }), MAINTENANT);
  assert.deepEqual(retenue?.cause, { kind: "github-limit", limit: "secondary-writes", backAt: A("03:32:00") });
  assert.equal(retenue?.gesture, null);
  assert.match(direRetenueEn(retenue!), /cause: GitHub is rate-limiting calls \(secondary limit, writes per minute\), back around \d\d:\d\d — nothing to do: it lifts on its own/);
});

test("cause : le disjoncteur ouvert, et le bouton qui le referme", () => {
  const retenue = detecterRetenue(OBSERVATION, signaux({ disjoncteur: A("02:00:00") }), MAINTENANT);
  assert.deepEqual(retenue?.cause, { kind: "breaker", since: A("02:00:00") });
  assert.equal(retenue?.gesture, GESTE_DU_DISJONCTEUR);
  assert.match(direRetenueEn(retenue!), /cause: the breaker is open since \d\d:\d\d, no cook leaves — to lift: look at what fails, then press the `Resume` button on the breaker line of TODO$/);
});

test("cause inconnue : rien de ce que le runtime lit ne l'explique, et la ligne le dit, sans geste", () => {
  const retenue = detecterRetenue(OBSERVATION, SANS_SIGNAL, MAINTENANT);
  assert.deepEqual(retenue?.cause, { kind: "unknown" });
  assert.equal(retenue?.gesture, null);
  assert.match(direRetenueEn(retenue!), /cause unknown: neither a red base, the GitHub limit, the write budget nor the breaker explains it — no gesture known/);
});

test("plusieurs causes : le disjoncteur, puis la limite de GitHub, puis le budget des écritures, puis la base rouge", () => {
  const toutes = signaux({ disjoncteur: A("02:00:00"), limiteGitHub: { limit: "primary", backAt: A("03:30:00") }, ecritures: { writes: 60, nextAt: A("03:01:00") }, baseRouge: { sha: null, checks: ["lint"] } });
  assert.equal(diagnostiquer(toutes).cause.kind, "breaker");
  assert.equal(diagnostiquer({ ...toutes, disjoncteur: null }).cause.kind, "github-limit");
  assert.equal(diagnostiquer({ ...toutes, disjoncteur: null, limiteGitHub: null }).cause.kind, "write-pacer");
  assert.equal(diagnostiquer({ ...toutes, disjoncteur: null, limiteGitHub: null, ecritures: null }).cause.kind, "base-red");
});

test("la même cause garde sa clé quand sa reprise recule ; d'autres checks rouges en font une autre", () => {
  assert.equal(cleDeCause({ kind: "github-limit", limit: "primary", backAt: A("03:00:00") }), cleDeCause({ kind: "github-limit", limit: "primary", backAt: A("04:00:00") }));
  assert.equal(cleDeCause({ kind: "write-pacer", writes: 60, nextAt: A("03:00:00") }), cleDeCause({ kind: "write-pacer", writes: 450, nextAt: A("03:10:00") }));
  assert.notEqual(cleDeCause({ kind: "base-red", sha: "a", checks: ["lint"] }), cleDeCause({ kind: "base-red", sha: "a", checks: ["lint", "test"] }));
  assert.equal(cleDeCause({ kind: "base-red", sha: "a", checks: ["test", "lint"] }), cleDeCause({ kind: "base-red", sha: "a", checks: ["lint", "test"] }));
});

test("au-delà de cinq tickets, la ligne en nomme cinq et compte les autres", () => {
  const retenue = detecterRetenue({ ...OBSERVATION, enAttente: [1, 2, 3, 4, 5, 6, 7] }, SANS_SIGNAL, MAINTENANT);
  assert.match(direRetenueEn(retenue!), /while 7 tickets wait \(#1, #2, #3, #4, #5 \+2\)/);
  assert.match(direRetenueEn({ ...retenue!, tickets: [9] }), /while 1 ticket waits \(#9\)/);
});
