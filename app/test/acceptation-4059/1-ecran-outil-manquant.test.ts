// Test d'acceptation gelé (#4059), critère 1.
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

for (const [outil, nom] of [["gh", /GitHub CLI|\bgh\b/], ["git", /\bgit\b/i], ["claude", /Claude Code|\bclaude\b/i]] as const) {
  test(`with ${outil} absent, the sign-in screen names it, says why in one sentence and offers one install action`, async () => {
    const { lieu } = await ouvrir(pont(() => [{ outil }]));
    const texte = lieu.textContent;
    assert.match(texte, nom);
    assert.match(texte, /because|needs|to sign in|to clone|to cook|so that/i, "une phrase dit pourquoi");
    assert.equal(installer(lieu).length, 1, "une seule action d'installation");
  });
}
