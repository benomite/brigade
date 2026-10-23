// Le bloc de la configuration que la station tient pour l'app : réécrit seul,
// sans jamais toucher les lignes que le chef a écrites à la main.
import assert from "node:assert/strict";
import { test } from "node:test";
import { DEBUT, FIN, lignesDuBloc, nomsHorsDuBloc, reecrireBloc } from "../../src/projets/bloc.ts";
import { lireConfiguration } from "../../src/station/configuration.ts";

const A_LA_MAIN = "# projet  dépôt  branche\nbrigade acme/brigade v2\n";

test("sans bloc, les lignes de l'app s'ajoutent à la fin, entre ses deux commentaires ; la configuration les lit comme les autres", () => {
  const texte = reecrireBloc(A_LA_MAIN, ["shop acme/shop main"]);
  assert.equal(texte, `${A_LA_MAIN}\n${DEBUT}\nshop acme/shop main\n${FIN}\n`);
  assert.deepEqual(lignesDuBloc(texte), ["shop acme/shop main"]);
  assert.deepEqual(nomsHorsDuBloc(texte), ["brigade"]);
  assert.deepEqual(
    lireConfiguration(texte).projets.map(({ nom }) => nom),
    ["brigade", "shop"],
  );
  assert.equal(reecrireBloc("", ["shop acme/shop main"]), `${DEBUT}\nshop acme/shop main\n${FIN}\n`);
});

test("réécrit, le bloc reste à sa place ; vidé, il disparaît ; les lignes à la main ne bougent pas", () => {
  const texte = `${A_LA_MAIN}${DEBUT}\nshop acme/shop main\n${FIN}\nespace acme/espace main\n`;
  assert.equal(reecrireBloc(texte, ["shop acme/shop main", "thermigo acme/thermigo main"]), `${A_LA_MAIN}${DEBUT}\nshop acme/shop main\nthermigo acme/thermigo main\n${FIN}\nespace acme/espace main\n`);
  assert.equal(reecrireBloc(texte, []), `${A_LA_MAIN}espace acme/espace main\n`);
  assert.deepEqual(nomsHorsDuBloc(texte), ["brigade", "espace"]);
  // Sans bloc et sans ligne, rien ne change.
  assert.equal(reecrireBloc(A_LA_MAIN, []), A_LA_MAIN);
});

test("un bloc dont la fin a été effacée court jusqu'au bout du fichier", () => {
  const texte = `${A_LA_MAIN}${DEBUT}\nshop acme/shop main\n`;
  assert.deepEqual(lignesDuBloc(texte), ["shop acme/shop main"]);
  assert.equal(reecrireBloc(texte, []), A_LA_MAIN);
});
