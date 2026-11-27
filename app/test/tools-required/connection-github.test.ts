// L'écran « Sign in to GitHub » (#4059, vue/connection-github.js) : tant que les outils se lisent, le bouton n'est pas
// offert ; un clic vérifie d'abord, et une connexion qui ne peut pas partir ne tourne pas.
import assert from "node:assert/strict";
import { test } from "node:test";
import { holdConnectionGitHub } from "../../src/vue/connection-github.js";
import { ALREADY_INSTALLS, VERIFICATION } from "../../src/vue/tools-required/tools-required.js";
import { Fake, repos } from "../helpers/false-vue.ts";

const doc = { createElement: (balise: string) => new Fake(balise) } as never;
const buttons = (place: Fake) => place.dessous("button").filter((b) => !b.hidden && b.className !== "aide").map((b) => b.textContent);

test("la première lecture des outils en route : ni bouton de connexion, ni geste — la ligne dit qu'elle lit", async () => {
  const place = new Fake("div");
  holdConnectionGitHub(place as never, doc, { pont: { outilsManquants: () => new Promise(() => {}), seConnecterAGitHub: async () => ({ code: "ABCD-1234", page: "https://github.com/login/device" }) } as never, apres: () => {} });
  await repos();
  assert.deepEqual(buttons(place), []);
  assert.match(place.textContent, new RegExp(VERIFICATION));
});

test("un clic sur « sign in with GitHub » vérifie d'abord : gh parti, la connexion ne part pas et l'outil se dit ; revenu, elle part", async () => {
  const place = new Fake("div");
  let lack: { outil: string }[] = [];
  let connections = 0;
  holdConnectionGitHub(place as never, doc, {
    pont: { outilsManquants: async () => lack, seConnecterAGitHub: async () => (connections++, { code: "ABCD-1234", page: "https://github.com/login/device" }) } as never,
    apres: () => {},
  });
  await repos();
  lack = [{ outil: "gh" }];
  (place.dessous("button").find((b) => b.textContent === "sign in with GitHub") ?? assert.fail("pas de bouton")).click();
  await repos();
  assert.equal(connections, 0);
  assert.ok(buttons(place).includes(ALREADY_INSTALLS));
  lack = [];
  (place.dessous("button").find((b) => b.textContent === ALREADY_INSTALLS) ?? assert.fail("pas de « I installed it »")).click();
  await repos();
  (place.dessous("button").find((b) => b.textContent === "sign in with GitHub") ?? assert.fail("pas de bouton")).click();
  await repos();
  assert.equal(connections, 1);
});
