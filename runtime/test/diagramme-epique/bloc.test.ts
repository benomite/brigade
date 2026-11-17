// Le bloc du diagramme dans le corps de l'épique : seul ce qui est entre les marqueurs change.
import assert from "node:assert/strict";
import { test } from "node:test";
import { avecDiagramme, DEBUT_DIAGRAMME, FIN_DIAGRAMME } from "../../src/diagramme-epique.ts";

const bloc = (texte: string) => `\`\`\`mermaid\nflowchart TD\n  A["${texte}"]\n\`\`\``;

test("le bloc remplace seulement ce qui est entre les marqueurs ; sans marqueurs, il est ajouté une fois", () => {
  assert.equal(DEBUT_DIAGRAMME, "<!-- brigade-diagram:start -->");
  assert.equal(FIN_DIAGRAMME, "<!-- brigade-diagram:end -->");

  const avant = "Le texte du chef.\n\n";
  const apres = "\n\nLa suite du chef.";
  const corps = `${avant}${DEBUT_DIAGRAMME}\nancien\n${FIN_DIAGRAMME}${apres}`;
  const neuf = avecDiagramme(corps, bloc("neuf"));
  assert.ok(neuf.startsWith(`${avant}${DEBUT_DIAGRAMME}`));
  assert.ok(neuf.endsWith(`${FIN_DIAGRAMME}${apres}`));
  assert.ok(neuf.includes(bloc("neuf")));
  assert.ok(!neuf.includes("ancien"));
  assert.equal(neuf.split(DEBUT_DIAGRAMME).length, 2);

  const sans = "Un corps sans marqueurs.";
  const ajoute = avecDiagramme(sans, bloc("un"));
  assert.ok(ajoute.startsWith(sans));
  assert.equal(ajoute.split(DEBUT_DIAGRAMME).length, 2);
  assert.equal(ajoute.split(FIN_DIAGRAMME).length, 2);
  assert.ok(ajoute.includes(bloc("un")));
  // Rejoué, il remplace : il ne s'ajoute pas une seconde fois.
  const rejoue = avecDiagramme(ajoute, bloc("deux"));
  assert.equal(rejoue.split(DEBUT_DIAGRAMME).length, 2);
  assert.ok(rejoue.includes(bloc("deux")) && !rejoue.includes(bloc("un")));
});
