// L'app ouverte depuis l'image disque (#4269) : chmod échoue en EROFS, l'app ne plante pas.
import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { aideUtilisable } from "../src/pty.ts";

const erreur = (code: string) => Object.assign(new Error(code), { code });
const fs = (chmod: () => void, executable: boolean) => ({ existe: () => true, chmod, executable: () => executable });

describe("l'aide du pty en lecture seule", () => {
  test("EROFS et aide déjà exécutable : l'app tourne", () => {
    assert.equal(aideUtilisable("x", fs(() => { throw erreur("EROFS"); }, true)), true);
  });
  test("EROFS et aide non exécutable : inutilisable, sans lever", () => {
    assert.equal(aideUtilisable("x", fs(() => { throw erreur("EROFS"); }, false)), false);
  });
  test("une autre erreur reste levée", () => {
    assert.throws(() => aideUtilisable("x", fs(() => { throw erreur("EACCES"); }, true)), /EACCES/);
  });
  test("chmod réussi : utilisable", () => {
    assert.equal(aideUtilisable("x", fs(() => {}, false)), true);
  });
  test("pas d'aide (Windows, Linux) : utilisable", () => {
    assert.equal(aideUtilisable("x", { existe: () => false, chmod: () => { throw erreur("EROFS"); }, executable: () => false }), true);
  });
});
