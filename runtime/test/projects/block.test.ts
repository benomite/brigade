// Le bloc de la configuration que la station tient pour l'app : réécrit seul,
// sans jamais toucher les lignes que le chef a écrites à la main.
import assert from "node:assert/strict";
import { test } from "node:test";
import { DEBUT, FIN, lignesDuBloc, nomsHorsDuBloc, reecrireBloc } from "../../src/projects/block.ts";
import { lireConfiguration } from "../../src/station/configuration.ts";

const A_LA_MAIN = "# projet  dépôt  branche\nbrigade benomite/brigade v2\n";

test("sans bloc, les lignes de l'app s'ajoutent à la fin, entre ses deux commentaires ; la configuration les lit comme les autres", () => {
  const texte = reecrireBloc(A_LA_MAIN, ["parade benomite/parade main"]);
  assert.equal(texte, `${A_LA_MAIN}\n${DEBUT}\nparade benomite/parade main\n${FIN}\n`);
  assert.deepEqual(lignesDuBloc(texte), ["parade benomite/parade main"]);
  assert.deepEqual(nomsHorsDuBloc(texte), ["brigade"]);
  assert.deepEqual(
    lireConfiguration(texte).projets.map(({ nom }) => nom),
    ["brigade", "parade"],
  );
  assert.equal(reecrireBloc("", ["parade benomite/parade main"]), `${DEBUT}\nparade benomite/parade main\n${FIN}\n`);
});

test("réécrit, le bloc reste à sa place ; vidé, il disparaît ; les lignes à la main ne bougent pas", () => {
  const texte = `${A_LA_MAIN}${DEBUT}\nparade benomite/parade main\n${FIN}\nespace benomite/espace main\n`;
  assert.equal(reecrireBloc(texte, ["parade benomite/parade main", "thermigo benomite/thermigo main"]), `${A_LA_MAIN}${DEBUT}\nparade benomite/parade main\nthermigo benomite/thermigo main\n${FIN}\nespace benomite/espace main\n`);
  assert.equal(reecrireBloc(texte, []), `${A_LA_MAIN}espace benomite/espace main\n`);
  assert.deepEqual(nomsHorsDuBloc(texte), ["brigade", "espace"]);
  // Sans bloc et sans ligne, rien ne change.
  assert.equal(reecrireBloc(A_LA_MAIN, []), A_LA_MAIN);
});

test("un bloc dont la fin a été effacée court jusqu'au bout du fichier", () => {
  const texte = `${A_LA_MAIN}${DEBUT}\nparade benomite/parade main\n`;
  assert.deepEqual(lignesDuBloc(texte), ["parade benomite/parade main"]);
  assert.equal(reecrireBloc(texte, []), A_LA_MAIN);
});
