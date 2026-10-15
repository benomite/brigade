// L'ordre des versions de la station est celui de dpkg : comparé ici sans
// lui, il doit rendre ce que `dpkg --compare-versions` rend.
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { test } from "node:test";
import { comparerVersions } from "../../src/mise-a-jour/versions.ts";

const sansDpkg = spawnSync("dpkg", ["--version"]).status !== 0 && "`dpkg` manque sur cette machine : rien à quoi comparer";

// Chaque paire, dans l'ordre où dpkg les range.
const PAIRES: Array<[string, string]> = [
  ["1.0.0", "1.1.0"],
  ["1.9.0", "1.10.0"],
  ["1.1.0~rc1", "1.1.0"],
  ["1.1.0", "1.1.0+b1"],
  ["1.0", "1.0.0"],
  ["1.0a", "1.0b"],
  ["1.0a", "1.0+"],
  ["1.0~~", "1.0~"],
  ["0.20261015.204036+gedf6a46", "0.20261015.211500+g1234abc"],
  ["0.20261015.235959+gffffff", "0.20261016.000000+g000000"],
  ["9.9.9", "1:0.1"],
  ["1.0-1", "1.0-2"],
  ["1.0-9", "1.0-10"],
  ["007", "8"],
];

test("des versions de la station : ce qui vient après vient après, comme dpkg les range", () => {
  for (const [avant, apres] of PAIRES) {
    assert.ok(comparerVersions(avant, apres) < 0, `${avant} < ${apres}`);
    assert.ok(comparerVersions(apres, avant) > 0, `${apres} > ${avant}`);
    assert.equal(comparerVersions(avant, avant), 0, avant);
  }
  assert.equal(comparerVersions("1.00", "1.0"), 0);
});

test("l'ordre est bien celui de `dpkg --compare-versions`", { skip: sansDpkg }, () => {
  for (const [a, b] of PAIRES) {
    for (const [x, y] of [[a, b], [b, a], [a, a]] as const) {
      const lt = spawnSync("dpkg", ["--compare-versions", x, "lt", y]).status === 0;
      const eq = spawnSync("dpkg", ["--compare-versions", x, "eq", y]).status === 0;
      assert.equal(Math.sign(comparerVersions(x, y)), lt ? -1 : eq ? 0 : 1, `${x} / ${y}`);
    }
  }
});
