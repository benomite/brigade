// Une suite d'exemple, jouée par `couverture.test.ts` sous le vrai lanceur :
// son nom ne finit pas en `.test.ts`, la suite du runtime ne la prend pas.
import { execFileSync, spawn } from "node:child_process";
import { once } from "node:events";
import { join } from "node:path";
import { describe, test } from "node:test";
import { enfant, parent, signe } from "./code.ts";

// Un environnement choisi, où rien du process du test ne passe.
const ENV = { PATH: process.env.PATH ?? "" };

describe("le signe", () => {
  test("positif", () => {
    signe(1);
  });
  test("négatif", () => {
    signe(-1);
  });
});

test("un process attendu", () => {
  execFileSync(process.execPath, [join(import.meta.dirname, "lance-h.ts")], { env: ENV });
});

test("un process lancé", async () => {
  const lance = spawn(process.execPath, [join(import.meta.dirname, "lance-k.ts")], { env: ENV, stdio: "ignore" });
  await once(lance, "exit");
});

test("un parent", async (t) => {
  parent();
  await t.test("son sous-test", () => {
    enfant();
  });
});
