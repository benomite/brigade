// L'équipe lue par `facts` là où la cuisine du projet tourne (team-de-la-box.ts, ticket 4327) : les enregistrements tels
// quels, et rien d'inventé quand la lecture ne se fait pas.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import type { ExecFileException } from "node:child_process";
import type { Lu, Rendu } from "../../src/box.ts";
import { lireLesAgents } from "../../src/team-de-la-box.ts";

const LU: Lu = { nom: "parade", cuisine: { locale: { node: "node", runtime: "/runtime", racine: "/station", env: {} } } };
const CLOSER = { agent: "closer", state: "idle", autonomy: "propose" };
const rendu = (sortie: string, error: Partial<ExecFileException> | null = null, erreurs = ""): Rendu => ({ lance: "$ node geste.ts parade facts", erreur: error as ExecFileException | null, sortie, erreurs });
const lire = async (answer: Rendu) => {
  const lancees: string[] = [];
  const resultat = await lireLesAgents(LU, async (lu, command) => (lancees.push(`${lu.nom}: ${command}`), answer)).then((agents): { agents?: unknown[]; erreur?: string } => ({ agents }), (error: Error): { agents?: unknown[]; erreur?: string } => ({ erreur: error.message }));
  return { ...resultat, lancees };
};

test("the agents are the `equipe` of `facts`, run on the project's kitchen", async () => {
  const { agents, lancees } = await lire(rendu(JSON.stringify({ etat: "ok", equipe: [CLOSER] })));
  assert.deepEqual([agents, lancees], [[CLOSER], ["parade: facts"]]);
});

test("a project that does not cook on this computer reads nothing and runs nothing", async () => {
  const lancees: string[] = [];
  assert.equal(await lireLesAgents(undefined, async (_, command) => (lancees.push(command), rendu("{}"))), undefined);
  assert.deepEqual(lancees, []);
});

test("a failed command, an unreadable answer, or no team is a failed reading, never an empty team", async () => {
  assert.match((await lire(rendu("", { code: 1 }, "boom"))).erreur ?? "", /`facts` failed on this computer's station: [^]*boom/);
  assert.match((await lire(rendu("", { code: 66 }, "brigade: facts is not a runtime command"))).erreur ?? "", /does not serve the agents yet/);
  assert.match((await lire(rendu("not json"))).erreur ?? "", /could not be read: not json/);
  assert.match((await lire(rendu("null"))).erreur ?? "", /does not publish the agents yet/);
  assert.match((await lire(rendu('{"etat":"ok"}'))).erreur ?? "", /does not publish the agents yet/);
  assert.match((await lire(rendu(JSON.stringify({ equipe: { illisible: "levels file is broken" } })))).erreur ?? "", /cannot read the agents: levels file is broken/);
  assert.deepEqual((await lire(rendu(JSON.stringify({ equipe: [] })))).agents, []);
});

test("the main process answers the bridge's `lireLesAgents`, and the preload exposes it", () => {
  assert.match(readFileSync(new URL("../../src/main.ts", import.meta.url), "utf8"), /ipcMain\.handle\("lireLesAgents", \(_, nom: unknown\) => lireLesAgents\(cuisineDuProjet\(nom\)\.lu, lancerSurLaCuisine\)\)/);
  assert.match(readFileSync(new URL("../../src/preload.cjs", import.meta.url), "utf8"), /lireLesAgents: \(projet\) => ipcRenderer\.invoke\("lireLesAgents", projet\)/);
});
