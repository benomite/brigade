// Le bandeau d'un shell : la machine, puis le compte de ce poste.
import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { texteBandeau } from "../src/bandeau.ts";
import { ouvrirTerminaux } from "../src/terminaux.ts";
import { ICI } from "../src/plateforme.ts";

describe("le bandeau d'un shell", () => {
  test("ce poste : « this Mac · benoit » — « this PC » sous Windows", () => {
    assert.equal(texteBandeau({ lieu: "poste" }, "benoit"), `${ICI} · benoit`);
  });

  test("le terminal d'un shell porte son bandeau : le poste, puis son compte", () => {
    const projet = { nom: "p", dossier: "/tmp" } as never;
    const terminaux = ouvrirTerminaux({
      ouvrirPty: () => ({ ecrire() {}, redimensionner() {}, tuer() {} }) as never,
      claude: "claude",
      shell: "sh",
      surSortie() {},
      surEtat() {},
      compte: () => "benoit",
    });
    assert.equal(terminaux.ouvrir(projet, { lieu: "poste" }).bandeau, `${ICI} · benoit`);
  });
});
