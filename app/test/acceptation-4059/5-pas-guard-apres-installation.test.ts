// Test d'acceptation gelé (#4059), critère 5.
// Le contrat que ce test fixe, parce que le ticket le laisse ouvert : l'écran de connexion (`tenirConnexionGitHub`, app/src/vue/connection-github.js)
// reçoit dans son pont `outilsManquants()` — les outils absents, `[{ outil: "gh" | "git" | "claude" }]` —. À son ouverture il demande les outils ; s'il en manque un, il montre l'écran de l'outil manquant à la place
// du bouton de connexion : le nom de l'outil, une phrase qui dit pourquoi l'app en a besoin, un lien « how to install … » vers la page d'installation, un bouton
// « I installed it » qui redemande les outils. Les vues sont jouées devant un faux document.
import assert from "node:assert/strict";
import { test } from "node:test";
import { holdConnectionGitHub } from "../../src/vue/connection-github.js";
import { Faux, repos } from "../aides/fausse-vue.ts";

const doc = { createElement: (balise: string) => new Faux(balise) } as never;
const toutes = (n: Faux): Faux[] => [n, ...n.descendants()];
const boutons = (n: Faux): Faux[] => toutes(n).filter((x) => x.balise === "button" && !x.hidden);
const lienDInstallation = (n: Faux): Faux[] => boutons(n).filter((b) => /^how to install/i.test(b.textContent.trim()));
const dejaFait = (n: Faux): Faux[] => boutons(n).filter((b) => /installed it/i.test(b.textContent));
const pont = (manquants: () => { outil: string }[], extra: Record<string, unknown> = {}) => ({ outilsManquants: async () => manquants().map((m) => ({ ...m, installation: { texte: "Install it.", lien: "https://example.com/install" } })), seConnecterAGitHub: async () => ({ code: "ABCD-1234", url: "https://github.com/login/device" }), ...extra });
async function ouvrir(p: unknown) {
  const lieu = new Faux("div");
  const apres: unknown[] = [];
  holdConnectionGitHub(lieu as never, doc, { pont: p as never, apres: (c) => apres.push(c) });
  await repos();
  return { lieu, apres };
}

test("after the install, one 'I installed it' check brings back the sign-in step, with no restart and no extra sign-in launched", async () => {
  let manque = [{ outil: "gh" }];
  let verifications = 0;
  let connections = 0;
  const { lieu, apres } = await ouvrir(
    pont(() => (verifications++, manque), { seConnecterAGitHub: async () => (connections++, { code: "ABCD-1234", url: "https://github.com/login/device" }) }),
  );
  assert.equal(dejaFait(lieu).length, 1, "un bouton « I installed it »");
  manque = [];
  const avant = verifications;
  (dejaFait(lieu)[0] as Faux).click();
  await repos();
  assert.ok(verifications > avant, "l'app a recontrôlé");
  assert.equal(lienDInstallation(lieu).length, 0, "l'écran de l'outil manquant est parti");
  assert.match(lieu.textContent, /Sign in to GitHub/, "le pas de connexion est gardé");
  assert.ok(boutons(lieu).some((b) => /sign in with GitHub/i.test(b.textContent)), "le bouton de connexion est de retour");
  assert.equal(connections, 0, "la connexion n'a pas été relancée à la place du chef");
  assert.deepEqual(apres, [], "le chemin n'est pas fini d'un coup");
});
