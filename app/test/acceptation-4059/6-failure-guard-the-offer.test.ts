// Test d'acceptation gelé (#4059), critère 6.
// Le contrat que ce test fixe, parce que le ticket le laisse ouvert : l'écran de connexion (`tenirConnexionGitHub`, app/src/vue/connection-github.js)
// reçoit dans son pont `outilsManquants()` — les outils absents, `[{ outil: "gh" | "git" | "claude" }]` —. À son ouverture il demande les outils ; s'il en manque un, il montre l'écran de l'outil manquant à la place
// du bouton de connexion : le nom de l'outil, une phrase qui dit pourquoi l'app en a besoin, un lien « how to install … » vers la page d'installation, un bouton
// « I installed it » qui redemande les outils. Les vues sont jouées devant un faux document.
import assert from "node:assert/strict";
import { test } from "node:test";
import { holdConnectionGitHub } from "../../src/vue/connection-github.js";
import { Fake, repos } from "../helpers/false-vue.ts";

const doc = { createElement: (balise: string) => new Fake(balise) } as never;
const allEntries = (n: Fake): Fake[] => [n, ...n.descendants()];
const buttons = (n: Fake): Fake[] => allEntries(n).filter((x) => x.balise === "button" && !x.hidden);
const linkOfInstallation = (n: Fake): Fake[] => buttons(n).filter((b) => /^how to install/i.test(b.textContent.trim()));
const alreadyDone = (n: Fake): Fake[] => buttons(n).filter((b) => /installed it/i.test(b.textContent));
const bridge = (missing: () => { outil: string }[], extra: Record<string, unknown> = {}) => ({ outilsManquants: async () => missing().map((m) => ({ ...m, installation: { texte: "Install it.", lien: "https://example.com/install" } })), seConnecterAGitHub: async () => ({ code: "ABCD-1234", url: "https://github.com/login/device" }), ...extra });
async function open(p: unknown) {
  const place = new Fake("div");
  const after: unknown[] = [];
  holdConnectionGitHub(place as never, doc, { pont: p as never, apres: (c) => after.push(c) });
  await repos();
  return { lieu: place, apres: after };
}

test("when the tool is still missing after the check, the screen says so and keeps the install link", async () => {
  const { lieu: place } = await open(bridge(() => [{ outil: "gh" }]));
  (alreadyDone(place)[0] as Fake).click();
  await repos();
  assert.match(place.textContent, /still (missing|not|absent)|not found|could not find/i);
  assert.equal(linkOfInstallation(place).length, 1, "l'offre reste visible");
  assert.notEqual(place.textContent.trim(), "", "pas d'état vide");
});
