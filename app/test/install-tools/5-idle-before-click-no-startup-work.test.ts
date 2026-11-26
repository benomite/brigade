// Contract these acceptance tests fix, because the ticket leaves it open (#4350, criterion 5):
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
import { poserLesOutils } from "../../src/vue/outils-requis/outils-requis.js";
import { Faux, repos } from "../aides/fausse-vue.ts";

const doc = { createElement: (balise: string) => new Faux(balise) } as never;

test("before any click the screen is idle: no download and no install command runs at startup or in the background", async () => {
  const appels: string[] = [];
  const install = tenirInstallation({
    plateforme: "linux",
    env: { PATH: "/usr/bin" },
    dossier: "/unused",
    telecharger: async (url: string) => void appels.push(`download ${url}`),
    lancer: async (commande: string) => (appels.push(`run ${commande}`), { code: 0, sortie: "" }),
    rendre: () => {},
  });
  for (const outil of ["gh", "claude"] as const) {
    assert.equal(install.etat(outil).phase, "idle");
    const lieu = new Faux("div");
    lieu.replaceChildren(...(poserLesOutils(doc, { lu: true, manque: { outil }, installation: { installable: true, phase: "idle" } }, { ouvrir: () => {}, verifier: () => {}, installer: () => {} } as never) as Faux[]));
    assert.ok(lieu.dessous("button").some((b) => b.textContent === `install ${outil}`));
  }
  await repos();
  await new Promise((resolu) => setTimeout(resolu, 100));
  assert.deepEqual(appels, []);
  assert.equal(install.etat("gh").phase, "idle");
});
