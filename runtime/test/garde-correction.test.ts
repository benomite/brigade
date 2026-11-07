// A correction ticket never lowers a guard (#2679).
import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { GARDES, REGLE_GARDE_CORRECTION, verifierGardesCorrection } from "../src/garde-correction.ts";

const corps = (noms: string[]) => `## Summary\nfix\n\n## Guards left untouched\n${noms.map((n) => `- ${n}`).join("\n")}\n\n## Tests\nok\n`;
const tous = GARDES.map((g) => g.nom);

describe("garde-correction", () => {
  test("the rule text lists all five guards", () => {
    assert.equal(GARDES.length, 5);
    for (const g of GARDES) assert.ok(REGLE_GARDE_CORRECTION.includes(g.nom), g.nom);
  });

  test("a complete body with no guard path passes", () => {
    const c = verifierGardesCorrection(corps(tous), ["runtime/src/x.ts"]);
    assert.equal(c.conforme, true);
  });

  test("a body without the section fails and names it", () => {
    const c = verifierGardesCorrection("## Summary\nfix", []);
    assert.equal(c.conforme, false);
    assert.equal(c.sectionManquante, true);
    assert.match(c.problemes.join("\n"), /Guards left untouched/);
  });

  test("a section omitting one guard fails and names it", () => {
    const c = verifierGardesCorrection(corps(tous.filter((n) => n !== "CI checks")), []);
    assert.equal(c.conforme, false);
    assert.deepEqual(c.gardesOmises.map((g) => g.nom), ["CI checks"]);
    assert.match(c.problemes.join("\n"), /CI checks/);
  });

  test("a path under .github/workflows/ lowers the CI guard", () => {
    const c = verifierGardesCorrection(corps(tous), [".github/workflows/tests.yml"]);
    assert.equal(c.conforme, false);
    assert.equal(c.gardesAbaissees[0]?.garde.nom, "CI checks");
    assert.match(c.problemes.join("\n"), /CI checks/);
  });
});
