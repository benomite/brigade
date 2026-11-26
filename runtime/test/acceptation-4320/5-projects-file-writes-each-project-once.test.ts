// #4320, critère 5 : la station écrit chaque projet une fois dans son fichier des projets : jouer le chemin d'écriture plusieurs fois
// avec le même projet laisse une seule ligne pour lui, et une seule ligne `# held-back`, pas plusieurs.
import assert from "node:assert/strict";
import { test } from "node:test";
import { DEBUT, FIN, reecrireBloc } from "../../src/projets/bloc.ts";

const LIGNE = "brigade benomite/brigade main";
const MIS_DE_COTE = `# held-back (served by box): ${LIGNE}`;

test("writing the same project several times leaves one line for it and one `# held-back` line, not several", () => {
  let texte = `# projets\nshop acme/shop main\n\n${DEBUT}\n${MIS_DE_COTE}\n${LIGNE}\n${FIN}\n`;
  for (let fois = 0; fois < 4; fois += 1) texte = reecrireBloc(texte, [LIGNE, LIGNE]);
  const lignes = texte.split("\n");
  assert.equal(lignes.filter((ligne) => ligne.trim() === LIGNE).length, 1, texte);
  assert.equal(lignes.filter((ligne) => ligne.startsWith("# held-back") && ligne.includes("brigade benomite/brigade")).length, 1, texte);
  assert.equal(lignes.filter((ligne) => ligne.startsWith("shop ")).length, 1, texte);
});
