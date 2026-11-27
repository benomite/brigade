// Le bandeau d'un shell : la machine, puis le compte de ce poste.
import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { textBanner } from "../src/banner.ts";
import { openTerminals } from "../src/terminals.ts";
import { HERE } from "../src/platform.ts";

describe("le bandeau d'un shell", () => {
  test("ce poste : « this computer · benoit » — « this computer » sous Windows", () => {
    assert.equal(textBanner({ lieu: "poste" }, "benoit"), `${HERE} · benoit`);
  });

  test("le terminal d'un shell porte son bandeau : le poste, puis son compte", () => {
    const project = { nom: "p", dossier: "/tmp" } as never;
    const terminals = openTerminals({
      ouvrirPty: () => ({ ecrire() {}, redimensionner() {}, tuer() {} }) as never,
      claude: "claude",
      shell: "sh",
      surSortie() {},
      surEtat() {},
      compte: () => "benoit",
    });
    assert.equal(terminals.ouvrir(project, { lieu: "poste" }).bandeau, `${HERE} · benoit`);
  });
});
