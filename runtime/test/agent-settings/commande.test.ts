// #4222 : la commande `agent-settings`, le passage par lequel l'app lit et change les réglages d'un agent.
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { principal } from "../../src/agent-settings/commande.ts";
import { Sortie } from "../../src/appel.ts";
import { poserDecision } from "../../src/decisions.ts";
import { ouvrirJournal } from "../../src/journal.ts";

async function jouer(args: string[], env: Record<string, string | undefined>) {
  const sortie: string[] = [];
  const erreur: string[] = [];
  let code = 0;
  try {
    await principal({ args, env, dire: (ligne) => sortie.push(ligne), redire: (ligne) => erreur.push(ligne) });
  } catch (e) {
    if (!(e instanceof Sortie)) throw e;
    code = e.code;
  }
  return { code, sortie, erreur };
}

test("reads an agent's settings, the chef's decisions in the log taking the place of the box's variables", async () => {
  const stateDir = mkdtempSync(join(tmpdir(), "agent-settings-"));
  const journal = ouvrirJournal(stateDir);
  poserDecision(journal, { projet: "brigade", nom: "BRIGADE_MANAGER_MODEL", valeur: "haiku", auteur: "chef" });
  journal.fermer();
  // The variable is ignored by the runtime: the log's decision is what it reads.
  const { code, sortie } = await jouer(["manager"], { BRIGADE_STATE_DIR: stateDir, BRIGADE_PROJECT: "brigade", BRIGADE_MANAGER_MODEL: "sonnet", BRIGADE_MANAGER_EFFORT: "low" });
  assert.equal(code, 0);
  assert.equal(sortie.length, 1);
  const { fields } = JSON.parse(sortie[0] ?? "") as { fields: Array<{ key: string; value: unknown; source: string }> };
  assert.deepEqual(fields.find((f) => f.key === "model"), { key: "model", label: "Model of its judgments", kind: "model", value: "haiku", source: "env", editable: true, changedAt: null, changedBy: null });
  assert.equal(fields.find((f) => f.key === "effort")?.source, "default");
});

test("changes a setting with its author, reads numbers as numbers, and refuses with exit code 1 and nothing written", async () => {
  const stateDir = mkdtempSync(join(tmpdir(), "agent-settings-"));
  const env = { BRIGADE_STATE_DIR: stateDir, BRIGADE_PROJECT: "brigade" };
  const set = await jouer(["closer", "set", "driftLostTokens", "2000", "--by", "alice"], env);
  assert.equal(set.code, 0);
  assert.deepEqual(JSON.parse(set.sortie[0] ?? ""), { key: "driftLostTokens", label: "Drift: lost tokens", kind: "integer", value: 2000, source: "app", editable: true, changedAt: JSON.parse(set.sortie[0] ?? "").changedAt, changedBy: "alice" });
  assert.equal((await jouer(["--by", "alice", "closer", "set", "autonomy", "act"], env)).code, 0);
  const pause = await jouer(["manager", "set", "pause", "true", "--by", "alice"], env);
  assert.equal(pause.code, 1);
  assert.match(JSON.parse(pause.sortie[0] ?? "").reason, /not editable from the app/);
  const refused = await jouer(["cook", "set", "places", "-1", "--by", "alice"], env);
  assert.equal(refused.code, 1);
  assert.match(JSON.parse(refused.sortie[0] ?? "").reason, /whole number of 0 or more, not -1/);
  const unknown = await jouer(["chef"], env);
  assert.equal(unknown.code, 1);
  const read = JSON.parse((await jouer(["closer"], env)).sortie[0] ?? "") as { fields: Array<{ key: string; value: unknown; changedBy: string | null }> };
  assert.deepEqual(read.fields.filter((f) => f.changedBy !== null).map((f) => [f.key, f.value]), [["autonomy", "act"], ["driftLostTokens", 2000]]);
});

test("a usage that cannot be read exits with code 2", async () => {
  const stateDir = mkdtempSync(join(tmpdir(), "agent-settings-"));
  for (const args of [[], ["manager", "set", "model", "opus"], ["manager", "--by", "alice"], ["manager", "set", "model"], ["manager", "unset", "model", "opus", "--by", "a"], ["manager", "set", "model", "opus", "x", "--by", "a"]]) {
    const { code, erreur } = await jouer(args, { BRIGADE_STATE_DIR: stateDir });
    assert.equal(code, 2, args.join(" "));
    assert.match(erreur.join("\n"), /usage: /);
  }
  const { code, erreur } = await jouer(["manager"], {});
  assert.equal(code, 2);
  assert.match(erreur.join("\n"), /BRIGADE_STATE_DIR is not set/);
});
