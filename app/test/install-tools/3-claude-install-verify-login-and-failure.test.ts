// Contract these acceptance tests fix, because the ticket leaves it open (#4350, criterion 3):
// `app/src/install-tools/install-tools.ts` exports `tenirInstallation({ plateforme, env, dossier, telecharger, lancer?, rendre })` -> `{ possible(outil), etat(outil), installer(outil) }`.
//   - `etat(outil)` -> `{ phase: "idle" | "installing" | "done" | "failed", raison?: string }`; `rendre()` is called on each change.
//   - gh: `telecharger(url, dossier)` fetches and unpacks the official GitHub CLI release archive into `dossier` (the fake puts `bin/gh` there); a throw is a failed download.
//     On success the app shell env gets `<dossier>/bin` first on its PATH, then `gh --version` is run through that env.
//   - claude: `lancer(commande, args, { env })` -> `{ code, sortie }` runs the official install command, then `claude --version` to verify.
//   - `possible("git")` is false: git is never installed by the app.
// The screen: `poserLesOutils(doc, etat, geste)` (vue/outils-requis/outils-requis.js) takes `etat.installation = { installable, phase, raison? }` and `geste.installer()`.
import assert from "node:assert/strict";
import { test } from "node:test";
import { tenirInstallation } from "../../src/install-tools/install-tools.ts";
import { DEJA_INSTALLE, LA_PAGE, poserLesOutils } from "../../src/vue/outils-requis/outils-requis.js";
import { SE_CONNECTER_A_CLAUDE } from "../../src/vue/premier-lancement.js";
import { Faux } from "../aides/fausse-vue.ts";

const doc = { createElement: (balise: string) => new Faux(balise) } as never;
const installation = { texte: "Install Claude Code with its official installer.", lien: "https://code.claude.com/docs/en/setup" };
const geste = { ouvrir: () => {}, verifier: () => {}, installer: () => {} } as never;
const pose = (etat: object) => {
  const lieu = new Faux("div");
  lieu.replaceChildren(...(poserLesOutils(doc, etat as never, geste) as Faux[]));
  return lieu;
};

test("claude absent: 'install claude' is offered; one click runs the official install command, verifies claude answers, then shows the claude login button", async () => {
  assert.ok(pose({ lu: true, manque: { outil: "claude", installation }, installation: { installable: true, phase: "idle" } }).dessous("button").some((b) => b.textContent === "install claude"));

  const appels: string[] = [];
  const install = tenirInstallation({
    plateforme: "linux",
    env: { PATH: "/usr/bin" },
    dossier: "/unused",
    telecharger: async () => assert.fail("claude is not a download of the app"),
    lancer: async (commande: string, args: string[]) => (appels.push([commande, ...args].join(" ")), { code: 0, sortie: "1.0.0 (Claude Code)" }),
    rendre: () => {},
  });
  await install.installer("claude");
  assert.equal(install.etat("claude").phase, "done");
  const officielle = appels.findIndex((a) => /npm install -g @anthropic-ai\/claude-code|claude\.ai\/install/.test(a));
  assert.ok(officielle >= 0, `official install command not run: ${appels.join(" | ")}`);
  assert.equal(appels.filter((a) => /npm install -g @anthropic-ai\/claude-code|claude\.ai\/install/.test(a)).length, 1);
  assert.ok(appels.findIndex((a) => /^claude --version/.test(a)) > officielle, "claude is verified after the install");

  // The end of the path: the existing claude login button.
  assert.ok(pose({ lu: true, installation: { installable: true, phase: "done" }, connexionClaude: true }).textContent.length >= 0);
  assert.equal(SE_CONNECTER_A_CLAUDE, "log in");
  assert.ok(pose({ lu: true, installation: { installable: true, phase: "done", outil: "claude" } }).dessous("button").some((b) => b.textContent === SE_CONNECTER_A_CLAUDE), "the existing login button ends the path");
});

test("a failed claude install ends in failed with its reason and the written fallback, no spinner", async () => {
  const install = tenirInstallation({
    plateforme: "linux",
    env: { PATH: "/usr/bin" },
    dossier: "/unused",
    telecharger: async () => {},
    lancer: async () => ({ code: 1, sortie: "npm ERR! EACCES permission denied" }),
    rendre: () => {},
  });
  await install.installer("claude");
  const etat = install.etat("claude");
  assert.equal(etat.phase, "failed");
  assert.match(etat.raison ?? "", /EACCES/);
  const lieu = pose({ lu: true, manque: { outil: "claude", installation }, installation: { installable: true, ...etat } });
  assert.match(lieu.textContent, /EACCES/);
  const boutons = lieu.dessous("button").map((b) => b.textContent);
  assert.ok(boutons.includes(LA_PAGE("claude")) && boutons.includes(DEJA_INSTALLE));
  assert.equal(lieu.dessous("p").filter((p) => p.role === "status").length, 0);
});
