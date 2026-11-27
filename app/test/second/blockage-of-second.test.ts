// #4121 : à « pourquoi on est bloqués ? », le crochet du second rend la vue du projet déposée par l'app ; rien sans vue
// lisible, ni pour un autre message.
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { test } from "node:test";
import { hooksOfBlockage } from "../../src/second/hook-of-blockage.ts";
import { blockage } from "../../src/second/blockage-of-second.ts";

const VUE = {
  banners: [{ label: "STOPPED", waitsFor: "a restart", waitsOn: "the chef" }, { label: "FAULT #221", waitsFor: "a fix", waitsOn: "the cook" }],
  rail: [{ number: 221, title: "Espace card", displayed: "queued - ready, waits for a place in the kitchen", real: "cannot start", waitsOn: "the chef" }],
  offRail: [{ number: 1078, title: "Off the rail" }],
};

function withVue(body: string | undefined, trial: (views: string) => void) {
  const views = mkdtempSync(join(tmpdir(), "vue-4121-"));
  try {
    mkdirSync(views, { recursive: true });
    if (body !== undefined) writeFileSync(join(views, "espace.json"), body);
    trial(views);
  } finally {
    rmSync(views, { recursive: true, force: true });
  }
}

test("la question de blocage reçoit la vue du projet, bandeaux et carte #221 avant #1078", () => {
  withVue(JSON.stringify(VUE), (views) => {
    const output = JSON.parse(blockage({ prompt: "pourquoi on est bloqués ?" }, { nom: "espace" }, views)) as { hookSpecificOutput: { additionalContext: string } };
    const context = output.hookSpecificOutput.additionalContext;
    assert.ok(context.includes("STOPPED") && context.includes("FAULT #221") && context.includes("#221 Espace card"));
    assert.ok(context.indexOf("#221") < context.indexOf("#1078"));
  });
});

test("rien pour un autre message, sans vue déposée, ou avec une vue illisible", () => {
  withVue(JSON.stringify(VUE), (views) => assert.equal(blockage({ prompt: "bonjour" }, { nom: "espace" }, views), ""));
  withVue(undefined, (views) => assert.equal(blockage({ prompt: "pourquoi on est bloqués ?" }, { nom: "espace" }, views), ""));
  withVue("pas du json", (views) => assert.equal(blockage({ prompt: "pourquoi on est bloqués ?" }, { nom: "espace" }, views), ""));
  withVue(JSON.stringify({ banners: [] }), (views) => assert.equal(blockage({ prompt: "pourquoi on est bloqués ?" }, { nom: "espace" }, views), ""));
  withVue(JSON.stringify({ rail: [] }), (views) => assert.equal(blockage({ prompt: "pourquoi on est bloqués ?" }, { nom: "espace" }, views), ""));
  withVue("{}", (views) => assert.equal(blockage({ prompt: "pourquoi on est bloqués ?" }, { nom: "espace" }, views), ""));
});

test("le crochet de la vue est déclaré à UserPromptSubmit", () => {
  const hooks = hooksOfBlockage({ node: "node", cible: { nom: "espace" }, separateur: "/" });
  assert.deepEqual(Object.keys(hooks), ["UserPromptSubmit"]);
  const commands = (hooks.UserPromptSubmit ?? []).flatMap((c) => c.hooks.map((h) => h.command));
  assert.equal(commands.length, 1);
  assert.match(commands[0] ?? "", /blockage-of-second\.ts' 'espace'$/);
});

test("le crochet lancé écrit la vue du projet à une question de blocage, et rien à un autre message", () => {
  const tmp = mkdtempSync(join(tmpdir(), "vue-4121-main-"));
  try {
    mkdirSync(join(tmp, "brigade-second-vue"));
    writeFileSync(join(tmp, "brigade-second-vue", "espace.json"), JSON.stringify(VUE));
    const launches = (prompt: string) =>
      spawnSync(process.execPath, ["src/second/blockage-of-second.ts", "espace"], { input: JSON.stringify({ prompt }), env: { ...process.env, TMPDIR: tmp, TEMP: tmp, TMP: tmp }, encoding: "utf8" }).stdout;
    assert.match(launches("pourquoi on est bloqués ?"), /FAULT #221/);
    assert.equal(launches("bonjour"), "");
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});
