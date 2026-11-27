// Les trois gestes de la cuisine et de l'installation : reprendre, arrêter, vérifier
// l'installation. Chacun envoie la commande de docs/runtime/, « Piloter », dans le
// second, s'il est dit libre (terminals.test.ts) — sinon rien n'est écrit, nulle part.
// Vérifier l'installation part au clic ; reprendre et arrêter sont confirmés : sans le
// « oui » du chef, rien ne part, et la confirmation dit leur prix (confirmation.test.ts).
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, test } from "node:test";
import { ACTION, type Kitchen } from "../src/box.ts";
import { KITCHEN_ACTIONS } from "../src/kitchen.ts";
import { CONFIRMED, DIRECT, writeAction, ACTIONS, WITHOUT_YES } from "../src/actions.ts";
import { SAYS } from "../src/input.ts";
import { openTerminals } from "../src/terminals.ts";

const ROOT = join(import.meta.dirname, "../..");
const PARADE = { nom: "parade", dossier: "/projets/parade" };
const KITCHEN: Kitchen = { locale: { node: "/usr/bin/node", runtime: "/r/runtime", racine: "/r/station", env: {} } };
const IN_WORKSTATION = (suite: string) => `(cd '/r/runtime' && BRIGADE_STATION_DIR='/r/station' '/usr/bin/node' ${ACTION} parade ${suite})`;

const EXPECTED: Record<string, string> = {
  reprendre: IN_WORKSTATION("guardrails resume"),
  stop: IN_WORKSTATION("guardrails stop"),
  installation: IN_WORKSTATION("installation"),
};

describe("les gestes de la cuisine et de l'installation", () => {
  test("trois gestes, nommés par le socle : la vue les nomme, elle ne sait pas ce qu'ils écrivent", () => {
    assert.deepEqual(KITCHEN_ACTIONS.map(({ id }) => id), ["reprendre", "stop", "installation"]);
    assert.deepEqual(KITCHEN_ACTIONS.map(({ libelle: wording }) => wording), ["resume the kitchen", "stop the kitchen", "check the installation"]);
    for (const { id } of KITCHEN_ACTIONS) assert.ok(ACTIONS.some((action) => action.id === id), `« ${id} » n'est pas un geste du socle`);
  });

  test("reprendre et arrêter sont confirmés, vérifier l'installation est direct ; chacun envoie sa commande mot pour mot dans le second, aucun n'ouvre de shell — et d'un second qui démarre, rien ne part", async () => {
    assert.deepEqual(KITCHEN_ACTIONS.map(({ id }) => (CONFIRMED.includes(id) ? "confirmé" : DIRECT.includes(id) ? "direct" : "?")), ["confirmé", "confirmé", "direct"]);

    for (const { id } of KITCHEN_ACTIONS) {
      const writtenOnes: string[][] = [];
      const terminals = openTerminals({
        claude: "claude",
        shell: "/bin/zsh",
        ouvrirPty() {
          const receivedOnes: string[] = [];
          writtenOnes.push(receivedOnes);
          return { ecrire: (data) => void receivedOnes.push(data), redimensionner: () => {}, tuer: () => {} };
        },
        surSortie: () => {},
        surEtat: () => {},
      });
      terminals.espace(PARADE);

      // Sans « oui », un geste confirmé ne touche pas au second.
      if (CONFIRMED.includes(id)) assert.deepEqual(writeAction(terminals, id, PARADE, undefined, KITCHEN), { refus: WITHOUT_YES }, id);

      const rendered = await writeAction(terminals, id, PARADE, true, KITCHEN);

      // Le second vient d'être lancé : il n'est pas dit libre. Rien n'est écrit — ni dans sa saisie, ni dans un shell.
      assert.deepEqual(rendered, { refus: `${SAYS.demarre} — the command did not go, and nothing is written: \`!${EXPECTED[id]}\`` }, id);
      assert.deepEqual(writtenOnes, [[]], id);
    }
  });

  test("la confirmation d'arrêter est celle de l'app, pas une boîte du système : ni `confirm`, ni `dialog`, ni rien qui se lance", () => {
    const vue = readFileSync(join(ROOT, "app/src/vue/vue.js"), "utf8");
    const principal = readFileSync(join(ROOT, "app/src/main.ts"), "utf8");
    const action = principal.slice(principal.indexOf('ipcMain.handle("geste"'), principal.indexOf('ipcMain.on("regarder"'));

    assert.doesNotMatch(vue, /\b(confirm|alert|prompt)\s*\(/);
    assert.doesNotMatch(action, /dialog\.|showMessageBox/);
    for (const module of ["kitchen.ts", "confirmation.ts"]) assert.doesNotMatch(readFileSync(join(ROOT, "app/src", module), "utf8"), /^(?!\/\/).*(dialog|showMessageBox|\bconfirm\(|node:child_process)/m, module);
  });
});
