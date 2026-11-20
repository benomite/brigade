// #3893, critère 4 : quand la réponse du manager ne se lit pas comme du JSON, le journal garde la réponse brute
// (tronquée à une longueur maximale dite), l'erreur de lecture et le numéro du ticket.
import assert from "node:assert/strict";
import { test } from "node:test";
import { ecrireLesTests, type OutilsDeLEcriture } from "../../src/tests-acceptation/ecriture.ts";

const TICKET = 3893;
const CORPS = "## Acceptance criteria\n\n- The first thing\n- The second thing\n";

test("an unparsable manager answer is logged with its raw text truncated, the parse error and the ticket number", async (t) => {
  const lignes: string[] = [];
  const capter = (...args: unknown[]) => void lignes.push(args.map(String).join(" "));
  t.mock.method(console, "error", capter);
  t.mock.method(console, "warn", capter);
  t.mock.method(console, "log", capter);
  t.mock.method(process.stderr, "write", (texte: unknown) => (lignes.push(String(texte)), true));
  const debut = "{ 'tests': ['a.test.ts', 'b.test.ts'] } DEBUT-BRUT ";
  const brute = debut + "x".repeat(20000) + " FIN-BRUTE";
  const outils: OutilsDeLEcriture = {
    issue: async () => ({ title: "t", body: CORPS }),
    commenter: async () => {},
    labelliser: async () => {},
    preparer: async () => ({ worktree: "/tmp/inexistant", branche: "cook/3893-github" }),
    manager: async () => ({ message: brute }),
    git: async () => ({ code: 0, stdout: "", stderr: "" }),
    pousser: () => {},
    retirer: () => {},
    base: "main",
    depot: "acme/brigade",
  };

  await ecrireLesTests(TICKET, outils);

  const journal = lignes.join("\n");
  assert.match(journal, /DEBUT-BRUT/, "the raw answer is not logged");
  assert.doesNotMatch(journal, /FIN-BRUTE/, "the raw answer is not truncated");
  assert.match(journal, /Expected property name or '\}'/, "the parse error is not logged");
  assert.match(journal, /3893/, "the ticket number is not logged");
  assert.ok(journal.length < 5000, "the logged raw answer has no stated maximum length");
});
