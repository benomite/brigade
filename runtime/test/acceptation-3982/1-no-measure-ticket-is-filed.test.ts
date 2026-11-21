// #3982, critère 1 : plus aucun ticket « Tickets lose too much time », « Quality before time » ou de correction du temps de cuisson.
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";

const SRC = join(import.meta.dirname, "../../src");
// Les titres réellement déposés et les marques que ces tickets portent.
const DEPOSES = ["Quality before time:", "Tickets lose too much time: median", "Cooking takes longer than estimated", "<!-- brigade:qualite -->", "<!-- brigade:temps-max -->", "<!-- brigade:temps-cuisson -->"];

test("no source file of the runtime writes the title or the marker of a lost-time, quality or cooking-time ticket", () => {
  const fichiers = (readdirSync(SRC, { recursive: true }) as string[]).filter((f) => f.endsWith(".ts") && !f.includes("validation-design"));
  const trouves = fichiers.flatMap((f) => {
    const texte = readFileSync(join(SRC, f), "utf8");
    return DEPOSES.filter((d) => texte.includes(d)).map((d) => `${f}: ${d}`);
  });
  assert.deepEqual(trouves, []);
});
