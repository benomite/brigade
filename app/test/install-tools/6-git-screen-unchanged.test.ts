// Acceptance test (#4350), criterion 6: with git absent the screen is the same as before — no install button, same guidance.
import assert from "node:assert/strict";
import { test } from "node:test";
import { DEJA_INSTALLE, LA_PAGE, MANQUE, poserLesOutils } from "../../src/vue/outils-requis/outils-requis.js";
import { Faux } from "../aides/fausse-vue.ts";

const doc = { createElement: (balise: string) => new Faux(balise) } as never;
const installation = { texte: "Install Git with Apple's command line developer tools.", lien: "https://git-scm.com/download/mac" };

// brigade:guard
test("git absent: no install button, the same title, reason and guidance as before", () => {
  const lieu = new Faux("div");
  lieu.replaceChildren(...(poserLesOutils(doc, { lu: true, manque: { outil: "git", installation } }, { ouvrir: () => {}, verifier: () => {} }) as Faux[]));
  assert.equal(lieu.dessous("h3")[0]?.textContent, MANQUE("git"));
  assert.equal(lieu.dessous("p").find((p) => p.className === "pourquoi")?.dessous("code").map((c) => c.textContent).join(" "), "git");
  assert.deepEqual(lieu.dessous("button").map((b) => b.textContent), [LA_PAGE("git"), DEJA_INSTALLE]);
  assert.ok(lieu.dessous("button").every((b) => !/^install /.test(b.textContent)));
});
