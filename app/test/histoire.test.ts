// Ce que la fiche d'un ticket vivant dit en plus de sa carte : ce que son cook fait, ou ce qui le bloque.
// Rien n'est inventé : ce qui manque est écrit « not communicated ».
import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { situation } from "../src/histoire.ts";

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
