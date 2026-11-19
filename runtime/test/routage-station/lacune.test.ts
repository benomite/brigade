// #3870 : la ligne de ce que la station n'a pas pu cuire, écrite par la station, lue par les faits.
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { lacuneDeLaStation, noterLaLacune } from "../../src/routage-station/lacune.ts";
import { direLaLacune } from "../../src/routage-station/routage-station.ts";

test("the install of the dependencies is said in clear, any other lack by the cook's first line", () => {
  assert.equal(direLaLacune("The gates cannot run: `npm ci` is refused here."), "dependencies cannot be installed");
  assert.equal(direLaLacune("The tests need postgres, which is not running here.\nSecond line."), "The tests need postgres, which is not running here.");
});

test("a lack is written, read for its own station only, and cleared", () => {
  const racine = mkdtempSync(join(tmpdir(), "lacune-"));
  try {
    assert.equal(lacuneDeLaStation(racine, "brigade", "mac/claude"), null);
    noterLaLacune(racine, "brigade", "mac/claude", "dependencies cannot be installed");
    assert.equal(lacuneDeLaStation(racine, "brigade", "mac/claude"), "dependencies cannot be installed");
    assert.equal(lacuneDeLaStation(racine, "brigade", "autre/claude"), null);
    noterLaLacune(racine, "brigade", "mac/claude", null);
    assert.equal(lacuneDeLaStation(racine, "brigade", "mac/claude"), null);
  } finally {
    rmSync(racine, { recursive: true, force: true });
  }
});

test("an unreadable file says nothing: the card invents no lack", () => {
  const racine = mkdtempSync(join(tmpdir(), "lacune-"));
  try {
    mkdirSync(join(racine, "lacunes"));
    writeFileSync(join(racine, "lacunes", "brigade.json"), "{not json");
    assert.equal(lacuneDeLaStation(racine, "brigade", "mac/claude"), null);
  } finally {
    rmSync(racine, { recursive: true, force: true });
  }
});
