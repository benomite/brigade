// L'écran « Sign in to GitHub » (#4059, vue/connexion-github.js) : tant que les outils se lisent, le bouton n'est pas
// offert ; un clic vérifie d'abord, et une connexion qui ne peut pas partir ne tourne pas.
import assert from "node:assert/strict";
import { test } from "node:test";
import { tenirConnexionGitHub } from "../../src/vue/connexion-github.js";
import { DEJA_INSTALLE, VERIFICATION } from "../../src/vue/outils-requis/outils-requis.js";
import { Faux, repos } from "../aides/fausse-vue.ts";

const doc = { createElement: (balise: string) => new Faux(balise) } as never;
const boutons = (lieu: Faux) => lieu.dessous("button").filter((b) => !b.hidden && b.className !== "aide").map((b) => b.textContent);

test("la première lecture des outils en route : ni bouton de connexion, ni geste — la ligne dit qu'elle lit", async () => {
  const lieu = new Faux("div");
  tenirConnexionGitHub(lieu as never, doc, { pont: { outilsManquants: () => new Promise(() => {}), seConnecterAGitHub: async () => ({ code: "ABCD-1234", page: "https://github.com/login/device" }) } as never, apres: () => {} });
  await repos();
  assert.deepEqual(boutons(lieu), []);
  assert.match(lieu.textContent, new RegExp(VERIFICATION));
});

test("un clic sur « sign in with GitHub » vérifie d'abord : gh parti, la connexion ne part pas et l'outil se dit ; revenu, elle part", async () => {
  const lieu = new Faux("div");
  let manque: { outil: string }[] = [];
  let connexions = 0;
  tenirConnexionGitHub(lieu as never, doc, {
    pont: { outilsManquants: async () => manque, seConnecterAGitHub: async () => (connexions++, { code: "ABCD-1234", page: "https://github.com/login/device" }) } as never,
    apres: () => {},
  });
  await repos();
  manque = [{ outil: "gh" }];
  (lieu.dessous("button").find((b) => b.textContent === "sign in with GitHub") ?? assert.fail("pas de bouton")).click();
  await repos();
  assert.equal(connexions, 0);
  assert.ok(boutons(lieu).includes(DEJA_INSTALLE));
  manque = [];
  (lieu.dessous("button").find((b) => b.textContent === DEJA_INSTALLE) ?? assert.fail("pas de « I installed it »")).click();
  await repos();
  (lieu.dessous("button").find((b) => b.textContent === "sign in with GitHub") ?? assert.fail("pas de bouton")).click();
  await repos();
  assert.equal(connexions, 1);
});
