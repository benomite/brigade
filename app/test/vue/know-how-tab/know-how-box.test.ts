// Le savoir-faire du projet, côté process principal (#4241), par les gestes du pont que main.ts branche : la commande
// `know-how` lancée là où la cuisine du projet tourne, et chaque réponse du runtime lue — des entrées, `{ok: true}`, ou la
// ligne d'un refus. Un runtime sans la commande, une réponse illisible, un projet sans station ou parti ne passent jamais
// pour une lecture ou un changement réussi. Le geste `lancer` est une doublure : rien ne part.
import assert from "node:assert/strict";
import { test } from "node:test";
import type { Read, Rendered } from "../../../src/box.ts";
import { words } from "../../../src/box.ts";
import { plugTheKnowHow } from "../../../src/vue/know-how-tab/know-how-box.ts";

const READ = { nom: "parade" } as Read;
const LAUNCHES = "$ node geste.ts parade know-how";
const outputPar = (code: number) => Object.assign(new Error("exit"), { code, cmd: "know-how" });
const rendered = (output: string, error: Rendered["erreur"] = null, errors = ""): Rendered => ({ lance: LAUNCHES, erreur: error, sortie: output, erreurs: errors });
const ENTRIES = [
  { id: "L1", text: "Run the typecheck before pushing.", ticket: 4001 },
  { id: "L2", text: "Never kill a process by name.", ticket: 4002 },
];

// Les gestes branchés comme main.ts les branche : « parade » a une station (ou pas, `sansStation`), « gone » a quitté le fichier.
function actions(r: Rendered, { sansStation: withoutStation = false } = {}) {
  const commands: string[] = [];
  const listeners = new Map<string, (event: unknown, ...args: unknown[]) => unknown>();
  const kitchenOfProject = (name: unknown) => (name === "parade" ? { vise: { nom: "parade" }, lu: withoutStation ? undefined : READ } : { vise: undefined, lu: undefined });
  plugTheKnowHow({ handle: (channel, ecouter) => listeners.set(channel, ecouter) }, kitchenOfProject, async (_, command) => (commands.push(command), r));
  const listens = (channel: string) => listeners.get(channel) ?? assert.fail(`pas de geste ${channel}`);
  return {
    commandes: commands,
    lire: async (project = "parade") => await listens("lireLeSavoirFaire")(null, project),
    modifier: async (id: unknown, text: unknown, project = "parade") => await listens("modifierLeSavoirFaire")(null, project, id, text),
    retirer: async (id: unknown, project = "parade") => await listens("retirerDuSavoirFaire")(null, project, id),
  };
}

test("read: `know-how` gives the entries of its last line, each with its ticket", async () => {
  const { commandes: commands, lire: read } = actions(rendered(`starting\n${JSON.stringify({ entries: ENTRIES })}\n`));
  assert.deepEqual(await read(), { entries: ENTRIES });
  assert.deepEqual(commands, ["know-how"]);
  assert.deepEqual(await actions(rendered('{"entries":[]}')).lire(), { entries: [] });
});

test("read: one entry that does not read makes the whole reading unavailable, never a part of it shown as all", async () => {
  const detail = (output: string) => `${LAUNCHES}\n${output}`.trim();
  for (const entry of [null, { id: "X1", text: "a", ticket: 1 }, { id: "L1", text: 3, ticket: 1 }, { id: "L1", text: "a", ticket: "1" }, { id: "L1", text: "a", ticket: 0 }, { id: "L1", text: "a", ticket: 1.5 }]) {
    const output = JSON.stringify({ entries: [ENTRIES[0], entry] });
    assert.deepEqual(await actions(rendered(output)).lire(), { refus: "know-how unavailable", detail: detail(output) }, JSON.stringify(entry));
  }
  for (const output of ["", "not json", '{"entries":{}}', "[]"]) assert.deepEqual(await actions(rendered(output)).lire(), { refus: "know-how unavailable", detail: detail(output) }, output);
  // Une sortie lisible, mais d'une commande en échec : elle ne se croit pas.
  assert.deepEqual(await actions(rendered('{"entries":[]}', outputPar(1))).lire(), { refus: "know-how unavailable", detail: `${LAUNCHES}\n{"entries":[]}` });
});

test("a runtime without the command, a project without a station or gone: said, never an empty know-how", async () => {
  const without = rendered("", outputPar(66), "« know-how » n'est pas une commande du runtime");
  assert.deepEqual(await actions(without).lire(), { refus: "know-how unavailable: this station's runtime does not give it yet — update it", detail: `${LAUNCHES}\n« know-how » n'est pas une commande du runtime` });
  assert.deepEqual(await actions(without).retirer("L1"), { refus: "nothing was changed: this station's runtime does not know the know-how yet — update it", detail: `${LAUNCHES}\n« know-how » n'est pas une commande du runtime` });
  const withoutStation = actions(rendered('{"ok":true}'), { sansStation: true });
  assert.deepEqual(await withoutStation.lire(), { refus: "know-how unavailable: “parade” has no station — it is read where its kitchen runs" });
  assert.deepEqual(await withoutStation.modifier("L1", "a"), { refus: "nothing was sent: “parade” has no station — there is no runtime to change it" });
  assert.deepEqual(withoutStation.commandes, []);
  const gone = actions(rendered('{"ok":true}'));
  assert.deepEqual(await gone.lire("gone"), { refus: "“gone” is no longer in the projects file" });
  assert.deepEqual(await gone.modifier("L1", "a", "gone"), { refus: "“gone” is no longer in the projects file" });
  assert.deepEqual(await gone.retirer("L1", "gone"), { refus: "“gone” is no longer in the projects file" });
  assert.deepEqual(gone.commandes, []);
});

test("edit and remove: the command names the entry, the text stays one word whatever it holds, and {ok: true} is done", async () => {
  const { commandes: commands, modifier: edit, retirer: remove } = actions(rendered('{"ok":true,"entry":{"id":"L2","text":"x","ticket":4002}}\n'));
  const text = "Never kill by name; use the 'pid' — \"always\"";
  assert.deepEqual(await edit("L2", text), { ok: true });
  assert.deepEqual(await remove("L12"), { ok: true });
  assert.deepEqual(commands.map(words), [["know-how", "edit", "L2", text], ["know-how", "remove", "L12"]]);
});

test("nothing is launched for what is not an entry's id, or an empty text", async () => {
  const { commandes: commands, modifier: edit, retirer: remove } = actions(rendered('{"ok":true}'));
  for (const id of [undefined, 3, "", "L0", "l1", "L1; rm -rf /", "L1 L2"]) {
    assert.deepEqual(await edit(id, "a"), { refus: "nothing was sent: this is not an entry of the know-how" }, String(id));
    assert.deepEqual(await remove(id), { refus: "nothing was sent: this is not an entry of the know-how" }, String(id));
  }
  for (const text of [undefined, 3, "", "  \n "]) assert.deepEqual(await edit("L1", text), { refus: "nothing was sent: an entry cannot be empty" }, String(text));
  assert.deepEqual(commands, []);
});

test("a refusal gives its line, the output in the detail; an unreadable answer never reads as done", async () => {
  const output = '{"ok":false,"message":"“L9” is not an entry of the project\'s know-how\\nsecond line"}\n';
  assert.deepEqual(await actions(rendered(output, outputPar(1))).modifier("L9", "a"), { refus: "“L9” is not an entry of the project's know-how", detail: `${LAUNCHES}\n${output}`.trim() });
  for (const other of ["", "not json", '{"ok":false}', '{"ok":false,"message":""}', '{"ok":"yes"}', "[true]"]) {
    assert.deepEqual(await actions(rendered(other)).retirer("L1"), { refus: "nothing was changed: the runtime's answer could not be read", detail: `${LAUNCHES}\n${other}`.trim() }, other);
  }
});
