// Contract these acceptance tests fix, because the ticket leaves it open (#4350, criterion 2):
// `app/src/install-tools/install-tools.ts` exports `tenirInstallation({ plateforme, env, dossier, telecharger, lancer?, rendre })` -> `{ possible(outil), etat(outil), installer(outil) }`.
//   - `etat(outil)` -> `{ phase: "idle" | "installing" | "done" | "failed", raison?: string }`; `rendre()` is called on each change.
//   - gh: `telecharger(url, dossier)` fetches and unpacks the official GitHub CLI release archive into `dossier` (the fake puts `bin/gh` there); a throw is a failed download.
//     On success the app shell env gets `<dossier>/bin` first on its PATH, then `gh --version` is run through that env.
//   - claude: `lancer(commande, args, { env })` -> `{ code, sortie }` runs the official install command, then `claude --version` to verify.
//   - `possible("git")` is false: git is never installed by the app.
// The screen: `poserLesOutils(doc, etat, geste)` (vue/outils-requis/outils-requis.js) takes `etat.installation = { installable, phase, raison? }` and `geste.installer()`.
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { tenirInstallation } from "../../src/install-tools/install-tools.ts";
import { DEJA_INSTALLE, LA_PAGE, poserLesOutils } from "../../src/vue/outils-requis/outils-requis.js";
import { Faux } from "../aides/fausse-vue.ts";

const doc = { createElement: (balise: string) => new Faux(balise) } as never;
const installation = { texte: "Install the GitHub CLI with its macOS installer.", lien: "https://cli.github.com" };

test("a failed gh download ends in failed with its reason, keeps today's written guidance, and leaves no spinner", async () => {
  const env: Record<string, string | undefined> = { PATH: "/usr/bin:/bin" };
  const install = tenirInstallation({
    plateforme: "linux",
    env,
    dossier: mkdtempSync(join(tmpdir(), "gh-install-")),
    telecharger: async () => {
      throw new Error("download failed: HTTP 503");
    },
    rendre: () => {},
  });
  await install.installer("gh");
  const etat = install.etat("gh");
  assert.equal(etat.phase, "failed");
  assert.match(etat.raison ?? "", /HTTP 503/);
  assert.equal(env.PATH, "/usr/bin:/bin");

  const lieu = new Faux("div");
  lieu.replaceChildren(...(poserLesOutils(doc, { lu: true, manque: { outil: "gh", installation }, installation: { installable: true, ...etat } }, { ouvrir: () => {}, verifier: () => {}, installer: () => {} } as never) as Faux[]));
  assert.match(lieu.textContent, /HTTP 503/);
  const boutons = lieu.dessous("button").map((b) => b.textContent);
  assert.ok(boutons.includes(LA_PAGE("gh")), "the written guidance link stays");
  assert.ok(boutons.includes(DEJA_INSTALLE));
  assert.equal(lieu.dessous("p").filter((p) => p.role === "status").length, 0, "no spinner stays");
  assert.doesNotMatch(lieu.textContent, /installing/i);
});
