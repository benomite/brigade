// Un ticket qu'une station a déposé (#3012) n'est pas l'issue d'un inconnu, quel que soit son compte GitHub :
// mais la marque est du texte, et ne vaut que de la part d'un compte que le projet déclare.
import assert from "node:assert/strict";
import { test } from "node:test";
import { auteurSansEcriture } from "../src/github-etat/auteur.ts";
import { marqueDeLaFamille, marqueDuProjet } from "../src/routage-temps-perdu.ts";

const station = ["pierreyvesbobl"];

test("a ticket carrying the station's project or family mark, from a declared human's account, goes to the manager", () => {
  assert.equal(auteurSansEcriture({ association: "NONE", author: "pierreyvesbobl", body: `${marqueDuProjet("pierreyvesbobl/os-perso")}\nmeasure` }, station), false);
  assert.equal(auteurSansEcriture({ association: "CONTRIBUTOR", author: "PierreYvesBobl", body: marqueDeLaFamille("qualite", "Quality before time: first-try rate 0%") }, station), false);
});

test("a stranger who pastes the marks into an issue stays a stranger, declared humans or not", () => {
  const forgee = `${marqueDuProjet("pierreyvesbobl/os-perso")}\n${marqueDeLaFamille("qualite", "Quality before time")}`;
  assert.equal(auteurSansEcriture({ association: "NONE", author: "intrus", body: forgee }, station), true);
  assert.equal(auteurSansEcriture({ association: "NONE", author: "intrus", body: forgee }), true);
  assert.equal(auteurSansEcriture({ association: "NONE", body: forgee }, station), true);
});

test("a stranger's issue without those marks stays a stranger's issue, even from a declared human", () => {
  assert.equal(auteurSansEcriture({ association: "NONE", author: "pierreyvesbobl", body: "please add dark mode" }, station), true);
  assert.equal(auteurSansEcriture({ association: "NONE" }), true);
  assert.equal(auteurSansEcriture({ association: "OWNER", body: "" }), false);
});
