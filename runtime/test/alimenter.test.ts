// Ce qui reste d'`alimenter` (#2061) : la priorité d'un ticket lue dans ses
// labels, et la configuration du rail lue de l'environnement. Le rail ne
// s'alimente plus de GitHub dans le journal : la station GitHub seul lit les
// tickets sur GitHub.
import assert from "node:assert/strict";
import { test } from "node:test";
import { configRail, priorite } from "../src/alimenter.ts";
import { ConfigInvalide } from "../src/runtime.ts";
import { DEPOT } from "./outils.ts";

test("la priorité d'un ticket se lit dans ses labels — `prio:0`, celle de la réparation d'une base rouge, passe devant toutes", () => {
  assert.equal(priorite(["fire", "prio:2", "feature"]), 2);
  assert.equal(priorite(["prio:3", "prio:1"]), 1);
  assert.equal(priorite(["fire", "prio:haute"]), null);
  assert.equal(priorite(["prio:0"]), 0);
  assert.equal(priorite(["prio:1", "prio:0"]), 0);
  assert.equal(priorite(["prio:10"]), null);
  assert.equal(priorite(["prio:99999999999999999999", "prio:2"]), 2);
  assert.equal(priorite([]), null);
});

test("la configuration du rail vient de l'environnement ; le dépôt n'a pas de défaut", () => {
  assert.deepEqual(configRail({ BRIGADE_GITHUB_REPO: "acme/brigade" }), { depot: "acme/brigade", dureeBailMs: 1_800_000, gh: "gh", communs: [] });
  assert.deepEqual(
    configRail({ BRIGADE_GITHUB_REPO: "acme/brigade.v2", BRIGADE_LEASE_SECONDS: "90", BRIGADE_GH_BIN: "/tmp/gh" }),
    { depot: "acme/brigade.v2", dureeBailMs: 90_000, gh: "/tmp/gh", communs: [] },
  );
  assert.throws(() => configRail({}), (e: unknown) => e instanceof ConfigInvalide && /BRIGADE_GITHUB_REPO is not set/.test(e.message));
  for (const depot of ["brigade", "acme/brigade/issues", "https://github.com/acme/brigade", "acme/ brigade"]) {
    assert.throws(() => configRail({ BRIGADE_GITHUB_REPO: depot }), /BRIGADE_GITHUB_REPO invalid/);
  }
  for (const bail of ["0", "-5", "dix", "1.5"]) {
    assert.throws(() => configRail({ BRIGADE_GITHUB_REPO: DEPOT, BRIGADE_LEASE_SECONDS: bail }), /BRIGADE_LEASE_SECONDS invalid/);
  }
});

test("les chemins communs du projet sont facultatifs, et ce sont des chemins du dépôt", () => {
  const communs = (valeur: string) => configRail({ BRIGADE_GITHUB_REPO: DEPOT, BRIGADE_COMMON_PATHS: valeur }).communs;
  assert.deepEqual(communs(""), []);
  assert.deepEqual(communs(" docs/runtime.md , CHANGELOG.md,, docs/runtime.md "), ["docs/runtime.md", "CHANGELOG.md"]);
  for (const valeur of ["/etc", "docs/../..", "docs/*.md", "~/notes"]) {
    assert.throws(() => communs(valeur), (e: unknown) => e instanceof ConfigInvalide && /BRIGADE_COMMON_PATHS invalid/.test(e.message), valeur);
  }
});
