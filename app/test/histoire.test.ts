// L'histoire et le coût d'un ticket sur sa fiche : un ticket mergé, un ticket en cours, un ticket
// bloqué. Rien n'est inventé : une étape absente n'est pas affichée, une valeur que la box ne
// donne pas est écrite « not communicated ».
import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { histoireDe, situation } from "../src/histoire.ts";

const MERGE = JSON.stringify({
  ticket: 14,
  steps: [
    { kind: "arrived", at: "2026-10-14T08:00:00Z" },
    { kind: "taken", at: "2026-10-14T08:05:00Z", station: "box/claude" },
    { kind: "delivered", at: "2026-10-14T09:10:00Z", run: "r1" },
    { kind: "reviewed", at: "2026-10-14T09:20:00Z", verdict: "red", summary: "a test is missing" },
    { kind: "reviewed", at: "2026-10-14T10:20:00Z", verdict: "green", summary: "all good" },
    { kind: "judged", at: "2026-10-14T10:25:00Z", verdict: "green" },
    { kind: "merged", at: "2026-10-14T10:30:00Z", by: "pass" },
  ],
  cost: { attempts: 2, tokens: 123456, durationMs: 3_900_000, incomplete: false },
});

describe("l'histoire d'un ticket mergé", () => {
  test("les étapes sont dans l'ordre de la box, chacune avec son heure, la relecture en vert ou rouge avec son résumé", () => {
    const histoire = histoireDe(MERGE);
    assert.ok("etapes" in histoire);
    assert.deepEqual(histoire.etapes, [
      { libelle: "arrived", at: "2026-10-14 08:00 UTC" },
      { libelle: "taken by box/claude", at: "2026-10-14 08:05 UTC" },
      { libelle: "delivered", at: "2026-10-14 09:10 UTC" },
      { libelle: "reviewed: red", at: "2026-10-14 09:20 UTC", ton: "rouge", detail: "a test is missing" },
      { libelle: "reviewed: green", at: "2026-10-14 10:20 UTC", ton: "vert", detail: "all good" },
      { libelle: "judged: green", at: "2026-10-14 10:25 UTC", ton: "vert" },
      { libelle: "merged", at: "2026-10-14 10:30 UTC" },
    ]);
  });

  test("le coût : tokens, durée, essais", () => {
    const histoire = histoireDe(MERGE);
    assert.ok("cout" in histoire);
    assert.deepEqual(histoire.cout, { tokens: "123456", duree: "1 h 05", essais: "2", minimum: false });
  });

  test("une valeur que la box ne communique pas est écrite non communiquée, jamais zéro", () => {
    const histoire = histoireDe(JSON.stringify({ ticket: 14, steps: [], cost: { attempts: 1, tokens: null, durationMs: null, incomplete: true } }));
    assert.ok("cout" in histoire);
    assert.deepEqual(histoire.cout, { tokens: "not communicated", duree: "not communicated", essais: "1", minimum: true });
  });

  test("une étape qui n'a pas eu lieu n'est pas affichée, ni inventée", () => {
    const histoire = histoireDe(JSON.stringify({ ticket: 9, steps: [{ kind: "arrived", at: "2026-10-14T08:00:00Z" }], cost: { attempts: 0, tokens: null, durationMs: null, incomplete: false } }));
    assert.ok("etapes" in histoire);
    assert.deepEqual(histoire.etapes.map(({ libelle }) => libelle), ["arrived"]);
  });

  test("une sortie illisible n'est pas lue : la fiche dit pourquoi", () => {
    for (const sortie of ["", "pas du json", "{}", JSON.stringify({ steps: [], cost: { attempts: "x" } })]) assert.ok("sans" in histoireDe(sortie), sortie);
  });
});

describe("ce que la fiche dit d'un ticket vivant", () => {
  test("en cours : ce que son cook fait en ce moment, mot pour mot", () => {
    assert.deepEqual(situation({ etat: "pris", attend: [], dit: [{ libelle: "right now", valeur: "editing app/src/fiche.ts, for 3 min" }] }), {
      libelle: "right now",
      lignes: ["editing app/src/fiche.ts, for 3 min"],
    });
  });

  test("en cours sans activité donnée : écrit comme tel", () => {
    assert.deepEqual(situation({ etat: "en pass", attend: [], dit: [] }), { libelle: "right now", lignes: ["activity not given"] });
  });

  test("bloqué : ce qui le bloque, tel que la carte le dit", () => {
    assert.deepEqual(
      situation({ etat: "en attente", attend: [], dit: [{ libelle: "blocked by", valeur: "#12 not served yet" }, { libelle: "right now", valeur: "x" }] }),
      { libelle: "blocked", lignes: ["blocked by: #12 not served yet"] },
    );
  });

  test("qui t'attend : jamais la ligne de la file — l'attendu est en tête de la fiche ; seul ce que la carte dit de plus se lit ici", () => {
    const ligne = "depuis 40 min  remontée par le manager, rouge — à trancher : merger https://github.com/o/r/pull/8 à la main, ou retirer `fire` — `brigade brigade pass 824`";
    assert.equal(situation({ etat: "86", attend: [ligne], dit: [] }), undefined);
    assert.deepEqual(situation({ etat: "BLOQUÉ", attend: [ligne], dit: [{ libelle: "blocked by", valeur: "#12 not served yet" }] }), { libelle: "blocked", lignes: ["blocked by: #12 not served yet"] });
  });

  test("bloqué sans que la box dise pourquoi : écrit comme tel", () => {
    assert.deepEqual(situation({ etat: "en attente", attend: [], dit: [] }), { libelle: "blocked", lignes: ["what blocks it: not communicated"] });
  });

  test("un ticket mergé n'a ni activité ni blocage", () => {
    assert.equal(situation({ etat: "servi", attend: [], dit: [] }), undefined);
  });
});
