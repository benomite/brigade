// Les trois gestes de la cuisine et de l'installation : reprendre, arrêter, vérifier
// l'installation. Chacun envoie la commande de docs/runtime/, « Piloter », dans le
// second, s'il est dit libre (terminaux.test.ts) — sinon rien n'est écrit, nulle part.
// Vérifier l'installation part au clic ; reprendre et arrêter sont confirmés : sans le
// « oui » du chef, rien ne part, et la confirmation dit leur prix (confirmation.test.ts).
import { docRuntime } from "./aides/doc-runtime.ts";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, test } from "node:test";
import { ACTION, type Kitchen } from "../src/box.ts";
import { KITCHEN_ACTIONS } from "../src/kitchen.ts";
import { CONFIRMES, DIRECTS, ecrireAction, ACTIONS, SANS_OUI } from "../src/actions.ts";
import { DIT } from "../src/saisie.ts";
import { ouvrirTerminaux } from "../src/terminaux.ts";

const RACINE = join(import.meta.dirname, "../..");
const PARADE = { nom: "parade", dossier: "/projets/parade" };
const KITCHEN: Kitchen = { locale: { node: "/usr/bin/node", runtime: "/r/runtime", racine: "/r/station", env: {} } };
const EN_WORKSTATION = (suite: string) => `(cd '/r/runtime' && BRIGADE_STATION_DIR='/r/station' '/usr/bin/node' ${ACTION} parade ${suite})`;

const ATTENDUES: Record<string, string> = {
  reprendre: EN_WORKSTATION("guardrails resume"),
  stop: EN_WORKSTATION("guardrails stop"),
  installation: EN_WORKSTATION("installation"),
};

describe("les gestes de la cuisine et de l'installation", () => {
  test("trois gestes, nommés par le socle : la vue les nomme, elle ne sait pas ce qu'ils écrivent", () => {
    assert.deepEqual(KITCHEN_ACTIONS.map(({ id }) => id), ["reprendre", "stop", "installation"]);
    assert.deepEqual(KITCHEN_ACTIONS.map(({ libelle }) => libelle), ["resume the kitchen", "stop the kitchen", "check the installation"]);
    for (const { id } of KITCHEN_ACTIONS) assert.ok(ACTIONS.some((action) => action.id === id), `« ${id} » n'est pas un geste du socle`);
  });

  test("reprendre et arrêter sont confirmés, vérifier l'installation est direct ; chacun envoie la commande de la doc mot pour mot dans le second, aucun n'ouvre de shell — et d'un second qui démarre, rien ne part", async () => {
    const doc = docRuntime(RACINE);
    assert.ok(doc.includes("`brigade <projet> guardrails [stop \\| resume]`"), "docs/runtime/, « Piloter », ne cite plus guardrails stop | resume");
    assert.ok(doc.includes("npm --prefix runtime run guardrails -- stop"));
    assert.ok(doc.includes("npm --prefix runtime run guardrails -- resume"));
    assert.ok(/^\| .*`brigade <projet> installation`/m.test(doc) || doc.includes("brigade <projet> installation"), "docs/runtime/ ne cite plus `brigade <projet> installation`");
    assert.deepEqual(KITCHEN_ACTIONS.map(({ id }) => (CONFIRMES.includes(id) ? "confirmé" : DIRECTS.includes(id) ? "direct" : "?")), ["confirmé", "confirmé", "direct"]);

    for (const { id } of KITCHEN_ACTIONS) {
      const ecrits: string[][] = [];
      const terminaux = ouvrirTerminaux({
        claude: "claude",
        shell: "/bin/zsh",
        ouvrirPty() {
          const recus: string[] = [];
          ecrits.push(recus);
          return { ecrire: (donnees) => void recus.push(donnees), redimensionner: () => {}, tuer: () => {} };
        },
        surSortie: () => {},
        surEtat: () => {},
      });
      terminaux.espace(PARADE);

      // Sans « oui », un geste confirmé ne touche pas au second.
      if (CONFIRMES.includes(id)) assert.deepEqual(ecrireAction(terminaux, id, PARADE, undefined, KITCHEN), { refus: SANS_OUI }, id);

      const rendu = await ecrireAction(terminaux, id, PARADE, true, KITCHEN);

      // Le second vient d'être lancé : il n'est pas dit libre. Rien n'est écrit — ni dans sa saisie, ni dans un shell.
      assert.deepEqual(rendu, { refus: `${DIT.demarre} — the command did not go, and nothing is written: \`!${ATTENDUES[id]}\`` }, id);
      assert.deepEqual(ecrits, [[]], id);
    }
  });

  test("la confirmation d'arrêter est celle de l'app, pas une boîte du système : ni `confirm`, ni `dialog`, ni rien qui se lance", () => {
    const vue = readFileSync(join(RACINE, "app/src/vue/vue.js"), "utf8");
    const principal = readFileSync(join(RACINE, "app/src/main.ts"), "utf8");
    const action = principal.slice(principal.indexOf('ipcMain.handle("geste"'), principal.indexOf('ipcMain.on("regarder"'));

    assert.doesNotMatch(vue, /\b(confirm|alert|prompt)\s*\(/);
    assert.doesNotMatch(action, /dialog\.|showMessageBox/);
    for (const module of ["kitchen.ts", "confirmation.ts"]) assert.doesNotMatch(readFileSync(join(RACINE, "app/src", module), "utf8"), /^(?!\/\/).*(dialog|showMessageBox|\bconfirm\(|node:child_process)/m, module);
  });
});
