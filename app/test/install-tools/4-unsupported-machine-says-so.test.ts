// Contract these acceptance tests fix, because the ticket leaves it open (#4350, criterion 4):
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
import { Faux } from "../aides/fausse-vue.ts";

const doc = { createElement: (balise: string) => new Faux(balise) } as never;

test("on a machine where the tool cannot be installed, the screen says so, offers no install button and keeps the written guidance", async () => {
  let travail = 0;
  const install = tenirInstallation({
    plateforme: "freebsd" as NodeJS.Platform,
    env: { PATH: "/usr/bin" },
    dossier: "/unused",
    telecharger: async () => void travail++,
    lancer: async () => (travail++, { code: 0, sortie: "" }),
    rendre: () => {},
  });
  assert.equal(install.possible("gh"), false);
  await install.installer("gh");
  assert.equal(travail, 0, "nothing is downloaded or run on an unsupported platform");

  const installation = { texte: "Install the GitHub CLI with your distribution's package manager.", lien: "https://github.com/cli/cli#installation" };
  const lieu = new Faux("div");
  lieu.replaceChildren(...(poserLesOutils(doc, { lu: true, manque: { outil: "gh", installation }, installation: { installable: false, phase: "idle" } }, { ouvrir: () => {}, verifier: () => {}, installer: () => {} } as never) as Faux[]));
  assert.match(lieu.textContent, /cannot install/i);
  const boutons = lieu.dessous("button").map((b) => b.textContent);
  assert.ok(!boutons.includes("install gh"));
  assert.deepEqual(boutons, [LA_PAGE("gh"), DEJA_INSTALLE]);
});
