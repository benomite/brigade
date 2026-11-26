// #3997 : un geste refusé pour son contenu (donnée personnelle, secret) est refait sans ce contenu, dit au chef en une
// ligne, sans jamais lui demander d'accord.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, test } from "node:test";
import { ROLE_DU_SECOND } from "../../src/second/launch.ts";

const role = readFileSync(ROLE_DU_SECOND, "utf8");

describe("le rôle du second : refus pour le contenu", () => {
  test("distingue le refus du contenu de celui du geste", () => {
    assert.match(role, /refused (because of|for) (its|the) content/i);
  });

  test("retire le contenu et refait le geste", () => {
    assert.match(role, /content[^.\n]*(remove|strip|drop)|(remove|strip|drop)[^.\n]*content/i);
    assert.match(role, /(make|makes|redo|do|retry|retries)[^.\n]*(gesture|it)[^.\n]*again|again[^.\n]*gesture|redo/i);
  });

  test("le dit au chef en une ligne et ne demande aucun accord", () => {
    assert.match(role, /one line/i);
    assert.match(role, /never ask[^.\n]*(approval|agreement|ok)|without (asking|an approval)/i);
  });

});
