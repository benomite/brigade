// L'équipe lue par `facts` là où la cuisine du projet tourne (team-of-the-box.ts, ticket 4327) : les enregistrements tels
// quels, et rien d'inventé quand la lecture ne se fait pas.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import type { ExecFileException } from "node:child_process";
import type { Read, Rendered } from "../../src/box.ts";
import { readTheAgents } from "../../src/team-of-the-box.ts";

const READ: Read = { nom: "parade", cuisine: { locale: { node: "node", runtime: "/runtime", racine: "/station", env: {} } } };
const CLOSER = { agent: "closer", state: "idle", autonomy: "propose" };
const rendered = (output: string, error: Partial<ExecFileException> | null = null, errors = ""): Rendered => ({ lance: "$ node geste.ts parade facts", erreur: error as ExecFileException | null, sortie: output, erreurs: errors });
const read = async (answer: Rendered) => {
  const launched: string[] = [];
  const result = await readTheAgents(READ, async (readOne, command) => (launched.push(`${readOne.nom}: ${command}`), answer)).then((agents): { agents?: unknown[]; erreur?: string } => ({ agents }), (error: Error): { agents?: unknown[]; erreur?: string } => ({ erreur: error.message }));
  return { ...result, lancees: launched };
};

test("the agents are the `equipe` of `facts`, run on the project's kitchen", async () => {
  const { agents, lancees: launched } = await read(rendered(JSON.stringify({ etat: "ok", equipe: [CLOSER] })));
  assert.deepEqual([agents, launched], [[CLOSER], ["parade: facts"]]);
});

test("a project that does not cook on this computer reads nothing and runs nothing", async () => {
  const launched: string[] = [];
  assert.equal(await readTheAgents(undefined, async (_, command) => (launched.push(command), rendered("{}"))), undefined);
  assert.deepEqual(launched, []);
});

test("a failed command, an unreadable answer, or no team is a failed reading, never an empty team", async () => {
  assert.match((await read(rendered("", { code: 1 }, "boom"))).erreur ?? "", /`facts` failed on this computer's station: [^]*boom/);
  assert.match((await read(rendered("", { code: 66 }, "brigade: facts is not a runtime command"))).erreur ?? "", /does not serve the agents yet/);
  assert.match((await read(rendered("not json"))).erreur ?? "", /could not be read: not json/);
  assert.match((await read(rendered("null"))).erreur ?? "", /does not publish the agents yet/);
  assert.match((await read(rendered('{"etat":"ok"}'))).erreur ?? "", /does not publish the agents yet/);
  assert.match((await read(rendered(JSON.stringify({ equipe: { illisible: "levels file is broken" } })))).erreur ?? "", /cannot read the agents: levels file is broken/);
  assert.deepEqual((await read(rendered(JSON.stringify({ equipe: [] })))).agents, []);
});

test("the main process answers the bridge's `lireLesAgents`, and the preload exposes it", () => {
  assert.match(readFileSync(new URL("../../src/main.ts", import.meta.url), "utf8"), /ipcMain\.handle\("lireLesAgents", \(_, name: unknown\) => readTheAgents\(kitchenOfProject\(name\)\.lu, launchOnTheKitchen\)\)/);
  assert.match(readFileSync(new URL("../../src/preload.cjs", import.meta.url), "utf8"), /lireLesAgents: \(project\) => ipcRenderer\.invoke\("lireLesAgents", project\)/);
});
