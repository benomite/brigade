// Un faux `claude -p` pour le triage du départ d'un projet (#3268) : il lit sur son entrée standard la consigne du second et
// les issues (la dernière ligne, du JSON), et répond une priorité et une raison par issue — rien d'autre.
import { readFileSync } from "node:fs";

const entree = readFileSync(0, "utf8");
const issues: { number: number }[] = JSON.parse(entree.trim().split("\n").at(-1) ?? "[]");
const reponse = issues.map(({ number }, rang) => ({ number, prio: (rang % 3) + 1, reason: `reason for #${number}` }));
process.stdout.write(`Here is my triage:\n${JSON.stringify(reponse)}\n`);
