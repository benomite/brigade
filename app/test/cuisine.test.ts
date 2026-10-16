// Les trois gestes de la cuisine et de l'installation : reprendre, arrêter, vérifier
// l'installation. Chacun envoie la commande de docs/runtime.md, « Piloter », dans le
// second, s'il est dit libre (terminaux.test.ts) — sinon rien n'est écrit, nulle part.
// Vérifier l'installation part au clic ; reprendre et arrêter sont confirmés : sans le
// « oui » du chef, rien ne part, et la confirmation dit leur prix (confirmation.test.ts).
import { lireDocRuntime } from "./aides/doc-runtime.ts";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, test } from "node:test";
import { GESTES_DE_LA_CUISINE } from "../src/cuisine.ts";
import { CONFIRMES, DIRECTS, ecrireGeste, GESTES, SANS_OUI } from "../src/gestes.ts";
import { DIT } from "../src/saisie.ts";
import { ouvrirTerminaux } from "../src/terminaux.ts";

const RACINE = join(import.meta.dirname, "../..");
const PARADE = { nom: "parade", dossier: "/projets/parade", box: { hote: "box" } };

const ATTENDUES: Record<string, string> = {
  reprendre: "ssh box brigade parade guardrails resume",
  stop: "ssh box brigade parade guardrails stop",
  installation: "ssh box brigade parade installation",
};

describe("les gestes de la cuisine et de l'installation", () => {
  test("trois gestes, nommés par le socle : la vue les nomme, elle ne sait pas ce qu'ils écrivent", () => {
    assert.deepEqual(GESTES_DE_LA_CUISINE.map(({ id }) => id), ["reprendre", "stop", "installation"]);
    assert.deepEqual(GESTES_DE_LA_CUISINE.map(({ libelle }) => libelle), ["resume the kitchen", "stop the kitchen", "check the installation"]);
    for (const { id } of GESTES_DE_LA_CUISINE) assert.ok(GESTES.some((geste) => geste.id === id), `« ${id} » n'est pas un geste du socle`);
  });

  test("reprendre et arrêter sont confirmés, vérifier l'installation est direct ; chacun envoie la commande de la doc mot pour mot dans le second, aucun n'ouvre de shell — et d'un second qui démarre, rien ne part", async () => {
    const doc = lireDocRuntime(RACINE);
    assert.ok(doc.includes("`brigade <projet> guardrails [stop \\| resume]`"), "docs/runtime.md, « Piloter », ne cite plus guardrails stop | resume");
    assert.ok(doc.includes("npm --prefix runtime run guardrails -- stop"));
    assert.ok(doc.includes("npm --prefix runtime run guardrails -- resume"));
    assert.ok(/^\| .*`brigade <projet> installation`/m.test(doc) || doc.includes("brigade <projet> installation"), "docs/runtime.md ne cite plus `brigade <projet> installation`");
    assert.deepEqual(GESTES_DE_LA_CUISINE.map(({ id }) => (CONFIRMES.includes(id) ? "confirmé" : DIRECTS.includes(id) ? "direct" : "?")), ["confirmé", "confirmé", "direct"]);

    for (const { id } of GESTES_DE_LA_CUISINE) {
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
      if (CONFIRMES.includes(id)) assert.deepEqual(ecrireGeste(terminaux, id, PARADE), { refus: SANS_OUI }, id);

      const rendu = await ecrireGeste(terminaux, id, PARADE, undefined, true);

      // Le second vient d'être lancé : il n'est pas dit libre. Rien n'est écrit — ni dans sa saisie, ni dans un shell.
      assert.deepEqual(rendu, { refus: `${DIT.demarre} — the command did not go, and nothing is written: \`!${ATTENDUES[id]}\`` }, id);
      assert.deepEqual(ecrits, [[]], id);
    }
  });

  test("la confirmation d'arrêter est celle de l'app, pas une boîte du système : ni `confirm`, ni `dialog`, ni rien qui se lance", () => {
    const vue = readFileSync(join(RACINE, "app/src/vue/vue.js"), "utf8");
    const principal = readFileSync(join(RACINE, "app/src/main.ts"), "utf8");
    const geste = principal.slice(principal.indexOf('ipcMain.handle("geste"'), principal.indexOf('ipcMain.on("regarder"'));

    assert.doesNotMatch(vue, /\b(confirm|alert|prompt)\s*\(/);
    assert.doesNotMatch(geste, /dialog\.|showMessageBox/);
    for (const module of ["cuisine.ts", "confirmation.ts"]) assert.doesNotMatch(readFileSync(join(RACINE, "app/src", module), "utf8"), /^(?!\/\/).*(dialog|showMessageBox|\bconfirm\(|node:child_process)/m, module);
  });
});
