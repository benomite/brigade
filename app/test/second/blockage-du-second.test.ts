// #4121 : à « pourquoi on est bloqués ? », le crochet du second rend la vue du projet déposée par l'app ; rien sans vue
// lisible, ni pour un autre message.
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { test } from "node:test";
import { crochetsDuRole } from "../../src/second/hook-du-role.ts";
import { blockage } from "../../src/second/blockage-du-second.ts";

const VUE = {
  banners: [{ label: "STOPPED", waitsFor: "a restart", waitsOn: "the chef" }, { label: "FAULT #221", waitsFor: "a fix", waitsOn: "the cook" }],
  rail: [{ number: 221, title: "Espace card", displayed: "queued - ready, waits for a place in the kitchen", real: "cannot start", waitsOn: "the chef" }],
  offRail: [{ number: 1078, title: "Off the rail" }],
};

function avecVue(corps: string | undefined, trial: (vues: string) => void) {
  const vues = mkdtempSync(join(tmpdir(), "vue-4121-"));
  try {
    mkdirSync(vues, { recursive: true });
    if (corps !== undefined) writeFileSync(join(vues, "espace.json"), corps);
    trial(vues);
  } finally {
    rmSync(vues, { recursive: true, force: true });
  }
}

test("la question de blocage reçoit la vue du projet, bandeaux et carte #221 avant #1078", () => {
  avecVue(JSON.stringify(VUE), (vues) => {
    const sortie = JSON.parse(blockage({ prompt: "pourquoi on est bloqués ?" }, { nom: "espace" }, vues)) as { hookSpecificOutput: { additionalContext: string } };
    const context = sortie.hookSpecificOutput.additionalContext;
    assert.ok(context.includes("STOPPED") && context.includes("FAULT #221") && context.includes("#221 Espace card"));
    assert.ok(context.indexOf("#221") < context.indexOf("#1078"));
  });
});

test("rien pour un autre message, sans vue déposée, ou avec une vue illisible", () => {
  avecVue(JSON.stringify(VUE), (vues) => assert.equal(blockage({ prompt: "bonjour" }, { nom: "espace" }, vues), ""));
  avecVue(undefined, (vues) => assert.equal(blockage({ prompt: "pourquoi on est bloqués ?" }, { nom: "espace" }, vues), ""));
  avecVue("pas du json", (vues) => assert.equal(blockage({ prompt: "pourquoi on est bloqués ?" }, { nom: "espace" }, vues), ""));
  avecVue(JSON.stringify({ banners: [] }), (vues) => assert.equal(blockage({ prompt: "pourquoi on est bloqués ?" }, { nom: "espace" }, vues), ""));
  avecVue(JSON.stringify({ rail: [] }), (vues) => assert.equal(blockage({ prompt: "pourquoi on est bloqués ?" }, { nom: "espace" }, vues), ""));
  avecVue("{}", (vues) => assert.equal(blockage({ prompt: "pourquoi on est bloqués ?" }, { nom: "espace" }, vues), ""));
});

test("le crochet de la vue est déclaré à UserPromptSubmit", () => {
  const commands = (crochetsDuRole({ node: "node", gh: "gh", cible: { nom: "espace" } }).UserPromptSubmit ?? []).flatMap((c) => c.hooks.map((h) => h.command));
  assert.ok(commands.some((c) => /role-apres-init\.ts' 'vue' 'espace'/.test(c)));
});

test("le crochet lancé au moment `vue` écrit la vue du projet, et rien au moment `debut`", () => {
  const tmp = mkdtempSync(join(tmpdir(), "vue-4121-main-"));
  try {
    mkdirSync(join(tmp, "brigade-second-vue"));
    writeFileSync(join(tmp, "brigade-second-vue", "espace.json"), JSON.stringify(VUE));
    const lance = (moment: string) =>
      spawnSync(process.execPath, ["src/second/role-apres-init.ts", moment, "espace"], { input: JSON.stringify({ prompt: "pourquoi on est bloqués ?" }), env: { ...process.env, TMPDIR: tmp, TEMP: tmp, TMP: tmp }, encoding: "utf8" }).stdout;
    assert.match(lance("vue"), /FAULT #221/);
    assert.equal(lance("debut"), "");
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});
