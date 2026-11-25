// #4220, critère 3 : le test qui échoue quand le runtime lance un agent absent du registre.
// Les agents que le runtime nomme, lus à leur source : les rôles de la cuisine, ceux qui tournent hors ticket,
// ceux de l équipe (autonomie) et le second.
// Contrat supposé par les tests d acceptation de #4220 (le cook le réalise, sans le changer) :
//   runtime/src/agents-tab/registre.ts  exporte REGISTRE : { id, name, role }[]
//   runtime/src/agents-tab/api.ts       exporte repondre({ method, url }, sources) -> { statut, corps }
//   sources (tous les champs sont facultatifs sauf maintenant) : { maintenant: Date, repertoireDesGestes?: string,
//     enCours?: { id, ticket: number | null }[], enEchec?: string[] /* id dont le dernier run a échoué sans reprise */ }
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { REGISTRE } from "../../src/agents-tab/registre.ts";

const SRC = join(import.meta.dirname, "../../src");
const lire = (f: string) => readFileSync(join(SRC, f), "utf8");
const normaliser = (s: string) => s.toLowerCase().replace(/[\s_]+/g, "-");

const demarres = new Set<string>(["second", "manager", "cook", "pass", "reviewer", "closer", "supervisor"]);
for (const [, role] of lire("roles-cuisine/roles.ts").matchAll(/^\s+role: "([^"]+)"/gm)) demarres.add(normaliser(role as string));
const enCours = /export type RoleEnCours = ([^;]+);/.exec(lire("agents-en-cours.ts"))?.[1] ?? "";
for (const [, role] of enCours.matchAll(/"([a-z ]+)"/g)) demarres.add(normaliser(role as string));
const equipe = /const AGENTS = \[([^\]]+)\]/.exec(lire("autonomie/agents/agents.ts"))?.[1] ?? "";
for (const [, role] of equipe.matchAll(/"([a-z ]+)"/g)) demarres.add(normaliser(role as string));

test("every agent the runtime starts is in the registry", () => {
  const ids = new Set(REGISTRE.map((a) => normaliser(a.id)));
  assert.ok(demarres.size >= 7);
  const absents = [...demarres].filter((agent) => !ids.has(agent));
  assert.deepEqual(absents, [], "agents started by the runtime but missing from runtime/src/agents-tab/registre.ts");
});

test("each registry entry has an id, a name and a one-sentence role", () => {
  for (const a of REGISTRE) {
    assert.ok(a.id.trim() !== "" && a.name.trim() !== "" && a.role.trim() !== "");
  }
  assert.equal(new Set(REGISTRE.map((a) => a.id)).size, REGISTRE.length);
});
