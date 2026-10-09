// Le livrable d'un cook : ce qu'il a délimité dans son dernier message, et
// rien d'autre. Sans E/S.
import assert from "node:assert/strict";
import { test } from "node:test";
import { lireLivrable } from "../src/livrable.ts";

test("le livrable est ce que le cook a délimité, et ce qui l'entoure reste à part", () => {
  const lu = lireLivrable("J'ai relu le workflow.\n\n<livrable>\nLa CI passe douze minutes à installer.\nIl manque un cache.\n</livrable>\n\nVérifié sur trois runs.");

  assert.deepEqual(lu, {
    texte: "La CI passe douze minutes à installer.\nIl manque un cache.",
    defaut: null,
    autour: "J'ai relu le workflow.\n\nVérifié sur trois runs.",
    delimitations: 1,
  });
});

test("un message qui n'est que son livrable n'a rien autour", () => {
  assert.deepEqual(lireLivrable("<livrable>Cinq lignes.</livrable>"), { texte: "Cinq lignes.", defaut: null, autour: null, delimitations: 1 });
});

test("les balises se lisent dans la ligne, et quelle que soit leur casse", () => {
  assert.equal(lireLivrable("Voici : <Livrable>une ligne</LIVRABLE> — fin.").texte, "une ligne");
});

test("sans délimitation, il n'y a pas de livrable : le message entier n'en est pas un", () => {
  const message = "Brouillon.\n\nSeconde version.\n\nCe que j'ai corrigé : tout.";

  assert.deepEqual(lireLivrable(message), { texte: null, defaut: "absent", autour: message, delimitations: 0 });
  assert.deepEqual(lireLivrable(null), { texte: null, defaut: "absent", autour: null, delimitations: 0 });
  assert.deepEqual(lireLivrable("  \n"), { texte: null, defaut: "absent", autour: null, delimitations: 0 });
});

test("une balise égarée qui n'est pas la sienne ne délimite rien, et ne casse pas la délimitation", () => {
  assert.equal(lireLivrable("Je réfléchis.\n</thinking>\n\nVoilà.").defaut, "absent");
  const lu = lireLivrable("Je réfléchis.\n</thinking>\n<livrable>\nLe résultat.\n</livrable>");
  assert.deepEqual([lu.texte, lu.autour], ["Le résultat.", "Je réfléchis.\n</thinking>"]);
});

test("une fermeture sans ouverture est ignorée", () => {
  assert.equal(lireLivrable("Fini.</livrable>").defaut, "absent");
  assert.equal(lireLivrable("</livrable>\n<livrable>Le résultat.</livrable>").texte, "Le résultat.");
});

test("deux délimitations : la dernière est le livrable, la première reste autour, comme le brouillon qu'elle est", () => {
  const lu = lireLivrable("<livrable>Brouillon, dix lignes.</livrable>\n\nTrop long. Je reprends.\n\n<livrable>Version tenue.</livrable>");

  assert.deepEqual([lu.texte, lu.defaut, lu.delimitations], ["Version tenue.", null, 2]);
  assert.equal(lu.autour, "<livrable>Brouillon, dix lignes.</livrable>\n\nTrop long. Je reprends.");
});

test("une ouverture rouverte avant d'être fermée repart de la dernière", () => {
  const lu = lireLivrable("<livrable>Faux départ.\n\n<livrable>Le résultat.</livrable>");

  assert.deepEqual([lu.texte, lu.delimitations], ["Le résultat.", 1]);
  assert.equal(lu.autour, "<livrable>Faux départ.");
});

test("une délimitation ouverte et jamais fermée n'est pas un livrable — même après une délimitation complète", () => {
  const coupe = "Analyse.\n\n<livrable>\nLe résultat, coupé en plein vol";
  assert.deepEqual(lireLivrable(coupe), { texte: null, defaut: "ouvert", autour: coupe, delimitations: 0 });

  const reprise = "<livrable>Première version.</livrable>\n\nJe corrige.\n\n<livrable>Seconde version, jamais fer";
  assert.deepEqual(lireLivrable(reprise), { texte: null, defaut: "ouvert", autour: reprise, delimitations: 1 });
});

test("une délimitation vide n'est pas un livrable", () => {
  const message = "Tout est dit plus haut.\n<livrable>\n  \n</livrable>";

  assert.deepEqual(lireLivrable(message), { texte: null, defaut: "vide", autour: message, delimitations: 1 });
});

test("une balise citée entre backticks n'est pas une délimitation : le cook qui répète sa consigne ne déplace pas son livrable", () => {
  const lu = lireLivrable("<livrable>\nLe résultat.\n</livrable>\n\nJ'ai bien délimité entre `<livrable>` et `</livrable>`, une seule fois.");

  assert.deepEqual([lu.texte, lu.defaut, lu.delimitations], ["Le résultat.", null, 1]);
  assert.equal(lu.autour, "J'ai bien délimité entre `<livrable>` et `</livrable>`, une seule fois.");
});

test("une ouverture citée seule entre backticks après le livrable ne le rouvre pas", () => {
  const lu = lireLivrable("<livrable>Le résultat.</livrable>\n\nLa balise `<livrable>` est posée comme demandé.");

  assert.deepEqual([lu.texte, lu.defaut, lu.delimitations], ["Le résultat.", null, 1]);
});

test("une balise citée dans un bloc de code n'est pas une délimitation, avant comme après le livrable", () => {
  const lu = lireLivrable("Le format attendu :\n\n```\n<livrable>\n…\n</livrable>\n```\n\n<livrable>Le résultat.</livrable>\n\n```html\n<livrable>\n```");

  assert.deepEqual([lu.texte, lu.defaut, lu.delimitations], ["Le résultat.", null, 1]);
});

test("des balises seulement citées ne délimitent rien", () => {
  assert.equal(lireLivrable("Je devais écrire entre `<livrable>` et `</livrable>`.").defaut, "absent");
});

test("le code que porte le livrable lui-même — backticks, bloc — reste dans le livrable", () => {
  const lu = lireLivrable("<livrable>\nLance `npm test`.\n\n```sh\nnpm test\n```\n</livrable>");

  assert.equal(lu.texte, "Lance `npm test`.\n\n```sh\nnpm test\n```");
});
