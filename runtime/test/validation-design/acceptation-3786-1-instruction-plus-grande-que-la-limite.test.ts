// #3786 : la revue de design se lance avec une consigne plus grande que la limite d'arguments de l'OS, sans spawn E2BIG.
import assert from "node:assert/strict";
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { argumentsReviewer } from "../../src/reviewer.ts";
import { superviser } from "../../src/superviseur.ts";
import { ENV_ENFANT, repertoireTemporaire } from "../outils.ts";

// Un faux `claude` : note ses arguments et tout ce qu'il lit sur son entrée.
const SCRIPT = `
const { readFileSync, writeFileSync } = require("node:fs");
writeFileSync(process.env.TEMOIN, JSON.stringify({ argv: process.argv.slice(2), entree: readFileSync(0, "utf8") }));
`;

test("the design review launches with an instruction of 300 KiB, above the OS argument limit, without spawn E2BIG", async (t) => {
  const consigne = "é".repeat(150 * 1024) + "\nfin";
  assert.ok(Buffer.byteLength(consigne) > 300 * 1024);
  const repertoire = repertoireTemporaire(t);
  const script = join(repertoire, "faux.cjs");
  const temoin = join(repertoire, "temoin.json");
  writeFileSync(script, SCRIPT);
  const calibrage = { model: "sonnet", effort: "low" };
  // Le lancement du reviewer, dans la forme que le code a : avec la consigne en argument, ou sans.
  const construire = argumentsReviewer as unknown as (...a: unknown[]) => string[];
  const args = argumentsReviewer.length >= 2 ? construire(consigne, calibrage) : construire(calibrage);
  const supervise = superviser({
    commande: process.execPath,
    args: [script, ...args],
    entree: consigne,
    env: { ...ENV_ENFANT, TEMOIN: temoin },
    plafonds: { durationMs: 60_000, tokens: 1_000_000, idleMs: 60_000 },
    graceMs: 2000,
    flux: join(repertoire, "run.jsonl"),
  });
  const fin = await supervise.fin;
  assert.equal(fin.erreur, null);
  assert.equal(fin.code, 0);
  const lu = JSON.parse(readFileSync(temoin, "utf8")) as { argv: string[]; entree: string };
  assert.equal(lu.entree, consigne);
  assert.ok(!lu.argv.some((arg) => arg.includes("é")));
});
