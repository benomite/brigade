import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const workflow = readFileSync(fileURLToPath(new URL("../../../.github/workflows/publier-app.yml", import.meta.url)), "utf8");

test("every app release that ships a Windows installer also ships the Windows update feed", () => {
  const listes = [...workflow.matchAll(/^\s*fichiers=\((.*)\)\s*$/gm)].map((m) => m[1] ?? "");
  const avecInstalleur = listes.filter((l) => l.includes("setup.exe"));
  assert.ok(avecInstalleur.length > 0, "the publish step lists no Windows installer");
  for (const liste of avecInstalleur) assert.match(liste, /\blatest\.yml\b/, `a release ships the installer without latest.yml: ${liste}`);
  // The Windows job does not throw the feed away before it is uploaded.
  assert.doesNotMatch(workflow, /rm\s+-f\s+\S*latest\.yml/);
});
