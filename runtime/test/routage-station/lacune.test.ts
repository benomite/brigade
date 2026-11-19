// #3870 : la ligne de ce que la station n'a pas pu cuire, écrite par la station, lue par les faits.
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { faits, lireEtat } from "../../src/etat.ts";
import { ouvrirJournal } from "../../src/journal.ts";
import { repertoireTemporaire } from "../outils.ts";
import { ecrireLaLacune, lacuneDeLaStation, noterLaLacune } from "../../src/routage-station/lacune.ts";
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

test("clearing a lack that was never written is no error, and a second lack replaces the first", () => {
  const racine = mkdtempSync(join(tmpdir(), "lacune-"));
  try {
    noterLaLacune(racine, "brigade", "mac/claude", null);
    noterLaLacune(racine, "brigade", "mac/claude", "dependencies cannot be installed");
    noterLaLacune(racine, "brigade", "mac/claude", "postgres is not running");
    assert.equal(lacuneDeLaStation(racine, "brigade", "mac/claude"), "postgres is not running");
  } finally {
    rmSync(racine, { recursive: true, force: true });
  }
});

test("the kitchen writes the lack for its station's card, and says when it cannot", () => {
  const racine = mkdtempSync(join(tmpdir(), "lacune-"));
  try {
    const dit: string[] = [];
    const noter = (texte: string) => void dit.push(texte);
    ecrireLaLacune(racine, "brigade", "mac/claude", "dependencies cannot be installed", noter);
    assert.equal(lacuneDeLaStation(racine, "brigade", "mac/claude"), "dependencies cannot be installed");
    ecrireLaLacune(racine, "brigade", "mac/claude", null, noter);
    assert.equal(lacuneDeLaStation(racine, "brigade", "mac/claude"), null);
    ecrireLaLacune(racine, "brigade", undefined, "x", noter);
    ecrireLaLacune(undefined, "brigade", "mac/claude", "x", noter);
    assert.deepEqual(dit, [], "without a station here or a directory, nothing is written, nothing is said");
    assert.equal(lacuneDeLaStation(racine, "brigade", "mac/claude"), null);
    writeFileSync(join(racine, "fichier"), "a file where the directory should be");
    ecrireLaLacune(join(racine, "fichier"), "brigade", "mac/claude", "x", noter);
    assert.equal(dit.length, 1);
    assert.match(dit[0] ?? "", /^brigade : mac\/claude — what the station lacked could not be written for its card: /);
  } finally {
    rmSync(racine, { recursive: true, force: true });
  }
});

test("the facts carry the lack of a local station only", (t) => {
  const journal = ouvrirJournal(repertoireTemporaire(t), { maintenant: () => new Date(0) });
  t.after(() => journal.fermer());
  const base = lireEtat(journal, new Date(0));
  const station = (nom: string, remote: boolean) => ({ station: nom, remote, ordinary: false, saturatedCauses: [], provides: [], sandbox: null }) as never;
  const etat = { ...base, stations: [station("mac/claude", false), station("box/claude", false), station("distante/claude", true)] };
  const lues = faits(etat, new Date(0), undefined, null, null, null, () => "dependencies cannot be installed").stations;
  assert.deepEqual(lues.map((s) => s.lacks), ["dependencies cannot be installed", "dependencies cannot be installed", undefined]);
  const seule = faits(etat, new Date(0), undefined, null, null, null, (nom) => (nom === "mac/claude" ? "x" : null)).stations;
  assert.deepEqual(seule.map((s) => s.lacks), ["x", undefined, undefined]);
});
