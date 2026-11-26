// Contract these acceptance tests fix, because the ticket leaves it open (#4350, criterion 1):
// `app/src/install-tools/install-tools.ts` exports `tenirInstallation({ plateforme, env, dossier, telecharger, lancer?, rendre })` -> `{ possible(outil), etat(outil), installer(outil) }`.
//   - `etat(outil)` -> `{ phase: "idle" | "installing" | "done" | "failed", raison?: string }`; `rendre()` is called on each change.
//   - gh: `telecharger(url, dossier)` fetches and unpacks the official GitHub CLI release archive into `dossier` (the fake puts `bin/gh` there); a throw is a failed download.
//     On success the app shell env gets `<dossier>/bin` first on its PATH, then `gh --version` is run through that env.
//   - claude: `lancer(commande, args, { env })` -> `{ code, sortie }` runs the official install command, then `claude --version` to verify.
//   - `possible("git")` is false: git is never installed by the app.
// The screen: `poserLesOutils(doc, etat, geste)` (vue/outils-requis/outils-requis.js) takes `etat.installation = { installable, phase, raison? }` and `geste.installer()`.
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { chmodSync, mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { tenirInstallation } from "../../src/install-tools/install-tools.ts";
import { poserLesOutils, tenirLesOutils } from "../../src/vue/outils-requis/outils-requis.js";
import { SANS_POSIX } from "../aides/posix.ts";
import { Faux, repos } from "../aides/fausse-vue.ts";

const doc = { createElement: (balise: string) => new Faux(balise) } as never;

test("gh absent: 'install gh' is offered; a click goes idle, installing, done; then gh --version answers and the GitHub step is reachable", { skip: SANS_POSIX }, async () => {
  const dossier = mkdtempSync(join(tmpdir(), "gh-install-"));
  const env: Record<string, string | undefined> = { PATH: "/usr/bin:/bin" };
  const phases: string[] = [];
  let install: ReturnType<typeof tenirInstallation>;
  let liberer = () => {};
  const retenu = new Promise<void>((resolu) => (liberer = resolu));
  install = tenirInstallation({
    plateforme: "linux",
    env,
    dossier,
    telecharger: async (_url: string, vers: string) => {
      await retenu;
      mkdirSync(join(vers, "bin"), { recursive: true });
      writeFileSync(join(vers, "bin", "gh"), "#!/bin/sh\necho 'gh version 9.9.9 (fake)'\n");
      chmodSync(join(vers, "bin", "gh"), 0o755);
    },
    rendre: () => phases.push(install.etat("gh").phase),
  });
  assert.equal(install.possible("gh"), true);
  assert.equal(install.etat("gh").phase, "idle");

  const etat = { lu: true, manque: { outil: "gh" as const }, installation: { installable: true, phase: "idle" as const } };
  let clics = 0;
  const lieu = new Faux("div");
  lieu.replaceChildren(...(poserLesOutils(doc, etat, { ouvrir: () => {}, verifier: () => {}, installer: () => clics++ } as never) as Faux[]));
  const bouton = lieu.dessous("button").find((b) => b.textContent === "install gh") ?? assert.fail("no 'install gh' button");
  bouton.click();
  assert.equal(clics, 1);

  const fini = install.installer("gh");
  assert.equal(install.etat("gh").phase, "installing");
  liberer();
  await fini;
  assert.equal(install.etat("gh").phase, "done");
  assert.ok(phases.includes("installing") && phases.at(-1) === "done");

  assert.equal(env.PATH?.split(":")[0], join(dossier, "bin"));
  assert.match(execFileSync("gh", ["--version"], { env: env as NodeJS.ProcessEnv, encoding: "utf8" }), /gh version/);

  let pret = 0;
  const outils = tenirLesOutils({
    pont: { outilsManquants: async () => (execFileSync("sh", ["-c", "command -v gh"], { env: env as NodeJS.ProcessEnv }).length > 0 ? [] : [{ outil: "gh" as const }]) },
    rendre: () => {},
    quandPret: () => pret++,
  });
  outils.etat.manque = { outil: "gh" };
  await outils.verifier(true);
  await repos();
  assert.equal(pret, 1);
});
