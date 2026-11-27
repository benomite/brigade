// Ce que le workflow publier-app publie, vu depuis une app Windows : le flux de la release.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { fluxOf, WINDOWS } from "../../src/update/flux.ts";
import { oneFakeFlux } from "./fake-flux.ts";

const workflow = readFileSync(fileURLToPath(new URL("../../../.github/workflows/publier-app.yml", import.meta.url)), "utf8");

test("a Windows app one version behind is offered the new version, whichever way the release was published", async (t) => {
  const lists = [...workflow.matchAll(/^\s*fichiers=\((.*)\)\s*$/gm)].map((m) => m[1] ?? "");
  assert.ok(lists.length > 0);
  for (const list of lists) {
    const publishedTheFlux = /\blatest\.yml\b/.test(list);
    const exe = Buffer.from("le setup de 1.0.348");
    const fake = await oneFakeFlux(t, { "1.0.347": { dmg: Buffer.from("a"), exe: Buffer.from("b") }, "1.0.348": { dmg: Buffer.from("c"), exe, ymlExe: publishedTheFlux ? undefined : null } });
    const newEntry = await fluxOf(fake.adresse, WINDOWS).nouvelle("1.0.347");
    assert.equal(newEntry?.version, "1.0.348", `release published as: ${list}`);
  }
});
