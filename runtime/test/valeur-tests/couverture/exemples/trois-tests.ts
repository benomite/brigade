// Une suite d'exemple, jouée par `couverture.test.ts` sous le vrai lanceur :
// son nom ne finit pas en `.test.ts`, la suite du runtime ne la prend pas.
// A et C ne couvrent que f, B couvre f et g.
import { test } from "node:test";
import { f, g } from "./code.ts";

test("A", () => {
  f(1);
});

test("B", () => {
  f(1);
  g(1);
});

test("C", () => {
  f(2);
});
