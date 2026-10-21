// La plateforme qu'une station dit être : Windows se déclare « windows » et s'affiche « Windows »,
// à côté de macOS et de Linux. Aucun test ici ne lance un script POSIX : il se joue sous Windows.
import assert from "node:assert/strict";
import { test } from "node:test";
import { nomDuSysteme } from "../../src/appairage/presence.ts";
import { machineCourante, presenterLaMachine, type Machine } from "../../src/enrolement/presentation.ts";

const machine = (plateforme: NodeJS.Platform): Machine => ({ hostname: "poste.example.org", plateforme, description: "x", cloisonnee: false });

test("la plateforme déclarée : windows pour win32, macos pour darwin, linux pour linux", () => {
  assert.deepEqual(presenterLaMachine(machine("win32")).capacites, ["windows"]);
  assert.deepEqual(presenterLaMachine(machine("darwin")).capacites, ["macos"]);
  assert.deepEqual(presenterLaMachine(machine("linux")).capacites, ["linux"]);
});

test("la plateforme de la machine courante est celle du process", () => {
  assert.equal(machineCourante().plateforme, process.platform);
});

test("le système s'affiche macOS, Windows ou Linux d'après os.type()", () => {
  assert.equal(nomDuSysteme("Windows_NT"), "Windows");
  assert.equal(nomDuSysteme("Darwin"), "macOS");
  assert.equal(nomDuSysteme("Linux"), "Linux");
});
