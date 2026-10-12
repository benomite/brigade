// Le nom d'un projet, avant la box et après : la forme qu'une instance accepte, dite à la
// saisie, et ce qu'une lecture prouve du nom. Aucun ssh — les lectures sont celles de box.ts, écrites à la main.
import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { refusDeForme, verdictDeLecture } from "../src/nom.ts";

describe("la forme du nom", () => {
  test("minuscules, chiffres et tirets passent ; un champ vide ne dit rien", () => {
    for (const nom of ["", "  ", "boutique", "ma-cuisine-2", "42"]) assert.equal(refusDeForme(nom), undefined, nom);
  });

  test("une majuscule, un espace, un caractère refusé : le champ le dit, avec la forme attendue", () => {
    const raison = refusDeForme("Calculus") as string;
    assert.match(raison, /« C »/);
    assert.match(raison, /minuscules, chiffres et tirets/);
    assert.match(refusDeForme("ma cuisine") as string, /espace/);
    assert.match(refusDeForme("a_b.c") as string, /« _ », « \. »/);
  });
});

describe("ce qu'une lecture prouve du nom", () => {
  const echec = (cas: "projet-inconnu" | "ssh-en-echec" | null, atteinte: boolean) => ({ erreur: "$ ssh …\nbrigade : refus\n→ code de sortie 65", atteinte, cas });

  test("une lecture qui rend ses sorties : la box connaît le projet", () => {
    const verdict = verdictDeLecture("boutique", "box", { sorties: [{ commande: "status", texte: "ok" }] });
    assert.equal(verdict.etat, "connue");
  });

  test("le refus 65 : inconnue — avec le geste qui crée l'instance, et sans rien interdire", () => {
    const verdict = verdictDeLecture("calculus", "box", echec("projet-inconnu", true));
    assert.equal(verdict.etat, "inconnue");
    assert.match(verdict.texte, /ajouté quand même/);
    assert.match(verdict.texte, /geste 6 de docs\/installer\.md/);
    assert.match(verdict.texte, /brigade@calculus\.service/);
  });

  test("une box pas jointe, ou un refus d'une autre nature : rien n'est prouvé du nom, et le dit", () => {
    const pas = verdictDeLecture("calculus", "box", echec("ssh-en-echec", false));
    assert.equal(pas.etat, "muette");
    assert.match(pas.texte, /n'a pas été jointe/);
    const autre = verdictDeLecture("calculus", "box", echec(null, true));
    assert.equal(autre.etat, "muette");
    assert.doesNotMatch(autre.texte, /ne connaît pas/);
  });
});
