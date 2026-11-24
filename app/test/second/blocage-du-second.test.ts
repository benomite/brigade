// #4121 : à « pourquoi on est bloqués ? », le crochet du second rend la vue du projet déposée par l'app ; rien sans vue
// lisible, ni pour un autre message.
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { crochetsDuRole } from "../../src/second/crochet-du-role.ts";
import { blocage, vueDe } from "../../src/second/blocage-du-second.ts";

const VUE = {
  banners: [{ label: "STOPPED", waitsFor: "a restart", waitsOn: "the chef" }, { label: "FAULT #221", waitsFor: "a fix", waitsOn: "the cook" }],
  rail: [{ number: 221, title: "Espace card", displayed: "queued - ready, waits for a place in the kitchen", real: "cannot start", waitsOn: "the chef" }],
  offRail: [{ number: 1078, title: "Off the rail" }],
};

function avecVue(corps: string | undefined, essai: (vues: string) => void) {
  const vues = mkdtempSync(join(tmpdir(), "vue-4121-"));
  try {
    mkdirSync(vues, { recursive: true });
    if (corps !== undefined) writeFileSync(vueDe(vues, "espace"), corps);
    essai(vues);
  } finally {
    rmSync(vues, { recursive: true, force: true });
  }
}

test("la question de blocage reçoit la vue du projet, bandeaux et carte #221 avant #1078", () => {
  avecVue(JSON.stringify(VUE), (vues) => {
    const sortie = JSON.parse(blocage({ prompt: "pourquoi on est bloqués ?" }, { nom: "espace" }, vues)) as { hookSpecificOutput: { additionalContext: string } };
    const contexte = sortie.hookSpecificOutput.additionalContext;
    assert.ok(contexte.includes("STOPPED") && contexte.includes("FAULT #221") && contexte.includes("#221 Espace card"));
    assert.ok(contexte.indexOf("#221") < contexte.indexOf("#1078"));
  });
});

test("rien pour un autre message, sans vue déposée, ou avec une vue illisible", () => {
  avecVue(JSON.stringify(VUE), (vues) => assert.equal(blocage({ prompt: "bonjour" }, { nom: "espace" }, vues), ""));
  avecVue(undefined, (vues) => assert.equal(blocage({ prompt: "pourquoi on est bloqués ?" }, { nom: "espace" }, vues), ""));
  avecVue("pas du json", (vues) => assert.equal(blocage({ prompt: "pourquoi on est bloqués ?" }, { nom: "espace" }, vues), ""));
  avecVue("{}", (vues) => assert.equal(blocage({ prompt: "pourquoi on est bloqués ?" }, { nom: "espace" }, vues), ""));
});

test("le crochet de la vue est déclaré à UserPromptSubmit", () => {
  const commandes = (crochetsDuRole({ node: "node", gh: "gh", cible: { nom: "espace" } }).UserPromptSubmit ?? []).flatMap((c) => c.hooks.map((h) => h.command));
  assert.ok(commandes.some((c) => /role-apres-init\.ts' 'vue' 'espace'/.test(c)));
});
