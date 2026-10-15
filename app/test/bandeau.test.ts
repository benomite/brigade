// Le bandeau d'un shell : la machine, puis le compte — pour ce poste comme pour une machine distante.
import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { COMPTE_INCONNU, compteDeSsh, texteBandeau } from "../src/bandeau.ts";
import { ouvrirTerminaux } from "../src/terminaux.ts";

describe("le bandeau d'un shell", () => {
  test("une box : « box parade-box · debian »", () => {
    assert.equal(texteBandeau({ lieu: "box", nom: "parade-box", hote: "parade-box" }, "debian"), "box parade-box · debian");
  });
  test("ce poste : « this Mac · benoit »", () => {
    assert.equal(texteBandeau({ lieu: "poste" }, "benoit"), "this Mac · benoit");
  });
  test("une station : sa machine, puis son compte", () => {
    assert.equal(texteBandeau({ lieu: "station", nom: "studio", hote: "studio" }, "chef"), "station studio · chef");
  });
  test("un ssh qui ne répond pas ne fait pas inventer de compte", () => {
    assert.equal(compteDeSsh("/nonexistent/ssh", "box"), COMPTE_INCONNU);
  });

  test("le terminal d'un shell porte son bandeau : le poste, puis une machine distante", () => {
    const projet = { nom: "p", dossier: "/tmp", monogramme: "P" } as never;
    const vus: { bandeau?: string }[] = [];
    const terminaux = ouvrirTerminaux({
      ouvrirPty: () => ({ ecrire() {}, redimensionner() {}, tuer() {} }) as never,
      claude: "claude",
      shell: "sh",
      surSortie() {},
      surEtat() {},
      compte: (cible) => (cible.lieu === "poste" ? "benoit" : "debian"),
    });
    vus.push(terminaux.ouvrir(projet, { lieu: "poste" }));
    vus.push(terminaux.ouvrir(projet, { lieu: "box", nom: "parade-box", hote: "parade-box" }));
    assert.deepEqual(vus.map(({ bandeau }) => bandeau), ["this Mac · benoit", "box parade-box · debian"]);
  });
});
