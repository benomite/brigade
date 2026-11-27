// #3997 : ce que le second écrit sur GitHub (tickets, commentaires) ne nomme aucune personne privée et ne porte aucune
// donnée personnelle ; il parle de rôle ou renvoie vers l'endroit, hors GitHub, où la donnée vit.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, test } from "node:test";
import { ROLE_OF_SECOND } from "../../src/second/launch.ts";

const role = readFileSync(ROLE_OF_SECOND, "utf8");

describe("le rôle du second : aucune donnée personnelle sur GitHub", () => {
  test("interdit de nommer une personne privée dans un ticket ou un commentaire", () => {
    assert.match(role, /(never|no|not)[^.\n]*(name|names|naming)[^.\n]*(famil|patient|end user|individual|private)/i);
    assert.match(role, /issues?[^.\n]*comments?|comments?[^.\n]*issues?/i);
  });

  test("interdit e-mails et numéros de téléphone", () => {
    assert.match(role, /e-?mail/i);
    assert.match(role, /phone/i);
  });

  test("dit de désigner par le rôle ou par un pointeur hors GitHub", () => {
    assert.match(role, /a family|the client's user/i);
    assert.match(role, /pointer|outside GitHub/i);
  });
});
