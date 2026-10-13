// Les trois gestes posés à côté de l'état de la cuisine : reprendre, arrêter,
// vérifier l'installation. Chacun écrit la commande de docs/runtime.md,
// « Piloter », dans un shell de l'espace — et rien ne l'envoie.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, test } from "node:test";
import { GESTES_DE_LA_CUISINE } from "../src/cuisine.ts";
import { ecrireGeste, GESTES } from "../src/gestes.ts";
import { ouvrirTerminaux } from "../src/terminaux.ts";

const RACINE = join(import.meta.dirname, "../..");
const PARADE = { nom: "parade", dossier: "/projets/parade", box: { hote: "box" } };

const ATTENDUES: Record<string, string> = {
  reprendre: "ssh box brigade parade garde-fous reprendre",
  stop: "ssh box brigade parade garde-fous stop",
  installation: "ssh box brigade parade installation",
};

describe("les gestes de la cuisine et de l'installation", () => {
  test("trois gestes, nommés par le socle : la vue les nomme, elle ne sait pas ce qu'ils écrivent", () => {
    assert.deepEqual(GESTES_DE_LA_CUISINE.map(({ id }) => id), ["reprendre", "stop", "installation"]);
    assert.deepEqual(GESTES_DE_LA_CUISINE.map(({ libelle }) => libelle), ["reprendre la cuisine", "arrêter la cuisine", "vérifier l'installation"]);
    for (const { id } of GESTES_DE_LA_CUISINE) assert.ok(GESTES.some((geste) => geste.id === id), `« ${id} » n'est pas un geste du socle`);
  });

  test("chacun écrit la commande de la doc mot pour mot dans un shell, et rien ne l'envoie", () => {
    const doc = readFileSync(join(RACINE, "docs/runtime.md"), "utf8");
    assert.ok(doc.includes("`brigade <projet> garde-fous [stop \\| reprendre]`"), "docs/runtime.md, « Piloter », ne cite plus garde-fous stop | reprendre");
    assert.ok(doc.includes("npm --prefix runtime run garde-fous -- stop"));
    assert.ok(doc.includes("npm --prefix runtime run garde-fous -- reprendre"));
    assert.ok(/^\| .*`brigade <projet> installation`/m.test(doc) || doc.includes("brigade <projet> installation"), "docs/runtime.md ne cite plus `brigade <projet> installation`");

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

      const shell = ecrireGeste(terminaux, id, PARADE);

      // Le second n'a rien reçu ; le shell a la commande seule, sans retour chariot ni saut de ligne.
      assert.deepEqual(ecrits, [[], [ATTENDUES[id]]], id);
      assert.ok(shell !== undefined && "note" in shell, id);
      assert.ok(shell.note.startsWith(`écrit dans ce shell, sans Entrée : \`${ATTENDUES[id]}\``), shell.note);
      for (const recus of ecrits) for (const ecrit of recus) assert.doesNotMatch(ecrit, /[\x00-\x1f\x7f]/);
    }
  });

  test("arrêter la cuisine n'ouvre aucune boîte de confirmation : ni la vue ni le process principal", () => {
    const vue = readFileSync(join(RACINE, "app/src/vue/vue.js"), "utf8");
    const principal = readFileSync(join(RACINE, "app/src/main.ts"), "utf8");
    const geste = principal.slice(principal.indexOf('ipcMain.handle("geste"'), principal.indexOf('ipcMain.on("regarder"'));

    assert.doesNotMatch(vue, /\b(confirm|alert|prompt)\s*\(/);
    assert.doesNotMatch(geste, /dialog\.|showMessageBox/);
    assert.doesNotMatch(readFileSync(join(RACINE, "app/src/cuisine.ts"), "utf8"), /^(?!\/\/).*(dialog|showMessageBox|\bconfirm\b|node:child_process)/m);
  });
});
