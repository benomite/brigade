// La réécriture du bloc des projets de la configuration garde, telles quelles, les lignes de commentaire qu'il porte.
import assert from "node:assert/strict";
import { test } from "node:test";
import { DEBUT, FIN, lignesDuBloc, reecrireBloc } from "../../src/projets/bloc.ts";

const COMMENTAIRES = ["# à revoir en décembre", "# garde-moi aussi"];
const AVEC_BLOC = `${DEBUT}\n${COMMENTAIRES[0]}\nshop acme/shop main\n${COMMENTAIRES[1]}\n${FIN}\n`;

test("réécrit, le bloc garde, tels quels, les commentaires qu'il portait", () => {
  const neuf = reecrireBloc(AVEC_BLOC, ["shop acme/shop main", "compta acme/compta main"]);
  for (const ligne of COMMENTAIRES) assert.ok(neuf.split("\n").includes(ligne), ligne);
  assert.deepEqual(lignesDuBloc(neuf), ["shop acme/shop main", "compta acme/compta main"]);
  // Vidé de ses projets, le bloc reste tant qu'il porte un commentaire.
  const vide = reecrireBloc(AVEC_BLOC, []);
  assert.equal(vide, `${DEBUT}\n${COMMENTAIRES[0]}\n${COMMENTAIRES[1]}\n${FIN}\n`);
  assert.equal(reecrireBloc(vide, []), vide);
});
