// #4320, critère 6 : un fichier des projets qui tient déjà des lignes en double est lu, et réécrit, avec chaque projet une fois.
import assert from "node:assert/strict";
import { test } from "node:test";
import { DEBUT, FIN, lignesDuBloc, reecrireBloc } from "../../src/projets/bloc.ts";
import { lireConfiguration } from "../../src/station/configuration.ts";

const LIGNE = "brigade benomite/brigade main";
const MIS_DE_COTE = `# held-back (served by box): ${LIGNE}`;
const AVEC_DOUBLES = `# projets\nshop acme/shop main\nshop acme/shop main\n\n${DEBUT}\n${MIS_DE_COTE}\n${MIS_DE_COTE}\n${MIS_DE_COTE}\n${LIGNE}\n${LIGNE}\n${LIGNE}\n${FIN}\n`;

test("a projects file that already holds duplicate lines is read with each project once, and written back with each project once", () => {
  const lue = lireConfiguration(AVEC_DOUBLES);
  assert.deepEqual(lue.projets.map((projet) => projet.nom), ["shop", "brigade"]);
  assert.deepEqual(lue.problemes, [], "a repeated line is not a problem: it is the same project");
  const reecrit = reecrireBloc(AVEC_DOUBLES, lignesDuBloc(AVEC_DOUBLES));
  const lignes = reecrit.split("\n");
  assert.equal(lignes.filter((ligne) => ligne.trim() === LIGNE).length, 1, reecrit);
  assert.equal(lignes.filter((ligne) => ligne === MIS_DE_COTE).length, 1, reecrit);
  assert.equal(lignes.filter((ligne) => ligne.startsWith("shop ")).length, 1, reecrit);
});
