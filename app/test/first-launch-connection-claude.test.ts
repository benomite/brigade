// Ce que `claude auth status` dit de cet ordinateur (#4057), lu en connexion : seul un « non » net retient l'ouverture.
import assert from "node:assert/strict";
import { test } from "node:test";
import { claudeOf, connectionOfTheSession, openOfAStation } from "../src/first-launch.ts";

test("only a clear no from Claude Code reads as not logged in", () => {
  assert.equal(connectionOfTheSession("connectee"), "connectee");
  assert.equal(connectionOfTheSession("absente"), "perdue");
  assert.equal(connectionOfTheSession("inconnue"), "inconnue");
  assert.equal(connectionOfTheSession("introuvable"), "inconnue");
});

test("a reading that fails or says nothing holds nothing back: the project opens", async () => {
  for (const connectionClaude of [async () => "inconnue" as const, async (): Promise<never> => Promise.reject(new Error("auth status crashed"))]) {
    let copies = 0;
    const open = openOfAStation({
      ouvrirLaCopie: async () => (++copies, { state: "failed", project: "parade", repository: "benomite/parade", cause: "network", reason: "offline" }),
      lireLaBase: async () => "main",
      configuration: () => ({ projets: [] }),
      ajouter: () => undefined,
      progres: () => {},
      connexionClaude: connectionClaude,
    } as unknown as Parameters<typeof openOfAStation>[0]);
    await open("parade", "benomite/parade");
    assert.equal(copies, 1);
  }
});

test("logged in once, the next openings do not ask again; an unknown answer is asked again", async () => {
  for (const [said, requests] of [["connectee", 1], ["inconnue", 2]] as const) {
    let readEntries = 0;
    const open = openOfAStation({
      ouvrirLaCopie: async () => ({ state: "failed", project: "parade", repository: "benomite/parade", cause: "network", reason: "offline" }),
      lireLaBase: async () => "main",
      configuration: () => ({ projets: [] }),
      ajouter: () => undefined,
      progres: () => {},
      connexionClaude: async () => (++readEntries, said),
    } as unknown as Parameters<typeof openOfAStation>[0]);
    await open("parade", "benomite/parade");
    await open("parade", "benomite/parade");
    assert.equal(readEntries, requests, said);
  }
});

test("the claude asked is the one BRIGADE_CLAUDE_BIN names, else the one on the PATH", () => {
  assert.equal(claudeOf({}), "claude");
  assert.equal(claudeOf({ BRIGADE_CLAUDE_BIN: "" }), "claude");
  assert.equal(claudeOf({ BRIGADE_CLAUDE_BIN: "/opt/claude-double" }), "/opt/claude-double");
});
