import assert from "node:assert/strict";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { describe, test } from "node:test";
import { nommerLePlusLent, type Lecteurs } from "../src/lenteur/nommer.ts";
import { demarrer } from "../src/runtime.ts";
import { photoDuProjet } from "../src/status.ts";
import { repertoireTemporaire } from "./outils.ts";

const min = (n: number) => n * 60;
const parts = (...p: number[]) => p.map((partOutils) => ({ partOutils, claude: 0, outils: 0 }));
function lecteurs(durees: Partial<Record<"ci" | "gates" | "tests", number[]>>, p: ReturnType<typeof parts> = []): Lecteurs {
  return { lireDurees: () => ({ ci: [], gates: [], tests: [], ...durees }), lirePartsCook: () => p };
}

describe("nommerLePlusLent", () => {
  test("CI median 7 min, the highest value, gives 'CI: 7 min median'", () => {
    const lent = nommerLePlusLent("p", { lecteurs: lecteurs({ ci: [min(6), min(7), min(8)], gates: [min(2)], tests: [min(3)] }) });
    assert.equal(lent?.partie, "ci");
    assert.equal(lent?.phrase, "CI: 7 min median");
    assert.equal(lent?.chiffres.mediane, min(7));
  });

  test("cook tool share median 0.7 gives 'a cook spends 70 % of its time in tests'", () => {
    const lent = nommerLePlusLent("p", { lecteurs: lecteurs({}, parts(0.5, 0.7, 0.9)) });
    assert.equal(lent?.partie, "cook");
    assert.equal(lent?.phrase, "a cook spends 70 % of its time in tests");
  });

  test("the greatest impact wins: a cook's tool seconds weigh against CI minutes", () => {
    const cooks = [{ partOutils: 0.7, claude: 300, outils: 700 }];
    assert.equal(nommerLePlusLent("p", { lecteurs: lecteurs({ ci: [min(7)] }, cooks) })?.partie, "cook");
    assert.equal(nommerLePlusLent("p", { lecteurs: lecteurs({ ci: [min(20)] }, cooks) })?.partie, "ci");
  });

  test("gates and tests are named too, and under a minute is said in seconds", () => {
    assert.equal(nommerLePlusLent("p", { lecteurs: lecteurs({ gates: [min(4)], ci: [min(1)] }) })?.phrase, "gates: 4 min median");
    assert.equal(nommerLePlusLent("p", { lecteurs: lecteurs({ tests: [45] }) })?.phrase, "tests: 45 s median");
  });

  test("returns null when nothing is recorded", () => {
    assert.equal(nommerLePlusLent("p", { lecteurs: lecteurs({}) }), null);
  });
});

describe("status shows the slowest part", () => {
  function projet(t: Parameters<typeof repertoireTemporaire>[0], durees?: object) {
    const etat = repertoireTemporaire(t);
    demarrer({ repertoireEtat: etat, projet: "brigade" }).arreter("test");
    if (durees) writeFileSync(join(etat, "durees.json"), JSON.stringify(durees));
    const depot = repertoireTemporaire(t);
    return { BRIGADE_STATE_DIR: etat, BRIGADE_PROJECT: "brigade", BRIGADE_REPO_DIR: depot };
  }

  test("a project with data has the sentence in its status output", (t) => {
    const env = projet(t, { ci: [min(7)], gates: [min(1)], tests: [min(2)] });
    assert.ok(photoDuProjet(env).includes("slowest     CI: 7 min median"));
  });

  test("a project with a cook share also gets it from the project's own folder", (t) => {
    const env = projet(t);
    mkdirSync(join(env.BRIGADE_REPO_DIR, ".claude/brigade"), { recursive: true });
    writeFileSync(join(env.BRIGADE_REPO_DIR, ".claude/brigade/parts-cook.json"), JSON.stringify([{ cookId: "a", claude: 30, outils: 70 }]));
    assert.ok(photoDuProjet(env).includes("slowest     a cook spends 70 % of its time in tests"));
  });

  test("a project without data prints no slowness line", (t) => {
    const env = projet(t);
    assert.ok(!photoDuProjet(env).some((ligne) => ligne.startsWith("slowest")));
  });
});
