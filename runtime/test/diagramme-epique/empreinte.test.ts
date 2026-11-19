// Le diagramme que le runtime écrit dans l'épique n'est pas ce que le chef a
// écrit : le rafraîchir ne fait pas rejuger l'épique, et le manager ne le lit pas.
import assert from "node:assert/strict";
import { test } from "node:test";
import { avecDiagramme, sansBloc, DEBUT_DIAGRAMME, FIN_DIAGRAMME } from "../../src/diagramme-epique.ts";
import { empreinteDEpique } from "../../src/decouper.ts";

const epique = (body: string) => ({ number: 30, title: "Une épique", body, labels: ["epic"] });
const diagramme = (etat: string) => `\`\`\`mermaid\nflowchart TD\n  t1["#1 Un ticket<br/>${etat}"]\n\`\`\``;

test("le diagramme écrit ou rafraîchi ne change pas l'empreinte de l'épique", () => {
  const corps = "Le chef veut voir les tickets.";
  const pose = avecDiagramme(corps, diagramme("open"));
  const rafraichi = avecDiagramme(pose, diagramme("served"));
  assert.equal(empreinteDEpique(epique(pose), []), empreinteDEpique(epique(corps), []));
  assert.equal(empreinteDEpique(epique(rafraichi), []), empreinteDEpique(epique(corps), []));
  assert.notEqual(empreinteDEpique(epique(`${rafraichi}\n\nUne ligne du chef.`), []), empreinteDEpique(epique(corps), []));
  assert.equal(sansBloc(rafraichi, DEBUT_DIAGRAMME, FIN_DIAGRAMME), corps);
});
