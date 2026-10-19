import assert from "node:assert/strict";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { CARNET_PATH, CarnetError, parseCarnet, readCarnet, saveCarnet, writeCarnet, type Carnet } from "../../src/carnet/carnet.ts";

const CARNET: Carnet = {
  lessons: [
    { id: "L-10", text: "Nommer le test avant de le coder.", state: "expired", entered: "2026-09-01", retros: ["#20"], exit: { date: "2026-10-01", reason: "expiry" } },
    { id: "L-2", text: "Lancer les tests avant de commiter.", state: "promoted", entered: "2026-09-10", retros: ["#12", "#15"] },
    { id: "L-3", text: "Ne pas deviner : dire la décision qui manque.", state: "retired", entered: "2026-09-12", retros: ["retro-3"], exit: { date: "2026-10-05", reason: "manual" } },
  ],
};
const TRIE: Carnet = { lessons: [CARNET.lessons[1]!, CARNET.lessons[2]!, CARNET.lessons[0]!] };

test("écrire puis relire rend le même carnet — promue, retirée, expirée", () => {
  assert.deepEqual(parseCarnet(writeCarnet(CARNET)), TRIE);
});

test("le fichier dit, pour chaque leçon, son identifiant, sa date d'entrée et ses rétros", () => {
  const texte = writeCarnet(CARNET);
  assert.match(texte, /## L-2\n- état: promoted\n- texte: Lancer les tests avant de commiter\.\n- entrée: 2026-09-10\n- rétros: #12, #15\n/);
  assert.match(texte, /## L-3\n[\s\S]*?- entrée: 2026-09-12\n- rétros: retro-3\n/);
});

test("une leçon retirée ou expirée reste dans le fichier, avec sa sortie et sa raison", () => {
  const texte = writeCarnet(CARNET);
  assert.match(texte, /## L-10\n- état: expired\n[\s\S]*?- sortie: 2026-10-01\n- raison: expiry\n/);
  assert.match(texte, /## L-3\n- état: retired\n[\s\S]*?- sortie: 2026-10-05\n- raison: manual\n/);
});

test("deux écritures sont identiques à l'octet, quel que soit l'ordre des leçons", () => {
  assert.equal(writeCarnet(CARNET), writeCarnet(CARNET));
  assert.equal(writeCarnet(CARNET), writeCarnet({ lessons: [...CARNET.lessons].reverse() }));
});

test("ajouter une leçon n'ajoute que ses lignes au diff", () => {
  const nouvelle = { id: "L-4", text: "Une de plus.", state: "promoted" as const, entered: "2026-10-10", retros: ["#30"] };
  const avant = writeCarnet(CARNET).split("\n");
  const apres = writeCarnet({ lessons: [...CARNET.lessons, nouvelle] }).split("\n");
  const restantes = [...avant];
  const ajoutees: string[] = [];
  for (const ligne of apres) {
    const i = restantes.indexOf(ligne);
    if (i === -1) ajoutees.push(ligne);
    else restantes.splice(i, 1);
  }
  assert.deepEqual(restantes, [], "aucune ligne existante n'est perdue");
  assert.deepEqual(ajoutees.filter((l) => l !== ""), ["## L-4", "- état: promoted", "- texte: Une de plus.", "- entrée: 2026-10-10", "- rétros: #30"]);
});

const ligneEnErreur = (texte: string): number | undefined => {
  try {
    parseCarnet(texte);
  } catch (e) {
    assert.ok(e instanceof CarnetError);
    return e.line;
  }
  assert.fail("le carnet aurait dû être refusé");
};

test("un carnet mal formé lève une erreur qui nomme la ligne", () => {
  const bon = writeCarnet(CARNET);
  const lignes = bon.split("\n");
  const avec = (i: number, ligne: string) => lignes.map((l, j) => (j === i ? ligne : l)).join("\n");
  assert.equal(ligneEnErreur("autre chose\n"), 1);
  assert.equal(ligneEnErreur(avec(3, "du bruit")), 4);
  assert.equal(ligneEnErreur(avec(3, "- état: oubliée")), 4);
  assert.equal(ligneEnErreur(avec(5, "- entrée: 2026-02-31")), 6);
  assert.equal(ligneEnErreur(avec(4, "- couleur: bleu")), 5);
  assert.equal(ligneEnErreur(`${TITRE_()}\n- état: promoted\n`), 2);
  assert.equal(ligneEnErreur(`${bon}\n## L-2\n`), lignes.length + 1);
  assert.throws(() => parseCarnet(`${bon}\n## L-2\n`), /ligne \d+/);
  // Une leçon expirée sans sortie : l'erreur nomme la ligne de son titre.
  assert.equal(ligneEnErreur(`${TITRE_()}\n\n## L-1\n- état: expired\n- texte: x\n- entrée: 2026-01-01\n- rétros: #1\n`), 3);
});
const TITRE_ = () => "# Carnet des leçons";

test("une leçon incohérente n'est pas écrite", () => {
  const l = CARNET.lessons[1]!;
  assert.throws(() => writeCarnet({ lessons: [{ ...l, state: "expired" }] }), CarnetError);
  assert.throws(() => writeCarnet({ lessons: [{ ...l, exit: { date: "2026-10-01", reason: "expiry" } }] }), CarnetError);
  assert.throws(() => writeCarnet({ lessons: [l, l] }), /en double/);
  assert.throws(() => writeCarnet({ lessons: [{ ...l, text: "deux\nlignes" }] }), CarnetError);
});

test("le carnet se lit et s'écrit au chemin par défaut, ou à celui qu'on donne ; absent, il est vide", () => {
  const depot = mkdtempSync(join(tmpdir(), "carnet-"));
  assert.deepEqual(readCarnet(depot), { lessons: [] });
  saveCarnet(depot, CARNET);
  assert.equal(readFileSync(join(depot, CARNET_PATH), "utf8"), writeCarnet(CARNET));
  assert.deepEqual(readCarnet(depot), TRIE);
  saveCarnet(depot, CARNET, "ailleurs/carnet.md");
  assert.deepEqual(readCarnet(depot, "ailleurs/carnet.md"), TRIE);
});
