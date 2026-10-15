// Fichier de tests d'essai : son seul test échoue, tout de suite.
import test from "node:test";

test("un test en échec", () => {
  throw new Error("en échec");
});
