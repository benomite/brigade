// Une station déclarée deux fois pour le même ordinateur (#1990) : la box retire
// d'elle-même l'ancienne, absente, quand la nouvelle est présente — jamais une
// station présente, jamais deux présentes l'une pour l'autre.
import assert from "node:assert/strict";
import { test, type TestContext } from "node:test";
import { ouvrirJournal } from "../../src/journal.ts";
import { declarationDe, declarerLesSecondaires, type StationSecondaire } from "../../src/projets/secondaires.ts";
import { doublonsAbsents, normaliser, retirerLesDoublons } from "../../src/station-doublon/retirer.ts";
import { declarationDuJournal, stationsDuProjet, tenirUneStation } from "../../src/une-station.ts";
import { repertoireTemporaire } from "../outils.ts";

const PROJET = "espace";

const secondaire = (machine: string, atteinte: boolean): StationSecondaire => ({
  nom: machine,
  station: `${machine}/claude`,
  gist: `gist-${machine}`,
  cooks: 1,
  fournit: ["code"],
  atteinte,
  dit: atteinte ? "reached: it is online on GitHub" : "not reached",
});

// Un journal où `box/claude` et les `deja` sont déclarées ; rend le répertoire d'état.
function declarer(t: TestContext, deja: string[]): string {
  const etat = repertoireTemporaire(t);
  const journal = ouvrirJournal(etat);
  try {
    tenirUneStation(journal, { projet: PROJET, station: { nom: "box/claude", moteur: "claude", fournit: ["code"], cooks: 1 }, auteur: "chef" });
    for (const machine of deja) tenirUneStation(journal, { projet: PROJET, station: declarationDe(secondaire(machine, false)), auteur: "chef" });
  } finally {
    journal.fermer();
  }
  return etat;
}

function stations(etat: string): string[] {
  const journal = ouvrirJournal(etat, { lectureSeule: true });
  try {
    return stationsDuProjet(declarationDuJournal(journal)).map((station) => station.nom);
  } finally {
    journal.fermer();
  }
}

test("la forme normalisée : minuscules, sans .home ni .local, sans numéro de conflit final", () => {
  assert.equal(normaliser("MacBook-Air-de-Benoit4/claude"), "macbook-air-de-benoit/claude");
  assert.equal(normaliser("macbook-air-de-benoit.local/claude"), "macbook-air-de-benoit/claude");
  assert.equal(normaliser("macbook-air-de-benoit-2.home/claude"), "macbook-air-de-benoit/claude");
  assert.notEqual(normaliser("parade-box/claude"), normaliser("other-box/claude"));
});

test("l'ancienne station absente et la nouvelle présente : status n'en liste qu'une", (t) => {
  const etat = declarer(t, ["macbook-air-de-benoit"]);
  assert.deepEqual(stations(etat), ["box/claude", "macbook-air-de-benoit/claude"]);
  const { ecrites } = declarerLesSecondaires(etat, PROJET, [secondaire("macbook-air-de-benoit4", true)]);
  assert.deepEqual(ecrites, ["macbook-air-de-benoit4/claude"]);
  assert.deepEqual(stations(etat), ["box/claude", "macbook-air-de-benoit4/claude"]);
});

test("la nouvelle station refusée : l'ancienne, absente, reste déclarée", (t) => {
  const etat = declarer(t, ["macbook-air-de-benoit"]);
  // Un plafond de zéro cook : le runtime ne la lirait pas, rien n'en est écrit.
  const { ecrites, refusees } = declarerLesSecondaires(etat, PROJET, [{ ...secondaire("macbook-air-de-benoit4", true), cooks: 0 }]);
  assert.deepEqual(ecrites, []);
  assert.deepEqual(refusees.map((refusee) => refusee.station), ["macbook-air-de-benoit4/claude"]);
  assert.deepEqual(stations(etat), ["box/claude", "macbook-air-de-benoit/claude"]);
});

test("deux stations présentes, box-a et box-a2 : les deux restent déclarées", (t) => {
  const etat = declarer(t, ["box-a"]);
  declarerLesSecondaires(etat, PROJET, [secondaire("box-a", true), secondaire("box-a2", true)]);
  assert.deepEqual(stations(etat), ["box/claude", "box-a/claude", "box-a2/claude"]);
});

test("une absente, parade-box, et une présente d'un autre ordinateur, other-box : les deux restent déclarées", (t) => {
  const etat = declarer(t, ["parade-box"]);
  declarerLesSecondaires(etat, PROJET, [secondaire("other-box", true)]);
  assert.deepEqual(stations(etat), ["box/claude", "parade-box/claude", "other-box/claude"]);
});

test("le nettoyage rejoué donne le même résultat qu'une fois", (t) => {
  const etat = declarer(t, ["macbook-air-de-benoit"]);
  const presentes = ["macbook-air-de-benoit4/claude"];
  const journal = ouvrirJournal(etat);
  try {
    tenirUneStation(journal, { projet: PROJET, station: declarationDe(secondaire("macbook-air-de-benoit4", true)), auteur: "chef" });
    assert.deepEqual(retirerLesDoublons(journal, { projet: PROJET, presentes, auteur: "chef" }), ["macbook-air-de-benoit/claude"]);
    const une = declarationDuJournal(journal);
    assert.deepEqual(retirerLesDoublons(journal, { projet: PROJET, presentes, auteur: "chef" }), []);
    assert.equal(declarationDuJournal(journal), une);
  } finally {
    journal.fermer();
  }
});

test("une station présente n'est jamais retirée", () => {
  assert.deepEqual(doublonsAbsents(["a/claude", "a2/claude"], ["a/claude", "a2/claude"]), []);
  assert.deepEqual(doublonsAbsents(["a/claude", "a2/claude"], ["a2/claude"]), ["a/claude"]);
});
