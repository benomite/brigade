// Ce que le workflow publier-app publie, vu depuis une app Windows : le flux de la release.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { fluxDe, WINDOWS } from "../../src/mise-a-jour/flux.ts";
import { unFauxFlux } from "./faux-flux.ts";

const workflow = readFileSync(fileURLToPath(new URL("../../../.github/workflows/publier-app.yml", import.meta.url)), "utf8");

test("a Windows app one version behind is offered the new version, whichever way the release was published", async (t) => {
  const listes = [...workflow.matchAll(/^\s*fichiers=\((.*)\)\s*$/gm)].map((m) => m[1] ?? "");
  assert.ok(listes.length > 0);
  for (const liste of listes) {
    const publieLeFlux = /\blatest\.yml\b/.test(liste);
    const exe = Buffer.from("le setup de 1.0.348");
    const faux = await unFauxFlux(t, { "1.0.347": { dmg: Buffer.from("a"), exe: Buffer.from("b") }, "1.0.348": { dmg: Buffer.from("c"), exe, ymlExe: publieLeFlux ? undefined : null } });
    const nouvelle = await fluxDe(faux.adresse, WINDOWS).nouvelle("1.0.347");
    assert.equal(nouvelle?.version, "1.0.348", `release published as: ${liste}`);
  }
});
