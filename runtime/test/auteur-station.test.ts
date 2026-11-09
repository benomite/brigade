// Un ticket qu'une station a déposé (#3012) n'est pas l'issue d'un inconnu, quel que soit son compte GitHub.
import assert from "node:assert/strict";
import { test } from "node:test";
import { auteurSansEcriture } from "../src/github-etat/auteur.ts";
import { marqueDeLaFamille, marqueDuProjet } from "../src/routage-temps-perdu.ts";

test("a ticket carrying the station's project or family mark goes to the manager, whoever the author is", () => {
  assert.equal(auteurSansEcriture({ association: "NONE", body: `${marqueDuProjet("pierreyvesbobl/os-perso")}\nmeasure` }), false);
  assert.equal(auteurSansEcriture({ association: "CONTRIBUTOR", body: marqueDeLaFamille("qualite", "Quality before time: first-try rate 0%") }), false);
});

test("a stranger's issue without those marks stays a stranger's issue", () => {
  assert.equal(auteurSansEcriture({ association: "NONE", body: "please add dark mode" }), true);
  assert.equal(auteurSansEcriture({ association: "NONE" }), true);
  assert.equal(auteurSansEcriture({ association: "OWNER", body: "" }), false);
});
