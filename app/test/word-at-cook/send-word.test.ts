// Le mot au cook, côté process principal (#4048), par le geste du pont `envoyerUnMot` que main.ts branche : la commande
// `send-word` écrite avec `{ticket, text}`, et chaque réponse du runtime lue en `{ok: true}` ou `{ok: false, reason}` d'une
// ligne — un runtime sans la commande, une réponse illisible, un projet sans station ou parti ne passent jamais pour un
// envoi réussi. Le geste `lancer` est une doublure : rien ne part.
import assert from "node:assert/strict";
import { test } from "node:test";
import type { Read, Rendered } from "../../src/box.ts";
import { words } from "../../src/box.ts";
import { plugTheWordAtCook } from "../../src/vue/word-at-cook/word-at-cook-box.ts";

const READ = { nom: "parade" } as Read;
const outputPar = (code: number) => Object.assign(new Error("exit"), { code, cmd: "send-word" });
const rendered = (output: string, error: Rendered["erreur"] = null, errors = ""): Rendered => ({ lance: "$ node geste.ts parade send-word", erreur: error, sortie: output, erreurs: errors });

// Le geste branché comme main.ts le branche : « parade » a une station (ou pas, `sansStation`), « gone » a quitté le fichier.
function action(r: Rendered, { sansStation: withoutStation = false } = {}) {
  const commands: string[] = [];
  const listeners = new Map<string, (event: unknown, ...args: unknown[]) => unknown>();
  const kitchenOfProject = (name: unknown) => (name === "parade" ? { vise: { nom: "parade" }, lu: withoutStation ? undefined : READ } : { vise: undefined, lu: undefined });
  plugTheWordAtCook({ handle: (channel, ecouter) => listeners.set(channel, ecouter) }, kitchenOfProject, async (_, command) => (commands.push(command), r));
  const listens = listeners.get("envoyerUnMot") ?? assert.fail("pas de geste envoyerUnMot");
  return { commandes: commands, envoyer: async (entry: unknown, project = "parade") => (await listens(null, project, entry)) as { ok: boolean; reason?: string; detail?: string } };
}

test("{ok: true} on the last line is a word sent, by send-word with {ticket, text} as one JSON word", async () => {
  const { commandes: commands, envoyer: send } = action(rendered('starting\n{"ok":true}\n'));
  const text = "use 'the' \"short\" query ";
  assert.deepEqual(await send({ ticket: 14, text }), { ok: true });
  assert.equal(commands.length, 1);
  assert.deepEqual(words(commands[0] ?? ""), ["send-word", JSON.stringify({ ticket: 14, text })]);
});

test("nothing is launched for what is not a ticket or not a word", async () => {
  const { commandes: commands, envoyer: send } = action(rendered('{"ok":true}'));
  for (const entry of [null, "14", [14], { ticket: "14", text: "a" }, { ticket: 1.5, text: "a" }, { ticket: 0, text: "a" }, { ticket: -3, text: "a" }]) {
    assert.deepEqual(await send(entry), { ok: false, reason: "nothing was sent: this is not a ticket" }, JSON.stringify(entry));
  }
  for (const text of [undefined, 3, "", "   "]) assert.deepEqual(await send({ ticket: 14, text }), { ok: false, reason: "nothing was sent: the word is empty" });
  assert.deepEqual(commands, []);
  assert.deepEqual(await send({ ticket: 1, text: "a" }), { ok: true });
});

test("{ok: false, reason} gives its reason on one line, the output in the detail", async () => {
  const output = '{"ok":false,"reason":"no cook holds `#14`\\nsecond line"}\n';
  const { envoyer: send } = action(rendered(output, outputPar(1)));
  assert.deepEqual(await send({ ticket: 14, text: "hi" }), { ok: false, reason: "no cook holds #14", detail: `$ node geste.ts parade send-word\n${output}`.trim() });
});

test("an unreadable answer, or a refusal without a reason, never reads as sent", async () => {
  for (const output of ["", "not json", '{"ok":false}', '{"ok":false,"reason":"  "}', '{"ok":"yes"}', "[true]", "null"]) {
    const readEntry = await action(rendered(output)).envoyer({ ticket: 14, text: "hi" });
    assert.equal(readEntry.ok, false, output);
    assert.equal(readEntry.reason, "the runtime's answer could not be read: the word may not have reached the cook", output);
  }
});

test("a runtime without the command is never a word sent, and says to update it", async () => {
  const readEntry = await action(rendered("", outputPar(66), "send-word is not a runtime command")).envoyer({ ticket: 14, text: "hi" });
  assert.deepEqual(readEntry, {
    ok: false,
    reason: "nothing was sent: this station's runtime cannot pass a word to a cook yet — update it",
    detail: "$ node geste.ts parade send-word\nsend-word is not a runtime command",
  });
});

test("a project with no station, or one that left the projects file, launches nothing", async () => {
  const without = action(rendered('{"ok":true}'), { sansStation: true });
  assert.deepEqual(await without.envoyer({ ticket: 14, text: "hi" }), { ok: false, reason: "nothing was sent: “parade” has no station — there is no runtime to pass it on" });
  const gone = action(rendered('{"ok":true}'));
  assert.deepEqual(await gone.envoyer({ ticket: 14, text: "hi" }, "gone"), { ok: false, reason: "nothing was sent: “gone” is no longer in the projects file" });
  assert.deepEqual([...without.commandes, ...gone.commandes], []);
});
