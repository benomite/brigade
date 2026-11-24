// Test d'acceptation gelé (#4059), critère 6.
// Le contrat que ce test fixe, parce que le ticket le laisse ouvert : l'écran de connexion (`tenirConnexionGitHub`, app/src/vue/connexion-github.js)
// reçoit dans son pont `outilsManquants()` — les outils absents, `[{ outil: "gh" | "git" | "claude" }]` — et `installerOutil(outil)` —
// `{ fait }` ou `{ refus }`. À son ouverture il demande les outils ; s'il en manque un, il montre l'écran de l'outil manquant à la place
// du bouton de connexion : le nom de l'outil, une phrase qui dit pourquoi l'app en a besoin, un bouton « install … », un bouton
// « I installed it » qui redemande les outils. Les vues sont jouées devant un faux document.
import assert from "node:assert/strict";
import { test } from "node:test";
import { tenirConnexionGitHub } from "../../src/vue/connexion-github.js";
import { Faux, repos } from "../aides/fausse-vue.ts";

const doc = { createElement: (balise: string) => new Faux(balise) } as never;
const toutes = (n: Faux): Faux[] => [n, ...n.descendants()];
const boutons = (n: Faux): Faux[] => toutes(n).filter((x) => x.balise === "button" && !x.hidden);
const installer = (n: Faux): Faux[] => boutons(n).filter((b) => /^install/i.test(b.textContent.trim()));
const dejaFait = (n: Faux): Faux[] => boutons(n).filter((b) => /installed it/i.test(b.textContent));
const pont = (manquants: () => { outil: string }[], extra: Record<string, unknown> = {}) => ({ outilsManquants: async () => manquants(), installerOutil: async () => ({ fait: "started" }), seConnecterAGitHub: async () => ({ code: "ABCD-1234", url: "https://github.com/login/device" }), ...extra });
async function ouvrir(p: unknown) {
  const lieu = new Faux("div");
  const apres: unknown[] = [];
  tenirConnexionGitHub(lieu as never, doc, { pont: p as never, apres: (c) => apres.push(c) });
  await repos();
  return { lieu, apres };
}

test("when the install fails, the screen says so and keeps the install offer", async () => {
  const { lieu } = await ouvrir(pont(() => [{ outil: "gh" }], { installerOutil: async () => ({ refus: "the install did not finish: no network" }) }));
  (installer(lieu)[0] as Faux).click();
  await repos();
  assert.match(lieu.textContent, /did not finish: no network/);
  assert.equal(installer(lieu).length, 1, "l'offre reste visible");
});

test("when the tool is still missing after the check, the screen says so and keeps the install offer", async () => {
  const { lieu } = await ouvrir(pont(() => [{ outil: "gh" }]));
  (dejaFait(lieu)[0] as Faux).click();
  await repos();
  assert.match(lieu.textContent, /still (missing|not|absent)|not found|could not find/i);
  assert.equal(installer(lieu).length, 1, "l'offre reste visible");
  assert.notEqual(lieu.textContent.trim(), "", "pas d'état vide");
});
