// Ce que `claude auth status` dit de cet ordinateur (#4057), lu en connexion : seul un « non » net retient l'ouverture.
import assert from "node:assert/strict";
import { test } from "node:test";
import { claudeDe, connectionDeLaSession, ouvrirDUneStation } from "../src/first-launch.ts";

test("only a clear no from Claude Code reads as not logged in", () => {
  assert.equal(connectionDeLaSession("connectee"), "connectee");
  assert.equal(connectionDeLaSession("absente"), "perdue");
  assert.equal(connectionDeLaSession("inconnue"), "inconnue");
  assert.equal(connectionDeLaSession("introuvable"), "inconnue");
});

test("a reading that fails or says nothing holds nothing back: the project opens", async () => {
  for (const connectionClaude of [async () => "inconnue" as const, async (): Promise<never> => Promise.reject(new Error("auth status crashed"))]) {
    let copies = 0;
    const ouvrir = ouvrirDUneStation({
      ouvrirLaCopie: async () => (++copies, { state: "failed", project: "parade", repository: "benomite/parade", cause: "network", reason: "offline" }),
      lireLaBase: async () => "main",
      configuration: () => ({ projets: [] }),
      ajouter: () => undefined,
      progres: () => {},
      connexionClaude: connectionClaude,
    } as unknown as Parameters<typeof ouvrirDUneStation>[0]);
    await ouvrir("parade", "benomite/parade");
    assert.equal(copies, 1);
  }
});

test("logged in once, the next openings do not ask again; an unknown answer is asked again", async () => {
  for (const [dit, demandes] of [["connectee", 1], ["inconnue", 2]] as const) {
    let lues = 0;
    const ouvrir = ouvrirDUneStation({
      ouvrirLaCopie: async () => ({ state: "failed", project: "parade", repository: "benomite/parade", cause: "network", reason: "offline" }),
      lireLaBase: async () => "main",
      configuration: () => ({ projets: [] }),
      ajouter: () => undefined,
      progres: () => {},
      connexionClaude: async () => (++lues, dit),
    } as unknown as Parameters<typeof ouvrirDUneStation>[0]);
    await ouvrir("parade", "benomite/parade");
    await ouvrir("parade", "benomite/parade");
    assert.equal(lues, demandes, dit);
  }
});

test("the claude asked is the one BRIGADE_CLAUDE_BIN names, else the one on the PATH", () => {
  assert.equal(claudeDe({}), "claude");
  assert.equal(claudeDe({ BRIGADE_CLAUDE_BIN: "" }), "claude");
  assert.equal(claudeDe({ BRIGADE_CLAUDE_BIN: "/opt/claude-double" }), "/opt/claude-double");
});
