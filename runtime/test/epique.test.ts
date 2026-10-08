// La liste des tickets dans le corps d'une épique : le seul endroit du corps
// que le runtime réécrit.
import assert from "node:assert/strict";
import { test } from "node:test";
import { avecListe, DEBUT, epiqueDe, FIN, porteListe, rendreListe, sansListe } from "../src/epique.ts";

const LIGNES = [
  { ticket: 501, title: "Le rail compte", state: "servi", served: true },
  { ticket: 502, title: "La pass | lit", state: "attend #501", served: false },
];

test("la liste dit chaque ticket, son état, et le décompte de ce qui est servi", () => {
  const bloc = rendreListe(30, LIGNES);

  assert.ok(bloc.startsWith(DEBUT) && bloc.endsWith(FIN));
  assert.match(bloc, /\*\*1\/2 servi\.\*\*/);
  assert.match(bloc, /\| #501 \| Le rail compte \| servi \|/);
  // Une barre dans un titre ne casse pas le tableau.
  assert.match(bloc, /\| #502 \| La pass \\\| lit \| attend #501 \|/);
  assert.match(bloc, /`Épique : #30`/);
});

test("une épique sans liste la reçoit à la fin, et ce que l'humain a écrit ne bouge pas", () => {
  const corps = "## Contexte\n\nLe chef veut un compte.\n";
  const avec = avecListe(corps, rendreListe(30, LIGNES));

  assert.ok(avec.startsWith("## Contexte\n\nLe chef veut un compte.\n\n<!-- brigade:tickets -->"));
  assert.equal(sansListe(avec), "## Contexte\n\nLe chef veut un compte.");
  assert.equal(avecListe("", "bloc"), "bloc");
});

test("réécrire la liste ne touche qu'à ce qui est entre ses marqueurs", () => {
  const avant = `Avant.\n\n${rendreListe(30, LIGNES)}\n\nAprès, écrit par le chef.`;
  const apres = avecListe(avant, rendreListe(30, [LIGNES[0] ?? LIGNES[1]!]));

  assert.ok(apres.startsWith("Avant.\n\n<!-- brigade:tickets -->"));
  assert.ok(apres.endsWith("<!-- /brigade:tickets -->\n\nAprès, écrit par le chef."));
  assert.doesNotMatch(apres, /#502/);
  assert.equal(apres.split(DEBUT).length, 2);
  // La même liste, réécrite, rend le même corps.
  assert.equal(avecListe(apres, rendreListe(30, [LIGNES[0] ?? LIGNES[1]!])), apres);
});

test("un marqueur de début sans marqueur de fin ne possède que lui-même : rien de ce qui le suit n'est effacé", () => {
  const casse = `Avant.\n${DEBUT}\nUne note du chef, restée là.`;
  const apres = avecListe(casse, "BLOC");

  assert.equal(apres, "Avant.\nBLOC\nUne note du chef, restée là.");
  assert.equal(porteListe(casse), true);
  assert.equal(porteListe("Avant."), false);
});

test("un ticket dit son épique par une ligne de son corps, où qu'elle soit et comme qu'elle soit écrite", () => {
  assert.equal(epiqueDe("Épique : #75\n\n## Contexte"), 75);
  assert.equal(epiqueDe("## Contexte\n\n**Épique :** #75"), 75);
  assert.equal(epiqueDe("epique: #7"), 7);
  // Une phrase qui en parle n'est pas une référence.
  assert.equal(epiqueDe("Fait partie de l'épique : #75"), null);
  assert.equal(epiqueDe("Épique : la refonte"), null);
  assert.equal(epiqueDe(""), null);
});
