// #4001, critère 1 : le test « dispatched concurrently up to the same places limit »
// n'attend ni un délai fixe ni le temps réel : il attend un fait (événement,
// promesse ou fausse horloge).
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const FICHIER = new URL("../tests-acceptation/ecritures-en-parallele.test.ts", import.meta.url);

test("the places-limit dispatch test contains no fixed delay and no real-time wait", () => {
  // Les commentaires ne comptent pas : seul le code attend.
  const code = readFileSync(FICHIER, "utf8")
    .split("\n")
    .filter((ligne) => !ligne.trim().startsWith("//"))
    .join("\n");
  const attentes = [/\bjusqua\b/, /\bsetTimeout\b/, /\bsetInterval\b/, /\bsetImmediate\b/, /\bDate\.now\b/, /\bperformance\.now\b/, /timers\/promises/, /\bsleep\b/i, /\bdelai/i, /\bhrtime\b/];
  for (const attente of attentes) assert.doesNotMatch(code, attente, `the test must wait on a fact, not on time (${attente})`);
});
